# Practice Forge implementation plan

1. Foundation: private React/Sites app, LeetCode-inspired split workspace, CodeMirror without completion; preserve existing Git history. Commit and push master.
2. Practice engine: isolated browser execution for Python (Pyodide) and JavaScript, timeouts, examples/full submissions/custom cases, meaningful judge tests. Commit and push master.
3. Research and persistence: Gemini structured generation + Tavily public web search, visible assumptions/sources, reference-solution checks before saving, D1 problems/submissions, session-only provider keys. Commit and push master.
4. Validation and delivery: schema migrations, type/build/security checks, documentation, private Sites publish and smoke checks. Commit and push master.

## Decisions
- Browser execution avoids paid compute and server credentials in submitted code. Sandboxed opaque-origin iframe owns a disposable worker; parent imposes timeouts. This is a personal practice judge, not a tamper-proof contest grader.
- Python first and JavaScript second. JSON positional arguments enter `solve`; trees, graphs and linked lists use documented JSON representations. Unsupported interactive tasks must be reformulated explicitly.
- Gemini and Tavily are user-provided keys held in page memory only, sent over HTTPS to authenticated backend routes, never persisted. Runtime environment keys are also supported. No automatic paid upgrades.
- Use original problem wording reconstructed from user ideas/public sources; do not promise access to premium statements or proprietary test suites.
- GitHub master is the user source branch. Sites' deployment source main mirrors the same commit when publishing.
