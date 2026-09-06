# Backup and recovery

Back up `inbox/`, `records/`, `vault/`, `state/`, `staging/`, `runs/`, and `config.local.json` to encrypted local/external storage. Git intentionally contains none of your captured material. Stop the writer/collector before taking a file-level backup, or use a filesystem snapshot so the queue database is consistent. Session credentials are outside this directory; exclude them from ordinary document backups and pair again if lost.

`library doctor` verifies metadata, evidence references, and original checksums. `library recover` replays durable captured events to restore missing records/jobs without redownloading original attachments. `library rebuild` regenerates search, graph JSON, and generated notes. Recovery does not reconstruct agent analysis if both authoritative records and backups are lost; the original sources can be reanalyzed.

The file lock is released by the OS if a process crashes. A queue stage is advanced only after its source record is durable. Replaying ingestion recovers an event that was saved before item publication. Retry blocked downloads with `library run --retry`; unaffected items continue normally. Staged agent drafts survive repeated `prepare` commands.

For inaccessible articles or X posts, save readable text manually to a UTF-8 file and attach it to the existing URL record:

```sh
library attach ITEM_ID /path/to/captured-text.txt --coverage partial
```

Use `abstract` for abstracts, and `full` only when you know the full source was captured. The original URL remains attached. An old completed analysis is archived before replacement. A stale analysis packet is rejected; preserve/remove that packet and run `library prepare` to create one against the new text.

Image-only PDFs are preserved but marked as requiring OCR. Automatic OCR is not included in this version. Run a trusted local OCR tool and attach its output with partial coverage; record OCR limitations in the analysis.

Version 1.0.0 is the initial schema. Unknown versions fail validation. A future schema change must ship an explicit migration and tests; editing the version number alone is not a migration.
