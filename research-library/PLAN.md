# Personal research library — implementation plan

Prepared September 6, 2026. Status: proposal only; no packages installed or accounts connected.

## Intended experience

Send links, papers, and short comments to one dedicated WhatsApp reading chat during the day. Later, open this folder with an agent and ask “run the pipeline.” It collects available messages, preserves sources, produces validated metadata, updates a graph and Obsidian notes, and reports what was added or could not be read.

Ask “summarize what I saved since Friday” for a cited reading brief, or open an individual Obsidian note for highlights, related reading, and the original. A later Chrome extension displays the same stored highlights beside the live article. There is no custom dashboard or separate summarizer application.

The durable product is the folder. Agents and tools are replaceable.

## Recommended decisions

| Component | Recommendation | Reason |
|---|---|---|
| Intake | Dedicated WhatsApp reading chat; export import first, local connector experiment next | Prove the library independently of WhatsApp automation |
| Processing | Explicit, on-demand local CLI run | Fits the laptop workflow and avoids unattended model spend |
| Extraction | Local HTML/PDF extraction, optional Firecrawl fallback | Simple pages and PDFs should not require a hosted scraper |
| Metadata | Versioned JSON Schema and one JSON record per item | Portable, inspectable, searchable, agent independent |
| Search | Rebuildable SQLite full-text index | No database service or vector infrastructure initially |
| Graph | Graphify behind an adapter, plus our own provenance records | Graph output must not dictate or replace archival storage |
| Reading interface | Obsidian vault with Markdown notes and linked PDFs | Existing reader, backlinks, search, graph, and personal notes |
| Browser interface | Chrome side panel in a later phase | Reuses completed analysis and adds in-page evidence highlights |
| Agent portability | Shared workflow instructions and schema; thin agent-specific entry files | The workflow must survive switching agents mid-batch |

## WhatsApp intake: the important tradeoff

There are two queues: messages waiting in WhatsApp, and messages actually captured into the local durable queue. When the laptop is asleep, the second does not advance unless an always-on receiver exists. Do not describe ordinary WhatsApp history as a guaranteed archival queue.

### A. Export import — baseline and recovery path

Create a dedicated chat or use a self-chat for reading. Export that chat and place its export and available attachments in `inbox/imports/`. The importer handles date/locale variants, multiline messages, multiple URLs, captions, and attachments. Repeated exports deduplicate using stable source identifiers where available, otherwise a documented fingerprint with collision handling. Export limits and missing media must be reported rather than silently treated as complete history.

This is a manual intake step, but establishes a usable end-to-end system even if automatic integration proves fragile.

### B. Local linked-device collector — preferred convenience experiment

Evaluate whatsapp-web.js against the actual chosen chat, including self-sent messages, group events if needed, attachment retrieval, restart, and catch-up after laptop sleep. Pair interactively and allowlist one chat ID. The adapter only reads and ingests; it does not reply, mark items handled by sending messages, or import unrelated chats.

Its maintainers explicitly say blocking is possible. This is an unofficial integration, so keep it optional and retain export recovery. History backfill must be demonstrated before depending on it. Session credentials may grant wider account access even when our code filters one chat; store them outside the library and backups.

### C. Official business receiver — if collection during laptop downtime is essential

Evaluate a dedicated WhatsApp Business Platform number that you message directly, with an HTTPS webhook receiver and durable remote queue. The receiver stores events and downloads attachments promptly; the laptop later fetches and acknowledges them after local persistence. Webhook signature verification, retry deduplication, encrypted storage, and retention are part of this design.

Do not assume the official API can simply attach to an arbitrary existing personal chat or group. Meta's Groups API documentation could not be retrieved during this research; eligibility and account capabilities remain an implementation discovery task. Prefer investigating a one-to-one inbox for this option. Account setup and an always-on service add operational work.

**Default:** ship A, test B, choose C only if uninterrupted capture justifies it. Existing-chat selection, pairing, and any new-number setup require the user's interaction during implementation.

## Source capture policy

| Input | Preserve | Analyze |
|---|---|---|
| Direct PDF or PDF attachment | Original bytes, original URL if any, checksum, capture date | Text with page references; OCR only if needed, recording OCR limitations |
| Paper landing page | Page URL and identifiers; linked public PDF when available | Abstract and/or full text, explicitly distinguishing the two |
| Website/article | Original and canonical URLs, capture metadata; extracted text snapshot by default | Main article text, title, author/date when available |
| X post/thread | Exact URL and post ID; accessible text snapshot when obtainable | Only retrieved text; thread coverage must be explicit |
| Shared text/comment | Exact message and context | Keep your commentary separate from the linked author's claims |
| Other attachment or unsupported URL | Original file or URL and queue record | Mark unsupported or awaiting extraction; do not discard |

You only need website links retained, but a small text snapshot makes highlights auditable after pages change or disappear. It is recommended, configurable, and separate from storing full HTML. X items that cannot be retrieved remain searchable link-only records. Never generate a full-article summary from a URL, title, or preview alone. Videos can remain link-only initially.

Use bounded fetches and conservative URL normalization: strip known tracking parameters, preserve meaningful query parameters, record redirects, and deduplicate PDFs by bytes as well as URLs. URL identity and content versions are separate. Preserve repeated sharing events and your comments even when the underlying article is a duplicate.

## Proposed folder

```text
research-library/
  README.md
  PLAN.md
  AGENTS.md                     # entry point into shared workflow
  CLAUDE.md                     # points to the same instructions
  docs/WORKFLOW.md
  docs/RECOVERY.md
  schemas/item.schema.json
  schemas/entity.schema.json
  schemas/relationship.schema.json
  prompts/                      # versioned extraction/brief instructions
  config.example.yaml
  pyproject.toml
  uv.lock
  src/                          # CLI, adapters, validation, search, exports
  connectors/whatsapp/           # optional Node helper and pinned lockfile
  inbox/imports/
  inbox/events/                 # immutable captured message envelopes
  records/items/                # authoritative per-item JSON
  records/entities/             # stable identities and aliases
  records/relationships/        # evidence-backed edges
  vault/                        # open this directory in Obsidian
    Sources/                    # generated per-item notes
    Topics/                     # generated topic and entity notes
    Briefs/                     # dated, cited reading briefs
    Personal/                   # user-owned notes, never overwritten
    Raw/<item-id>/<version>/     # PDFs, message copies, extracted text
    .obsidian/
  derived/search.sqlite         # disposable full-text index
  derived/graphify/              # disposable graph exports and reports
  state/queue.sqlite            # operational queue, leases, checkpoints
  runs/<run-id>/                # manifests, validation results, costs
  extension/                    # later Chrome side panel
  tests/fixtures/               # synthetic or explicitly public examples
```

Obsidian is a desktop application installed normally on the Mac; the vault lives here. Graphify and Python dependencies should use an isolated, pinned environment. Do not nest a second Git repository by default inside the existing project. Keep real messages, PDFs, model output, credentials, and browsing data out of the parent Git repository; back up the library separately with encryption. Code and synthetic fixtures can be versioned.

## Fixed metadata contract

Implement strict JSON Schema with `schema_version`, enum validation, UTC timestamps, explicit nulls for unknown values, and migration commands. An illustrative record shape follows; implementation must supply complete schemas for nested objects as well.

```json
{
  "schema_version": "1.0.0",
  "id": "item_<stable-id>",
  "kind": "article",
  "title": null,
  "original_url": "https://example.org/article",
  "canonical_url": "https://example.org/article",
  "identifiers": {"doi": null, "arxiv": null, "x_post_id": null},
  "authors": [],
  "publisher": null,
  "published_at": null,
  "first_saved_at": "2026-09-06T14:00:00Z",
  "capture_events": ["event_<stable-id>"],
  "user_comment_refs": [],
  "retrieval": {
    "status": "pending",
    "coverage": "none",
    "retrieved_at": null,
    "method": null,
    "http_status": null,
    "error": null
  },
  "content_versions": [],
  "analysis": {
    "status": "pending",
    "summary": null,
    "highlights": [],
    "claims": [],
    "limitations": [],
    "topic_ids": [],
    "entity_ids": [],
    "relationship_ids": [],
    "provenance": null
  },
  "reading": {"status": "unread", "priority": null}
}
```

Each content version includes a checksum, capture time, MIME type, relative original-file path, extracted-text path and extractor version. Each highlight/claim includes evidence with a content-version ID and page/section/text offsets plus a short exact quote. Browser highlights also store quote prefix and suffix so they can be relocated.

Analysis provenance records the agent/model when available, prompt version, run ID, input hashes, and generation time. Do not overwrite good analysis with incomplete output. User reading state and annotations survive regeneration.

A relationship has an ID, source and target IDs, a type, evidence references, an explicit `extracted` or `inferred` label, and rationale. Support types such as `authored_by`, `about`, `cites`, `extends`, `supports`, and `contradicts`; the last three need specific claim-level evidence. Shared vocabulary alone is only `related_to`. Unknown dates remain unknown; save time is not publication time.

## Pipeline and recovery

1. **Ingest:** write original event and attachments durably before advancing the intake cursor; split multiple links into items with shared event provenance.
2. **Resolve:** canonicalize, classify, deduplicate, and locate public paper PDFs with bounded discovery.
3. **Capture:** fetch original bytes where applicable, checksum, and retain versioned evidence.
4. **Extract:** local HTML/PDF text first; use a browser or configured Firecrawl for harder public pages. Record partial retrieval and authentication barriers.
5. **Analyze:** the chosen agent writes staged structured results using the same prompt and schema. Chunk long papers with page-aware references and consolidate claims without losing source locations.
6. **Validate:** check schemas, IDs, file paths, and evidence quotes against the captured version. Retry malformed output within a bound; otherwise quarantine that stage.
7. **Publish records:** atomically replace validated records. Maintain a single writer lock and recoverable job leases so concurrent agents cannot double-publish.
8. **Index and graph:** update full-text search and source/entity edges; call the Graphify adapter only on the curated corpus. Exclude private session files, generated briefs, and graph output to avoid recursive summarization.
9. **Render:** generate Obsidian source/topic notes with highlights, provenance links, original URL, local PDF links, and related items. Preserve personal notes.
10. **Report:** show added, duplicate, partial, failed, and pending counts, with a per-run manifest.

Queue stages: `queued → captured → extracted → analyzed → published`, with per-stage retryable, blocked, and permanent failures. Each stage is idempotent and checkpointed. A failed item must not block unrelated items. Retrying a changed schema/prompt reuses unchanged raw files. Graph and search indexes can be rebuilt from records; queue state can be reconciled from event manifests and record stages.

Bound each run by item count, download size, PDF pages, retries, and optional model budget. Ingested page text is untrusted data: it cannot instruct the agent to execute commands, read secrets, send messages, or modify workflow rules. Fetchers reject private-network targets and recheck redirects. Logs omit credentials and unnecessary message text.

## Graphify and Obsidian integration

Use the official Graphify-Labs project, whose PyPI package is `graphifyy`. Pin a tested release and verify its actual CLI/output formats before integrating; documentation and forks use differing output layouts. Its semantic analysis of documents uses an assistant or configured model backend, so local storage does not imply local inference.

Run a small integration spike on articles and PDFs before committing to the adapter. Determine whether validated metadata can feed supported graph formats directly; otherwise provide curated source Markdown and reconcile resulting graph nodes back to our IDs. Never silently let a second semantic pass replace validated evidence. Keep adapter mappings and tests. If Graphify is unavailable, source notes, links, and search must still work.

Obsidian's graph represents note links. Generate a restrained set of source/topic/entity notes, not a note for every sentence. Keep the richer typed/evidenced relationships in JSON and Graphify output. Topic notes link to contributing sources; source notes link directly to local raw files and live URLs.

## Agent-independent operation

Use one shared workflow document containing commands, schema requirements, allowed writes, recovery steps, and citation policy. Agent-specific entry files reference it. Prompts and data contracts live in the repository, not exclusively in conversation memory or provider-specific tools.

Proposed CLI contract, to be implemented:

```text
library import <chat-export-or-file>
library sync whatsapp
library run --limit 25
library status
library retry --failed
library search "retrieval" --since 2026-09-01
library brief --since last-brief
library graph rebuild
library doctor
```

The agent is responsible for semantic work; deterministic code owns persistence, validation, indexing, and rendering. Initial use can have the interactive agent fill staged JSON and invoke validation. A later unattended model adapter can implement the same contract. Switching agent mid-run must not require converting data or rebuilding completed stages.

“Run locally” has two meanings: local commands/storage with a cloud model, or completely local inference. Default to the first with the user's chosen agent. Keep the second possible through a local model adapter, but benchmark hardware and evidence quality before promising comparable results. No mandatory new API subscription for the basic interactive workflow; any hosted extraction or model credentials are optional configuration.

## Reading and updates

Each source note shows title/date, a compact overview, 3–7 useful highlights when supported, limitations, related reading, the original URL, and local raw source. Sparse or link-only content gets a clear coverage label rather than padded highlights.

“Summarize since last time” generates a dated Markdown brief from newly captured/processed items, grouped by topic, with links and coverage gaps. Keep a brief watermark separate from ingestion and reading status so a failed run cannot skip items.

“Find updates on these topics” is a separate, explicit later mode: search/fetch fresh sources, ingest them through the same pipeline, then compare supported claims against prior records. Record publication and retrieval times. A saved-reading digest alone must not claim to represent all current news.

## Chrome extension: phase after the library works

Build a Manifest V3 side panel. On user action, resolve the active URL to a saved record and display cached highlights, related sources, analysis date/coverage, and an Open in Obsidian action. Connect through a native messaging host with a restricted extension origin and read-only lookup operations initially.

Optional in-page highlighting matches exact stored quotes, anchored with prefix/suffix and the source version. If the article changed or a quote cannot be located, show it in the panel as unmatched; do not highlight unrelated text. Start with HTML articles; Chrome's built-in PDF viewer and complex X layouts need separate handling, with panel-only fallback. A “save this page” action can later enqueue the URL through a narrowly scoped method.

No API keys in the extension. Request site access only when needed. Opening a page should use cached analysis by default; processing new content remains an explicit action.

## Delivery sequence and acceptance checks

1. **Foundation and sample corpus.** Create isolated tooling, schemas, instructions, import CLI, raw storage, and a 10–20 item mixed fixture set. Confirm that duplicate URLs preserve separate comments and that failed fetches retain source records.
2. **First complete reading workflow.** Add extraction, staged agent analysis, validation, search, Obsidian notes, and briefs. Every displayed highlight must resolve to evidence. Test text and scanned PDFs, blocked pages, and link-only X posts.
3. **Graphify spike and integration.** Pin release, map stable IDs, prove incremental updates and source links. Deleting derived indexes and rebuilding must preserve the library and personal notes.
4. **WhatsApp convenience.** Test one allowlisted chat, sent/self-chat behavior, media, reconnect, repeated sync, and sleep/backfill. Clearly report any gaps. Keep export import usable.
5. **Browser reading companion.** Implement side panel and HTML quote highlighting; test changed pages, missing records, canonical URL variants, and native-host unavailability.
6. **Optional upgrades.** Official always-on inbox, local inference evaluation, fresh-news discovery, semantic search if full-text proves insufficient, and audio/video extraction.

Cross-cutting acceptance: interrupted runs resume; a second agent can finish a staged job; unrelated chats are not persisted; partial records never appear as full reads; restoring from backup can rebuild search/graph and retain PDF checksums. Run end-to-end acceptance against both chosen agent workflows, not just one.

Budget categories are local disk usage, optional hosted extraction, optional model API usage, and an always-on receiver only if selected. Measure costs on the sample corpus and set caps before unattended processing; do not assume existing agent subscriptions include third-party services.

## Evidence and remaining uncertainties

- [Graphify official repository](https://github.com/Graphify-Labs/graphify): package identity, graph outputs, document semantic backend, and optional local inference integration. Exact installed version and adapter compatibility still need testing.
- [whatsapp-web.js official repository](https://github.com/wwebjs/whatsapp-web.js/): linked-device approach and explicit account-blocking caveat. Actual chat catch-up behavior is unverified.
- [Meta's webhook collection](https://www.postman.com/meta/whatsapp-business-platform/folder/lboq68h/webhooks): webhook delivery model for the business integration. Existing personal/group-chat eligibility was not established.
- [Firecrawl scraping guide](https://www.firecrawl.dev/blog/mastering-firecrawl-scrape-endpoint) and [self-hosting documentation](https://docs.firecrawl.dev/contributing/self-host): hosted extraction and self-hosting options. Begin with a replaceable extraction adapter; self-hosting is an optional operational choice.
- [Obsidian storage documentation](https://obsidian.md/help/Files%2Band%2Bfolders/How%2BObsidian%2Bstores%2Bdata): file-backed vault model.
- [Chrome side panel](https://developer.chrome.com/docs/extensions/reference/api/sidePanel) and [native messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging): supported browser interface and local communication mechanisms.

The previous LeetCode project's actual extractor configuration was not identified in the current workspace. This proposal does not assume it used a particular Firecrawl setup; reuse can be evaluated once that project is located.
