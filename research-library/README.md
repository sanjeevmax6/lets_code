# Research library

Save links and PDFs in a dedicated WhatsApp chat. When you return to your laptop, ask your agent to run this folder's pipeline. It preserves sources, validates evidence-backed JSON, builds a searchable graph, and renders an Obsidian reading vault.

## Ready on this Mac

Python dependencies and Graphify 0.9.55 are installed locally. Obsidian 1.13.7 is in `apps/Obsidian.app`. The Chrome native host is registered. Private data and applications are excluded from Git.

Two user setup steps remain: pair/select a WhatsApp chat, and load the unpacked Chrome extension. The library also works immediately with exported chats, files, or manually added URLs.

```sh
cd research-library
.venv/bin/library add 'https://example.org/article'
.venv/bin/library import-file /path/to/paper.pdf
.venv/bin/library run --limit 25
```

Then ask your agent: **“Read the staged sources, complete and submit their analysis, build the graph, and summarize what I saved.”** `run` performs capture/extraction and prepares JSON packets; it deliberately does not pretend to perform model analysis by itself. [Shared workflow](docs/WORKFLOW.md) works with either agent.

Open `apps/Obsidian.app` and choose `vault/` as an existing vault. Start with **Start Here**. Notes link to the source URL, preserved files, evidence, and related topics. Keep personal writing in `vault/Personal/`.

## Daily commands

```sh
.venv/bin/library sync whatsapp --self        # first pairing for Message Yourself
.venv/bin/library sync whatsapp              # later local sync
.venv/bin/library run --limit 25              # capture and prepare work
.venv/bin/library status
.venv/bin/library search 'battery capacity'
.venv/bin/library graph query 'Batteries'
.venv/bin/library graph export
.venv/bin/library brief --since last-brief
.venv/bin/library doctor
```

For an existing dedicated chat, follow [WhatsApp setup](docs/WHATSAPP.md). For cached highlights beside an article, follow [Chrome setup](docs/BROWSER.md).

## New machine

Install Python 3.11+, uv, Node 22.12+, Chrome, and Obsidian. Run `scripts/bootstrap.sh`, then `npm ci --prefix connectors/whatsapp` if using WhatsApp. Run the native-host installer for Chrome. Obsidian and private source data are not distributed through Git. See [backup/recovery](docs/RECOVERY.md).

## Files and contracts

- `records/`: authoritative item, entity, and relationship JSON.
- `schemas/`: strict versioned contracts; bundled copies under `src/` are tested for parity.
- `inbox/events/`: preserved message envelopes and attachments.
- `vault/Raw/`: original bytes, checksums, extracted text, PDF page maps.
- `vault/Sources/`, `vault/Topics/`, `vault/Briefs/`: generated reading notes.
- `derived/`: rebuildable SQLite full-text index and Graphify graph.
- `staging/`: agent drafts; only `library submit` publishes them.
- `runs/`: batch manifests and prior analysis archives.

Local extraction is the default. Optional Firecrawl fallback uses `firecrawl_enabled` in `config.local.json` and `FIRECRAWL_API_KEY` in the process environment. Do not copy keys into JSON or prompts. Saved articles and PDFs can be analyzed through your existing interactive agent. Fully local inference, automatic OCR, and an official always-on WhatsApp receiver are future adapters.

## Verify

```sh
.venv/bin/python -m pytest -q
npm test --prefix connectors/whatsapp
node connectors/whatsapp/browser-smoke.mjs
```

The main repository also contains the existing IDE project. This library's private artifacts are ignored, and development commits stay scoped to `research-library/`.
