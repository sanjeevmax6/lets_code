#!/usr/bin/env python3
"""Install a host manifest restricted to this extension's stable public key."""
import json
from pathlib import Path
import shlex

root = Path(__file__).resolve().parents[1]
extension_id = (root/'extension/extension-id.txt').read_text().strip()
launcher = root/'state/native-host'
launcher.parent.mkdir(parents=True,exist_ok=True)
launcher.write_text('#!/bin/sh\nexec ' + shlex.quote(str(root/'.venv/bin/python')) + ' -m research_library.native ' + shlex.quote(str(root)) + ' "$@"\n')
launcher.chmod(0o700)
manifest = {'name':'org.research_library.reader','description':'Local research library reader','path':str(launcher),'type':'stdio','allowed_origins':[f'chrome-extension://{extension_id}/']}
path = Path.home()/'Library/Application Support/Google/Chrome/NativeMessagingHosts/org.research_library.reader.json'
path.parent.mkdir(parents=True,exist_ok=True)
path.write_text(json.dumps(manifest,indent=2)+'\n')
path.chmod(0o600)
print(f'Installed {path}')
print(f'Load unpacked extension: {root / "extension"}')
