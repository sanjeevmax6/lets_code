import socket
import pytest
from pypdf import PdfWriter
from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject
from research_library.core import Library
from research_library.ingest import ingest_event, import_export, import_file
from research_library.extract import run_extraction, public_addresses


@pytest.fixture
def library(tmp_path):
    lib = Library(tmp_path/'library')
    lib.init()
    return lib


def test_duplicate_article_preserves_comments_and_events(library):
    first = ingest_event(library, {'source':'test','source_id':'1','text':'First https://example.org/a?utm_source=x'})
    second = ingest_event(library, {'source':'test','source_id':'2','text':'Read this https://example.org/a'})
    assert first == second
    assert len(library.item(first[0])['capture_events']) == 2
    ingest_event(library, {'source':'test','source_id':'2','text':'Read this https://example.org/a'})
    assert len(library.item(first[0])['capture_events']) == 2


def test_export_multiline_replay(library, tmp_path):
    export = tmp_path/'chat.txt'
    export.write_text('[06/09/2026, 10:30:00] Me: https://example.org/a\nA comment\n[06/09/2026, 10:31:00] Me: https://example.org/b\n')
    ids = import_export(library, export, 'reading', 'DMY')
    assert len(ids) == 2
    assert library.item(ids[0])['first_saved_at'].startswith('2026-09-06')
    assert ids == import_export(library, export, 'reading', 'DMY')
    assert len(library.items()) == 2


def test_extract_local_text_and_replay_after_loss_of_original(library, tmp_path):
    path = tmp_path/'note.txt'
    path.write_text('A scientific observation with reproducible evidence.')
    event = {'source':'test','source_id':'file','attachments':[{'path':str(path)}]}
    ids = ingest_event(library, event)
    path.unlink()
    assert ingest_event(library, event) == ids
    report = run_extraction(library)
    assert report['extracted'] == ids
    item = library.item(ids[0])
    assert item['retrieval']['coverage'] == 'full'
    assert library.path(item['content_versions'][0]['text_path']).read_text().startswith('A scientific')


def test_pdf_bytes_pages_and_dedup(library, tmp_path):
    path = tmp_path/'paper.pdf'
    writer = PdfWriter()
    page = writer.add_blank_page(width=600, height=800)
    font = DictionaryObject({NameObject('/Type'):NameObject('/Font'), NameObject('/Subtype'):NameObject('/Type1'), NameObject('/BaseFont'):NameObject('/Helvetica')})
    page[NameObject('/Resources')] = DictionaryObject({NameObject('/Font'):DictionaryObject({NameObject('/F1'):writer._add_object(font)})})
    stream = DecodedStreamObject()
    stream.set_data(b'BT /F1 12 Tf 50 700 Td (A paper with measured evidence.) Tj ET')
    page[NameObject('/Contents')] = writer._add_object(stream)
    writer.write(path)
    ids = import_file(library, path)
    assert ids == import_file(library, path)
    assert run_extraction(library)['extracted'] == ids
    item = library.item(ids[0])
    version = item['content_versions'][0]
    assert library.path(version['original_path']).read_bytes() == path.read_bytes()
    assert version['pages_path'] and 'measured evidence' in library.path(version['text_path']).read_text()


def test_blocked_download_does_not_block_other_items(library, tmp_path, monkeypatch):
    ingest_event(library, {'source':'test','source_id':'url','text':'https://example.org/no'})
    path = tmp_path/'note.txt'; path.write_text('Readable note')
    ids = import_file(library, path)
    def failed(*args, **kwargs): raise ValueError('HTTP 403')
    monkeypatch.setattr('research_library.extract.fetch', failed)
    report = run_extraction(library)
    assert report['extracted'] == ids and len(report['failed']) == 1
    assert not run_extraction(library)['failed']
    assert len(run_extraction(library, retry=True)['failed']) == 1


def test_private_network_rejected(monkeypatch):
    monkeypatch.setattr(socket, 'getaddrinfo', lambda *a, **k: [(2, 1, 6, '', ('127.0.0.1', 80))])
    with pytest.raises(ValueError, match='non-public'): public_addresses('example.org', 80)
