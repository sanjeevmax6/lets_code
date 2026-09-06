import io
import json
import struct
from research_library.core import Library
from research_library.native import serve, handle


def test_native_lookup_and_explicit_enqueue(tmp_path):
    library = Library(tmp_path); library.init()
    assert handle(library, {'action':'lookup','url':'https://example.org/a'})['found'] is False
    handle(library, {'action':'enqueue','url':'https://example.org/a?utm_source=x'})
    result = handle(library, {'action':'lookup','url':'https://example.org/a'})
    assert result['found'] and result['summary'] is None and result['obsidian_url'].startswith('obsidian://open?')


def test_native_protocol_and_unsupported_commands(tmp_path):
    library = Library(tmp_path); library.init()
    data = json.dumps({'action':'execute','url':'https://example.org'}).encode()
    incoming = io.BytesIO(struct.pack('=I',len(data))+data); outgoing = io.BytesIO()
    serve(library,incoming,outgoing)
    output=outgoing.getvalue()
    assert struct.unpack('=I',output[:4])[0] == len(output[4:])
    assert json.loads(output[4:])['error'] == 'Unsupported operation'
    outgoing=io.BytesIO(); serve(library,io.BytesIO(struct.pack('=I',2000000)),outgoing)
    assert outgoing.getvalue() == b''
