# Validation record

Checked September 5, 2026.

- TypeScript and lint on app, libraries, database, and tests: passed.
- Production build: passed with patched React/Vinext/Cloudflare dependencies. A large client-bundle warning remains because the editor is bundled with the workspace.
- Six judge/runtime/security tests: passed. Both production worker language paths run all 37 starter cases; Python uses the real pinned Pyodide runtime from local npm assets. Output capture, syntax errors and runtime exceptions are checked. A mocked browser-channel test verifies forged readiness cannot extend the deadline and timeout removes the sandbox.
- Four local HTTP integration tests: passed. Runner CSP, cross-origin mutation rejection, missing provider setup, authenticated problem save/read and submission save/read, and anonymous denial are covered. Test fixtures exist only in the local development database.
- Production dependency audit: zero known advisories. Four moderate development-only advisories remain through Drizzle Kit's legacy esbuild loader. No force-downgrade was applied to the migration tool.
- The local sign-in route and database migration were exercised. No production provider key was available, so live Gemini/Tavily generation and tutoring remain unverified until configured.
- Browser UI and opaque-origin iframe execution have not been automated in a real browser. The runtime worker itself is tested under a Node VM with real Python; this does not prove browser-specific CSP, CDN availability, memory exhaustion, or termination behavior. The runner uses documented browser sandbox and MessageChannel APIs.
- The optional read-only WebMCP problem-list tool is feature-detected; no supported WebMCP validation context was available, so its registration was not verified.

Security scope: personal practice. Submitted code has no backend execution privileges or API keys. Results are client-side and can be tampered with; there is no hard browser memory quota. See README for the network and judging limitations.
