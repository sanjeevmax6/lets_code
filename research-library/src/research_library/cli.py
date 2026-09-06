import argparse
import json
from pathlib import Path
import sys
from .core import Library, digest, now, read_json
from .ingest import ingest_event, import_export, import_file
from .extract import run_extraction
from .analysis import prepare, submit, evidence, add_entity, add_relationship
from .views import rebuild, search, brief, graphify
from .validation import validate_item
from .core import write_json


def main():
    parser = argparse.ArgumentParser(description='Local research archive')
    parser.add_argument('--root', type=Path, default=Path.cwd())
    commands = parser.add_subparsers(dest='command', required=True)
    commands.add_parser('init')
    commands.add_parser('status')
    add = commands.add_parser('add')
    add.add_argument('text')
    imp = commands.add_parser('import')
    imp.add_argument('path', type=Path)
    imp.add_argument('--chat-id', required=True)
    imp.add_argument('--date-order', choices=['MDY', 'DMY', 'YMD'], default='MDY')
    imp.add_argument('--timezone', default='America/New_York')
    file = commands.add_parser('import-file')
    file.add_argument('path', type=Path)
    events = commands.add_parser('import-events')
    events.add_argument('path', type=Path)
    run = commands.add_parser('run')
    run.add_argument('--limit', type=int, default=25)
    run.add_argument('--retry', action='store_true')
    prep = commands.add_parser('prepare')
    prep.add_argument('--limit', type=int, default=25)
    sub = commands.add_parser('submit')
    sub.add_argument('path', type=Path)
    ev = commands.add_parser('evidence')
    ev.add_argument('item_id')
    ev.add_argument('quote')
    ev.add_argument('--occurrence', type=int, default=0)
    ent = commands.add_parser('entity')
    ent.add_argument('name')
    ent.add_argument('--kind', choices=['topic','person','organization','concept','paper'], default='topic')
    rel = commands.add_parser('relationship')
    rel.add_argument('path', type=Path)
    commands.add_parser('rebuild')
    commands.add_parser('doctor')
    find = commands.add_parser('search')
    find.add_argument('query')
    find.add_argument('--since')
    find.add_argument('--limit', type=int, default=20)
    digest_cmd = commands.add_parser('brief')
    digest_cmd.add_argument('--since', default='last-brief')
    graph = commands.add_parser('graph')
    graph.add_argument('action', choices=['rebuild','export','query'])
    graph.add_argument('query', nargs='?')
    args = parser.parse_args()
    library = Library(args.root)
    try:
        with library.lock():
            if args.command == 'init':
                result = {'initialized': str(library.root)}
            elif args.command == 'status':
                with library.db() as db:
                    result = [dict(r) for r in db.execute('SELECT * FROM jobs ORDER BY updated_at')]
            elif args.command == 'add':
                result = ingest_event(library, {'source':'manual', 'source_id':digest(now() + args.text), 'text': args.text})
            elif args.command == 'import':
                result = import_export(library, args.path, args.chat_id, args.date_order, args.timezone)
            elif args.command == 'import-file':
                result = import_file(library, args.path)
            elif args.command == 'import-events':
                result = []
                for line in args.path.read_text().splitlines():
                    if line.strip():
                        result.extend(ingest_event(library, json.loads(line)))
            elif args.command == 'run':
                if args.limit < 1:
                    raise ValueError('Limit must be positive')
                run_id = 'run_' + digest(now())[:16]
                result = run_extraction(library, args.limit, args.retry)
                result['analysis_packets'] = prepare(library, args.limit)
                result['views'] = rebuild(library)
                result['run_id'] = run_id
                write_json(library.path(f'runs/{run_id}/manifest.json'), result)
            elif args.command == 'prepare':
                result = prepare(library, args.limit)
            elif args.command == 'submit':
                result = {'published':submit(library,args.path), 'views':rebuild(library)}
            elif args.command == 'evidence':
                result = evidence(library,args.item_id,args.quote,args.occurrence)
            elif args.command == 'entity':
                result = add_entity(library,args.name,args.kind)
            elif args.command == 'relationship':
                result = add_relationship(library,args.path)
                rebuild(library)
            elif args.command == 'rebuild':
                result = rebuild(library)
            elif args.command == 'search':
                result = search(library,args.query,args.since,args.limit)
            elif args.command == 'brief':
                result = {'path':brief(library,args.since)}
            elif args.command == 'graph':
                if args.action == 'query' and not args.query:
                    raise ValueError('Supply a graph query')
                result = rebuild(library) if args.action == 'rebuild' else graphify(library,args.action,args.query)
            elif args.command == 'doctor':
                issues = []
                for item in library.items():
                    try:
                        validate_item(library,item)
                        for version in item['content_versions']:
                            if version['original_path'] and digest(library.path(version['original_path']).read_bytes()) != version['sha256']:
                                raise ValueError('Original checksum mismatch')
                    except Exception as exc:
                        issues.append({'id':item['id'],'error':str(exc)})
                result = {'issues':issues,'graphify_installed':(library.root/'.tools/bin/graphify').exists(),
                          'whatsapp_configured':bool(library.config().get('whatsapp_chat_id'))}
                if issues:
                    print(json.dumps(result,indent=2))
                    return 1
            print(json.dumps(result, indent=2, ensure_ascii=False))
    except Exception as exc:
        print(f'{type(exc).__name__}: {exc}', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
