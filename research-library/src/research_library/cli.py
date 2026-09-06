import argparse
import json
from pathlib import Path
import sys
from .core import Library, digest, now, read_json
from .ingest import ingest_event, import_export, import_file
from .extract import run_extraction


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
                result = run_extraction(library, args.limit, args.retry)
            print(json.dumps(result, indent=2, ensure_ascii=False))
    except Exception as exc:
        print(f'{type(exc).__name__}: {exc}', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
