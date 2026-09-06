"""Chrome native messaging bridge. JSON framing only on stdout."""
import json
import struct
import sys
from pathlib import Path
from urllib.parse import urlencode
from .core import Library, canonical_url, digest, now
from .ingest import ingest_event

MAX_MESSAGE = 1024 * 1024


def handle(library, request):
    if not isinstance(request, dict):
        raise ValueError('Expected an object')
    url = canonical_url(request.get('url', ''))
    action = request.get('action')
    if action == 'enqueue':
        with library.lock():
            return {'queued':ingest_event(library, {'source':'chrome','source_id':digest(now()+url),'text':url})}
    if action != 'lookup':
        raise ValueError('Unsupported operation')
    found = next((i for i in library.items() if i['canonical_url'] == url), None)
    if not found:
        return {'found':False,'url':url}
    related = []
    topic_ids = set(found['analysis']['topic_ids'])
    for other in library.items():
        if other['id'] != found['id'] and topic_ids.intersection(other['analysis']['topic_ids']):
            related.append({'title':other['title'] or other['original_url'] or other['id'], 'url':other['original_url']})
    note = str(library.path(f"vault/Sources/{found['id']}.md"))
    return {'found':True,'title':found['title'] or found['original_url'], 'coverage':found['retrieval']['coverage'],
            'status':found['analysis']['status'],'summary':found['analysis']['summary'],
            'highlights':found['analysis']['highlights'],'provenance':found['analysis']['provenance'],
            'related':related[:10],'obsidian_url':'obsidian://open?' + urlencode({'path':note})}


def serve(library, incoming, outgoing):
    while True:
        header = incoming.read(4)
        if not header:
            return
        if len(header) != 4:
            return
        size = struct.unpack('=I', header)[0]
        if size > MAX_MESSAGE:
            return
        data = incoming.read(size)
        if len(data) != size:
            return
        try:
            response = handle(library,json.loads(data))
        except Exception as exc:
            response = {'error':str(exc)[:300]}
        encoded = json.dumps(response).encode()
        if len(encoded) > MAX_MESSAGE:
            encoded = b'{"error":"Result too large; open the source note in Obsidian"}'
        outgoing.write(struct.pack('=I',len(encoded)) + encoded)
        outgoing.flush()


def main():
    root = Path(sys.argv[1]).resolve()
    serve(Library(root),sys.stdin.buffer,sys.stdout.buffer)


if __name__ == '__main__':
    main()
