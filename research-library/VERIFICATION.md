# Build verification — September 6, 2026

## Installed locally

- Python environment and locked dependencies in `.venv/`.
- Graphify `graphifyy[pdf]==0.9.55` under `.tools/`.
- Official Obsidian 1.13.7 under `apps/Obsidian.app`; code signature and macOS assessment passed with trust-service access. The research `vault/` was opened in Obsidian and its Start Here note verified in the UI.
- WhatsApp connector dependencies installed. A Puppeteer 25.10.0 override removes the vulnerable archive-download helper from the dependency tree. Its ESM module is preloaded for compatibility with the upstream CommonJS client. Separate Chrome launch and WhatsApp Client construction passed; actual authenticated WhatsApp behavior is still unverified.
- Chrome native host registered for extension ID `dgkanemkmkknancnkdfammgbpppkpaho`. A real framed lookup through the installed launcher passed.

## Checks performed

- 18 Python tests: canonicalization, durable state, repeated imports, comments, multiline/date-specific WhatsApp exports, attachment replay, real PDF text/page extraction with synthetic fixtures, batch failure isolation, private-network rejection, quote validation, existing-analysis preservation, search/rebuild, personal-note preservation, brief watermarks, staged-draft preservation, native protocol, schema parity, recovery from a stale queue checkpoint, ID path validation, and bilateral evidence for claim relationships.
- 2 Node tests: incoming/outgoing chat allowlisting, deterministic event identities, edit revisions.
- Real public HTTPS extraction from example.org into a temporary library passed.
- Installed Graphify successfully queried a synthetic topic and reached its source note, then exported HTML.
- Chrome panel UI states tested in a separate headless browser using a synthetic native-host response: saved record, missing record, queue action, quote-match report, and host error. Preview visually inspected at `derived/qa/chrome-panel.png`. This is a UI test, not a claim that the extension has been activated in the user's normal browser.
- Final npm dependency audit: zero reported vulnerabilities in the connector's locked dependency tree.
- Git ignore checks confirm raw files, private configuration, runtime state, installed applications, and tools are excluded.

## Activation and limits

- WhatsApp has not been paired; the user must choose a chat and scan the Linked Devices QR. Real media download and sleep/reconnect backfill cannot be verified before pairing.
- The Chrome extension is built and its native host installed; load `extension/` using Chrome's Load unpacked control to activate it in the regular browser.
- The live vault starts empty. Synthetic test data remains separate from the user's library.
- `library run` captures/extracts and stages analysis. An interactive agent must continue through reading and `library submit`; no unattended model backend is configured.
- Automated OCR, an official always-on WhatsApp receiver, and a dedicated local-model adapter remain optional future work. Blocked/X sources can be retained as links or supplemented with captured UTF-8 text.
- Firecrawl fallback is implemented but was not exercised against a paid account; no key was supplied.
- The same documented workflow and schema support either agent. This build was exercised here; a separate Claude session has not been run.

## Development stages

1. Durable storage and metadata contracts.
2. Chat/file intake and preserved extraction evidence.
3. Validated analysis, search, graph, Obsidian notes, and briefs.
4. WhatsApp collector and Chrome reading companion.
5. Recovery, stricter provenance validation, onboarding, and verification documentation.

Each stage is committed and pushed to `codex/research-library` on the existing repository. The pre-existing `app/globals.css` working-tree edit was excluded.
