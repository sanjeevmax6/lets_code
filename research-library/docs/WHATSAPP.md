# WhatsApp intake

## Reliable fallback: exported chat

Export the dedicated chat on your phone and place the text file and exported media together in `inbox/imports/`. Unzip an exported archive first using your normal file manager.

```sh
.venv/bin/library import inbox/imports/chat.txt --chat-id reading --date-order MDY --timezone America/New_York
.venv/bin/library run
```

Use `DMY` for day/month/year exports. Export timestamps are interpreted in the specified timezone. System notices are skipped; multiline messages and multiple URLs are retained. Missing exported attachments cannot be reconstructed; original message text remains available. Reimporting an export is safe. Export-based fingerprints and API message IDs are different, so mixed intake modes may retain duplicate capture events while deduplicating linked articles.

## Local linked-device collector

Requirements: Node 22.12+ and Google Chrome installed. The lockfile includes a patched Puppeteer override; `browser-smoke.mjs` verifies launch and client construction. Actual account behavior remains dependent on WhatsApp Web.

```sh
cd connectors/whatsapp
npm ci
cd ../..
.venv/bin/library sync whatsapp --self
```

`--self` selects your Message Yourself chat and saves its ID locally. Scan the displayed QR using WhatsApp Settings → Linked Devices. The QR and session files are credentials; do not share them.

For another existing chat:

```sh
.venv/bin/library sync whatsapp --list
```

Copy the chosen ID into `config.local.json` as `whatsapp_chat_id`, then:

```sh
.venv/bin/library sync whatsapp --limit 250
.venv/bin/library run
```

`--list` displays chat names/IDs for selection without importing their contents. The collector imports only the configured chat. It never sends messages or explicitly marks chats read. Linked-device authentication itself still exposes the broader account to the client library.

The default session directory is `~/.local/share/research-library/whatsapp-session`, outside this library. Override using `whatsapp_session_dir` in local configuration if necessary, keeping it outside the project. `CHROME_EXECUTABLE` can point to another compatible Chrome binary. The collector uses a separate browser profile, not your regular Chrome session.

`--watch` keeps listening while the process and laptop are awake. Normal sync inspects a bounded history window; it does **not** claim a complete backfill. Increasing `--limit` (maximum 5000) can help, but exported-chat import remains the recovery path. Unavailable attachments are reported for retry; successfully imported messages are checkpointed only after Python ingestion succeeds.

The connector is unofficial. Its maintainers warn that account blocking is possible. A dedicated official business inbox and always-on receiver are a separate deployment option, not implemented here.

## Pairing acceptance check

After pairing, send a URL with a comment and a PDF to the selected chat. Sync twice; confirm no duplicate item records. Sleep/restart the laptop, send another item, and inspect what backfills. Verify `library status` and `library doctor`. We cannot establish account-specific catch-up guarantees without this real test.
