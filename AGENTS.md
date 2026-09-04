# Repository checks

Before returning any code change to the user, run:

```bash
npm run preflight
```

When a change touches `server/persistence.ts`, `server.ts`, `supabase/`, or an API
contract, also run the database checks against local Supabase:

```bash
npx supabase start
npm run db:test
npm run test:integration
```

Do not treat a production build alone as sufficient verification. If Docker is
unavailable, report that the database integration checks could not run.
