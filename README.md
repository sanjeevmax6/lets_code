# Practice Forge

A private, Python-first algorithm practice workspace. Paste a question title, rough idea, or public URL; research it, review the assumptions, verify generated references, and practice in an editor with syntax highlighting and four-space indentation. Suggestions, spellcheck, and automatic completion are disabled.

## Included

- Python 3.12 via pinned Pyodide 0.27.7 and JavaScript execution in a disposable browser worker, owned by an opaque-origin sandbox iframe.
- Run examples, edit custom JSON cases, or submit the full generated suite. Feedback includes returned values, expected values, exceptions, capped standard output, and elapsed time.
- Two working starter exercises (37 total cases), progressively revealed hints, walkthroughs, and a Gemini tutor for questions about your current code.
- Gemini generation plus Tavily public web search; sources and explicit assumptions accompany each generated exercise.
- Both generated reference implementations must pass the generated cases before the UI saves a problem.
- Private D1 persistence for problems and submissions. Editor drafts are device-local convenience state. AI keys entered in Settings are session-memory only.

## Use

1. Open the private deployed Site and sign in with its owner account.
2. Try a starter problem immediately. Implement `solve` using the displayed parameter order. Inputs and return values are JSON-compatible.
3. For new problems, open Settings and enter a Gemini API key and (for web research) a Tavily API key. Keys clear when the page reloads. Do not commit keys.
4. Select New problem, describe the idea, review the interpretation, then Verify & add to library.
5. Run checks the two visible examples (or your custom case). Submit checks every case and saves the attempt. Hints never appear until revealed.

AI provider accounts/keys are required for arbitrary generation; they are not provisioned by this repository. A keyless deployment still supports starter practice and code execution. Live generation cannot be validated without those credentials.

## Local development

Node 22.13+ is required. Use `npm ci`, then `npm run build`. Apply the generated migration locally:

```sh
npx wrangler d1 execute DB --local --config dist/server/wrangler.json --file drizzle/0000_goofy_shooting_star.sql
npm run dev
```

The Sites plugin supplies a local development identity. Production identity comes from Sites' trusted dispatcher. Do not expose the development server publicly or accept client-supplied identity headers in another hosting setup.

Optional backend provider settings are documented in `.env.example`. Use Sites runtime secrets for hosted keys. The app Settings work without hosted secrets and do not persist credentials. `GEMINI_MODEL` defaults to `gemini-2.5-flash` and can be changed server-side when model availability changes.

## Verification

```sh
npm run typecheck
npm test
npm run test:api  # development server must be running
npm run build
```

Runtime tests execute the production worker with real Pyodide and JavaScript, checking all starter references, output capture, and exceptions. Judge tests cover JSON type distinctions, unordered comparisons, multiplicity, and invalid contracts. API tests cover runner security headers, cross-site mutation rejection, and missing AI configuration. Browser UI tests and live provider requests are separate from these tests; see VALIDATION.md for what was actually run.

## Security and limitations

Submitted and generated code never runs in the app backend. The iframe lacks `allow-same-origin`, navigation, forms, popups, and storage access. A private MessageChannel carries only code/tests/results; provider keys never enter the runner. Its CSP denies all resources except the pinned Python runtime CDN, blob workers, and the script/evaluation capabilities required by Python/JavaScript. Runtime network access is restricted to the CDN, not fully disabled. Python loading has a 60-second deadline; execution has a 5-second batch deadline. Stop removes the entire sandbox.

This is a personal practice environment, not a tamper-proof competition judge. Client-side tests are inspectable; hostile code can forge results inside its worker. Browser memory has no application-enforced hard cap, and a resource-exhausting program can affect the browser tab. No server credentials or cloud account role are placed in the sandbox. For multiuser or adversarial judging, use a separate managed microVM/container service with network disabled and hard CPU/memory limits.

AI-generated expected answers can be wrong even when both references agree. Verification establishes consistency, not correctness. The app creates original practice variants; it does not bypass LeetCode Premium, fetch proprietary tests, or guarantee an exact match from vague input. Stateful tasks use an operations-array contract; trees/lists use explicitly documented JSON encodings. Interactive tasks must be reformulated. Exact and top-level unordered JSON comparison are supported; arbitrary special judges, floating-point tolerances, and compiled languages are not included.

Requests require server-side identity and same-origin mutations. Queries use prepared statements and owner filters. Research is capped at 20 requests per user per UTC day, tutor requests at 40. Provider failures never silently become fabricated research. Secrets and provider error bodies are not logged by app code. Free-tier Gemini data policies apply to submitted prompts/code; Tavily receives the search query.

## Hosting and cost decisions (checked September 5, 2026)

- Sites hosts the private app on Cloudflare Workers and provisions D1. Sites access/quota terms apply separately from Cloudflare's direct free plan.
- Direct [Cloudflare Workers Free](https://developers.cloudflare.com/workers/platform/limits/) allows 100,000 requests/day and 10 ms CPU per request: useful for API I/O, unsuitable for a conventional algorithm runner. Browser execution has no server execution bill.
- [CloudFront](https://aws.amazon.com/cloudfront/faqs/) is a CDN, not a general Python execution service. Lambda would require a separately hardened runner and AWS account; free usage allowances do not guarantee no bill.
- [Firecrawl Browser](https://docs.firecrawl.dev/features/browser) is a browser automation sandbox with limited free usage, not an unlimited free personal judge.
- [Gemini pricing](https://ai.google.dev/gemini-api/docs/pricing) lists free-tier models; quotas and eligibility vary. Search grounding is not universally available free, so this project separates search from generation.
- [Tavily](https://www.tavily.com/pricing) offers 1,000 free credits/month. Basic search costs one credit. This app does not enable pay-as-you-go, purchase credits, or upgrade accounts.

## Source and deployment

The user repository is https://github.com/sanjeevmax6/lets_code.git. Each implementation stage is committed and pushed to `master`. The Sites source repository requires its `main` branch; publication mirrors the same GitHub master commit there. `.openai/hosting.json` contains the assigned Site and D1 binding; it contains no secrets. Generated SQL migrations are checked in and applied by Sites at publication.
