# Research library

Save links and PDFs in a dedicated WhatsApp chat. When you return to your laptop, ask your agent to run this folder's pipeline. It preserves sources, validates evidence-backed JSON, builds a searchable graph, and renders an Obsidian reading vault.

## Everyday use

1. In **Job to-do**, send `!add <link>`, caption a PDF `!add`, or reply to a link/PDF with `!add`. Only your commands are collected.
2. Back at your laptop, open this folder in Codex or Claude and ask:
   **“Read AGENTS.md and docs/WORKFLOW.md. Sync WhatsApp, process pending sources, submit their analysis, rebuild the graph, and summarize what I saved.”**
3. Open `apps/Obsidian.app` → the `vault/` folder → **Start Here** to browse notes, sources, and topics.

Collection runs on demand; no bot replies appear in WhatsApp. No daily pairing is needed. Catch-up uses limited linked-device history, so sync regularly.

To collect manually (this queues items; ask the agent above to analyze them):

```sh
cd "/Users/sanjeev/Documents/New project/research-library"
.venv/bin/library sync whatsapp
.venv/bin/library status
```

## Ready on this Mac

Python dependencies and Graphify 0.9.55 are installed locally. Obsidian 1.13.7 is in `apps/Obsidian.app`. The Chrome native host is registered. Private data and applications are excluded from Git.

The Chrome extension is loaded on this Mac. WhatsApp is paired with **Job to-do**; reconnect and duplicate prevention were verified. The library also works with exported chats, files, or manually added URLs.

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
.venv/bin/library sync whatsapp --pair --group "Job to-do"  # first setup
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

In Job to-do, send `!add URL`, caption a PDF `!add`, or reply `!add` to a link/PDF. The collector accepts only your commands. Run `sync whatsapp --watch` for capture while the laptop stays awake, or normal sync for bounded catch-up. No automated messages are sent into the group. The initial pairing settling period is a mitigation; a successful subsequent sync is required to verify that the login persisted.

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
