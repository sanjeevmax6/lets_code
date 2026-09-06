from __future__ import annotations
import datetime as dt
import json
import mimetypes
from pathlib import Path
import re
from zoneinfo import ZoneInfo
from .core import canonical_url, digest, new_item, now, read_json, write_json, atomic_write

URL = re.compile(r'https?://[^\s<>"\u200e\u200f]+')
HEADER = re.compile(r'^\[?(\d{1,4}[/.-]\d{1,2}[/.-]\d{1,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[APap][Mm])?)\]?\s*(?:-\s*)?(.*)$')


def urls(text):
    return list(dict.fromkeys(m.group().rstrip('.,;!?)\u202c') for m in URL.finditer(text)))


def source_version(library, item, data, filename, mime):
    checksum = digest(data)
    for version in item['content_versions']:
        if version['sha256'] == checksum:
            return version
    suffix = Path(filename).suffix.lower()
    if not re.fullmatch(r'\.[a-z0-9]{1,8}', suffix):
        suffix = '.bin'
    base = f"vault/Raw/{item['id']}/{checksum[:20]}"
    relative = base + '/original' + suffix
    atomic_write(library.path(relative), data)
    version = {'id': 'version_' + checksum[:20], 'sha256': checksum, 'captured_at': now(),
               'mime_type': mime, 'original_path': relative, 'text_path': None, 'text_sha256': None,
               'pages_path': None, 'extractor': None}
    item['content_versions'].append(version)
    return version


def ingest_event(library, event):
    """Durable event first, then idempotent item publication. Call under writer lock."""
    event = dict(event)
    event_id = 'event_' + digest(event['source'] + ':' + event['source_id'])[:24]
    event['id'] = event_id
    event.setdefault('saved_at', now())
    event.setdefault('text', '')
    event.setdefault('attachments', [])
    event.setdefault('sender', None)
    event.setdefault('chat_id', None)
    # Replay must use preserved data, not changing external attachment paths.
    event_path = library.path(f'inbox/events/{event_id}.json')
    if event_path.exists():
        event = read_json(event_path)
    else:
        preserved = []
        for attachment in event['attachments']:
            path = Path(attachment['path']).resolve()
            max_bytes = library.config().get('max_download_bytes', 25 * 1024 * 1024)
            if path.stat().st_size > max_bytes:
                raise ValueError('Attachment exceeds configured size limit')
            data = path.read_bytes()
            name = Path(attachment.get('name', path.name)).name
            relative = f'inbox/events/{event_id}/{digest(data)[:20]}/{name}'
            atomic_write(library.path(relative), data)
            preserved.append({'path': relative, 'name': name,
                              'mime': attachment.get('mime') or mimetypes.guess_type(name)[0] or 'application/octet-stream'})
        event['attachments'] = preserved
        write_json(event_path, event)
    result = []
    inputs = [('url', u) for u in urls(event['text'])]
    inputs += [('file', a) for a in event['attachments']]
    if not inputs:
        inputs = [('text', event['text'])]
    for mode, value in inputs:
        data = None
        if mode == 'url':
            url = canonical_url(value)
            key, kind = url, 'x_post' if re.match(r'https?://x.com/', url) else 'article'
        elif mode == 'file':
            data = library.path(value['path']).read_bytes()
            key, kind, url = digest(data), 'pdf' if data.startswith(b'%PDF-') else 'attachment', None
        else:
            data = value.encode('utf-8')
            key, kind, url = event_id, 'text', None
        item_id = 'item_' + digest(key)[:24]
        path = library.item_path(item_id)
        item = read_json(path) if path.exists() else new_item(item_id, kind, value if mode == 'url' else url, event_id, event['saved_at'])
        if event_id not in item['capture_events']:
            item['capture_events'].append(event_id)
            item['user_comment_refs'].append(event_id)
        if mode in {'file', 'text'}:
            source_version(library, item, data, value['name'] if mode == 'file' else 'message.txt',
                           value['mime'] if mode == 'file' else 'text/plain')
            if item['retrieval']['status'] == 'pending':
                item['retrieval'].update(status='captured', method='local', retrieved_at=now())
        if mode == 'url' and kind == 'x_post':
            match = re.search(r'/status/(\d+)', url)
            if match:
                item['identifiers']['x_post_id'] = match[1]
        library.save(item)
        # Do not reset an already progressed job on duplicate imports.
        with library.db() as db:
            exists = db.execute('SELECT 1 FROM jobs WHERE item_id=?', (item_id,)).fetchone()
        if not exists:
            library.job(item_id, 'captured' if item['content_versions'] else 'queued')
        result.append(item_id)
    return result


def import_file(library, path):
    path = Path(path).resolve()
    return ingest_event(library, {'source': 'file', 'source_id': digest(path.read_bytes()), 'text': '',
                                 'attachments': [{'path': str(path)}]})


def import_export(library, path, chat_id, date_order='MDY', timezone='America/New_York'):
    path = Path(path).resolve()
    text = path.read_text(encoding='utf-8-sig')
    messages = []
    for line in text.splitlines():
        line = line.replace('\u200e', '').replace('\u200f', '').replace('\u202f', ' ')
        match = HEADER.match(line)
        if match:
            messages.append([match.group(1), match.group(2), match.group(3)])
        elif messages:
            messages[-1][2] += '\n' + line
    if not messages:
        raise ValueError('No WhatsApp messages found; use add or import-file for ordinary text')
    result, counts = [], {}
    for date, clock, body in messages:
        values = re.split(r'[/.-]', date)
        order = 'YMD' if len(values[0]) == 4 else date_order
        parts = dict(zip(order, map(int, values)))
        year = parts['Y'] + (2000 if parts['Y'] < 100 else 0)
        fmt = '%I:%M:%S %p' if clock.count(':') == 2 else '%I:%M %p'
        if not re.search('[ap]m', clock, re.I):
            fmt = '%H:%M:%S' if clock.count(':') == 2 else '%H:%M'
        clock = re.sub(r'\s*([ap]m)$', r' \1', clock, flags=re.I).upper()
        time = dt.datetime.strptime(clock, fmt).time()
        stamp = dt.datetime.combine(dt.date(year, parts['M'], parts['D']), time, ZoneInfo(timezone)).astimezone(dt.timezone.utc).isoformat()
        sender, separator, content = body.partition(': ')
        if not separator:  # WhatsApp system notice
            continue
        fingerprint = digest(json.dumps([chat_id, stamp, sender, content], ensure_ascii=False))
        occurrence = counts.get(fingerprint, 0)
        counts[fingerprint] = occurrence + 1
        attachments = []
        # WhatsApp export variants; only resolve files adjacent to this export.
        names = re.findall(r'<attached:\s*([^>]+)>', content)
        names += re.findall(r'^(.+?)\s+\(file attached\)', content, re.M)
        for name in names:
            local = (path.parent / name.strip()).resolve()
            if local.parent != path.parent or not local.is_file():
                continue
            attachments.append({'path': str(local)})
        result += ingest_event(library, {'source': 'whatsapp-export', 'source_id': f'{fingerprint}:{occurrence}',
                   'chat_id': chat_id, 'saved_at': stamp, 'sender': sender, 'text': content, 'attachments': attachments})
    return result
