import argparse
import json
from pathlib import Path
from .core import Library


def main():
    parser = argparse.ArgumentParser(description='Local research archive')
    parser.add_argument('--root', type=Path, default=Path.cwd())
    commands = parser.add_subparsers(dest='command', required=True)
    commands.add_parser('init')
    commands.add_parser('status')
    args = parser.parse_args()
    library = Library(args.root)
    with library.lock():
        if args.command == 'init':
            print(f'Initialized {library.root}')
        elif args.command == 'status':
            with library.db() as db:
                print(json.dumps([dict(r) for r in db.execute('SELECT * FROM jobs ORDER BY updated_at')], indent=2))


if __name__ == '__main__':
    main()
