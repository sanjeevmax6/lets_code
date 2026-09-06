from __future__ import annotations
import http.client
import ipaddress
import json
import os
from pathlib import Path
import socket
import ssl
from urllib.parse import urlsplit, urljoin
from bs4 import BeautifulSoup
from pypdf import PdfReader
from .core import atomic_write, digest, now, write_json
from .ingest import source_version


class FetchError(ValueError):
    pass


def public_addresses(host, port):
    infos = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    addresses = list(dict.fromkeys(info[4][0] for info in infos))
    if not addresses or any(not ipaddress.ip_address(ip).is_global for ip in addresses):
        raise FetchError('Refusing non-public network destination')
    return addresses


def fetch(url, max_bytes=25*1024*1024, timeout=30, method='GET', body=None, headers=None):
    """Resolve and pin a public address on every hop, preserving HTTPS SNI."""
    for _ in range(6):
        parts = urlsplit(url)
        if parts.scheme not in {'http', 'https'} or not parts.hostname or parts.username or parts.password:
            raise FetchError('Only public HTTP(S) URLs without credentials are supported')
        port = parts.port or (443 if parts.scheme == 'https' else 80)
        if port not in {80, 443}:
            raise FetchError('Only ports 80 and 443 are supported')
        address = public_addresses(parts.hostname, port)[0]
        cls = http.client.HTTPSConnection if parts.scheme == 'https' else http.client.HTTPConnection
        conn = cls(parts.hostname, port, timeout=timeout)
        # HTTPConnection calls this with its hostname; pin to the validated address.
        conn._create_connection = lambda *args, **kwargs: socket.create_connection((address, port), timeout)
        try:
            target = parts.path or '/'
            if parts.query:
                target += '?' + parts.query
            conn.request(method, target, body=body, headers={'User-Agent': 'PersonalResearchLibrary/0.1', 'Accept-Encoding': 'identity', **(headers or {})})
            response = conn.getresponse()
            if response.status in {301, 302, 303, 307, 308}:
                if method != 'GET':
                    raise FetchError('Refusing authenticated API redirect')
                location = response.getheader('Location')
                if not location:
                    raise FetchError('Redirect missing Location')
                url = urljoin(url, location)
                continue
            if response.status >= 400:
                raise FetchError(f'HTTP {response.status}')
            size = response.getheader('Content-Length')
            if size and int(size) > max_bytes:
                raise FetchError('Download exceeds configured size limit')
            data = response.read(max_bytes + 1)
            if len(data) > max_bytes:
                raise FetchError('Download exceeds configured size limit')
            return data, response.getheader('Content-Type', '').split(';')[0], url, response.status
        finally:
            conn.close()
    raise FetchError('Too many redirects')


def firecrawl(url, config):
    key = os.environ.get('FIRECRAWL_API_KEY')
    if not key:
        raise FetchError('Firecrawl enabled but FIRECRAWL_API_KEY is not set')
    # Check the target too; never use the remote service to fetch local addresses.
    parts = urlsplit(url)
    public_addresses(parts.hostname, parts.port or 443)
    payload = json.dumps({'url': url, 'formats': ['markdown'], 'onlyMainContent': True}).encode()
    data, _, _, _ = fetch(config.get('firecrawl_endpoint', 'https://api.firecrawl.dev/v2/scrape'),
                          max_bytes=config.get('max_download_bytes', 25*1024*1024), method='POST', body=payload,
                          headers={'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json'}, timeout=60)
    result = json.loads(data)
    if not result.get('success') or not result.get('data', {}).get('markdown'):
        raise FetchError('Firecrawl did not return article text')
    return result['data']['markdown'], result['data'].get('metadata', {})


def extract_item(library, item):
    config = library.config()
    max_bytes = config.get('max_download_bytes', 25*1024*1024)
    version = item['content_versions'][-1] if item['content_versions'] else None
    if version is None:
        data, mime, resolved, status = fetch(item['original_url'], max_bytes, config.get('fetch_timeout_seconds', 30))
        is_pdf = data.startswith(b'%PDF-')
        suffix = 'source.pdf' if is_pdf else 'source.html'
        version = source_version(library, item, data, suffix, 'application/pdf' if is_pdf else mime or 'text/html')
        item['retrieval'].update(status='captured', method='http', retrieved_at=now(), http_status=status)
        # Persist capture before extraction, so a parser failure never loses the download.
        library.save(item)
        library.job(item['id'], 'captured')
    path = library.path(version['original_path'])
    mime = version['mime_type']
    pages, text, coverage, extractor = [], '', 'full', None
    if mime == 'application/pdf' or path.read_bytes()[:5] == b'%PDF-':
        item['kind'] = 'pdf'
        reader = PdfReader(path)
        cap = config.get('max_pdf_pages', 150)
        chunks, offset, empty = [], 0, 0
        for number, page in enumerate(reader.pages[:cap], 1):
            value = page.extract_text() or ''
            empty += not value.strip()
            pages.append({'page': number, 'start': offset, 'end': offset + len(value)})
            chunks.append(value)
            offset += len(value) + 2
        text = '\n\n'.join(chunks)
        coverage = 'partial' if len(reader.pages) > cap or empty else 'full'
        if not text.strip():
            raise FetchError('PDF has no extractable text; OCR required (original preserved)')
        if not item['title'] and reader.metadata:
            item['title'] = reader.metadata.title or None
        extractor = 'pypdf'
    elif mime in {'text/plain', 'text/markdown'}:
        text = path.read_text(encoding='utf-8', errors='replace')
        extractor = 'utf8'
    elif mime in {'text/html', 'application/xhtml+xml'}:
        soup = BeautifulSoup(path.read_bytes(), 'html.parser')
        if not item['title']:
            item['title'] = soup.title.get_text(' ', strip=True) if soup.title else None
        # Public paper landing pages often advertise the canonical PDF this way.
        pdf = soup.find('meta', attrs={'name': 'citation_pdf_url'})
        if pdf and pdf.get('content'):
            pdf_url = urljoin(item['original_url'], pdf['content'])
            try:
                pdf_data, _, _, _ = fetch(pdf_url, max_bytes, config.get('fetch_timeout_seconds', 30))
                if pdf_data.startswith(b'%PDF-'):
                    source_version(library, item, pdf_data, 'paper.pdf', 'application/pdf')
                    library.save(item)
                    return extract_item(library, item)
            except (OSError, ValueError, http.client.HTTPException):
                pass  # Landing-page content remains available, with partial coverage.
        for tag in soup(['script', 'style', 'nav', 'footer', 'header', 'noscript', 'form']):
            tag.decompose()
        main = soup.find('article') or soup.find('main') or soup.body or soup
        text = main.get_text('\n', strip=True)
        coverage = 'partial'  # HTML extraction cannot prove full article coverage.
        extractor = 'beautifulsoup4'
        if item['kind'] == 'x_post':
            # A login shell is not the post. Keep link-only unless supplied readable text.
            raise FetchError('X post needs an accessible text capture; URL and response preserved')
        if len(text.strip()) < 120:
            if config.get('firecrawl_enabled'):
                text, metadata = firecrawl(item['original_url'], config)
                extractor = 'firecrawl-v2'
                item['title'] = item['title'] or metadata.get('title')
            else:
                raise FetchError('Insufficient article text; browser capture or Firecrawl needed')
    else:
        item['retrieval'].update(status='unsupported', coverage='none', error=f'Unsupported MIME type: {mime}')
        library.save(item)
        library.job(item['id'], 'unsupported')
        return
    if not text.strip():
        raise FetchError('No readable content extracted')
    base = str(Path(version['original_path']).parent)
    version['text_path'] = base + '/text.txt'
    version['text_sha256'] = digest(text)
    version['extractor'] = extractor
    atomic_write(library.path(version['text_path']), text)
    if pages:
        version['pages_path'] = base + '/pages.json'
        write_json(library.path(version['pages_path']), pages)
    item['retrieval'].update(status='extracted', coverage=coverage, error=None)
    library.save(item)
    library.job(item['id'], 'extracted', attempted=True)


def run_extraction(library, limit=25, retry=False):
    report = {'extracted': [], 'failed': []}
    with library.db() as db:
        stages = "'queued','captured','failed','blocked'" if retry else "'queued','captured'"
        jobs = db.execute(f'SELECT item_id FROM jobs WHERE stage IN ({stages}) ORDER BY updated_at LIMIT ?', (limit,)).fetchall()
    for job in jobs:
        item = library.item(job['item_id'])
        try:
            extract_item(library, item)
            if item['retrieval']['status'] == 'extracted':
                report['extracted'].append(item['id'])
        except Exception as exc:
            # Keep the batch progressing; the manifest records the exact failing stage.
            error = f'{type(exc).__name__}: {exc}'[:500]
            item['retrieval'].update(status='blocked', coverage='link_only' if item['original_url'] else 'none', error=error)
            library.save(item)
            library.job(item['id'], 'blocked', error, attempted=True)
            report['failed'].append({'id': item['id'], 'error': error})
    return report
