# Regression tests

Run `npm run preflight` before returning changes. It now includes test typechecking,
the existing unit and blueprint checks, Vitest regressions, a production build,
and Playwright browser journeys. Install the browser once with
`npx playwright install chromium` (CI uses `--with-deps`).

To use installed Chrome instead on Windows:

```powershell
$env:PLAYWRIGHT_CHANNEL = 'chrome'
npm.cmd run preflight
```

## Suites

- `npm run test:regression`: actual Express HTTP handlers with mocked model and
  persistence boundaries; actual React hook in jsdom; archive repository mapping
  with mocked database responses; player-copy validation. No paid model requests.
- `npm run test:browser`: production frontend on an isolated preview port, with
  API responses intercepted. Covers generate/play/reveal/finish/reload, progressive
  clues, retries, shared links, and archive exclusions. Unexpected external
  requests are blocked. This verifies browser behavior, not a live full-stack deploy.
- `npm run test:typecheck`: checks the new test code and integration runner.
- `npx supabase start`, `npm run db:test`, `npm run test:integration`: existing real
  database suites, requiring Docker. These remain a separate CI job. The integration
  runner refuses non-local database URLs.

## Known defects captured as expected failures

Four `test.fails` cases execute assertions for the desired behavior:

1. Rejected archive questions must never be selected.
2. A collision must select another available archive question instead of discarding
   an otherwise usable generated pair.
3. Going home must prevent an old generation response from reopening the quiz.
4. The newest generation must win when requests complete out of order.

These are deliberately not skips and do not claim the defects are fixed. Vitest
reports them separately as expected failures. When a fix makes one pass, Vitest
fails the suite until `.fails` is removed. Do not weaken the assertion to restore
existing buggy behavior.

## Scope and limits

Fixtures are deterministic and source URLs are placeholders, not factual evidence.
Tests do not assess model originality or factual quality. Model quality needs a
separate sampled evaluation. No load or performance benchmarks are included.
Database behavior cannot be certified solely by repository mocks; run the Docker
suites for persistence changes. Browser previews do not validate Vercel rewrites.

Local database verification passed after Docker was started and the pending
20260904000100 migration was applied with `supabase migration up --local`:
82 database assertions and the Supabase integration contracts passed. The Windows
`.cmd` launcher issue is repaired. When restoring an older local database, apply
pending migrations before running these suites.
