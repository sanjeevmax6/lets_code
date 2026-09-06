#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
uv sync --locked
UV_TOOL_DIR="$PWD/.tools" UV_TOOL_BIN_DIR="$PWD/.tools/bin" uv tool install 'graphifyy[pdf]==0.9.55'
.venv/bin/library init
.venv/bin/library rebuild
printf '%s\n' 'Ready. Open vault/ in Obsidian. See README.md for WhatsApp and browser setup.'
