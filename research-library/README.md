# Research library

A local, file-backed reading archive. Development is staged; see [PLAN.md](PLAN.md) for the design.

```sh
cd research-library
uv sync --locked
uv run library init
uv run library status
uv run pytest
```

Real intake events, documents, generated records/notes, queue state, and credentials are excluded from Git. Back up these private files separately. The parent repository also contains an unrelated IDE application.
