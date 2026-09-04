# Oddly Specific

> A better question changes the room.

A trivia web app: pick a subject, get three vetted archive questions and two
newly generated questions, each with a cited source. Ported from the [Claude Design](https://claude.ai/design)
prototype (`claude.ai/design/p/cc889979-cca6-4d85-b7f0-2dfb5737a315`) into a
standalone React + Vite app — same paper/archival look, same interactions,
real deployable code.

## Stack

- React 19 + Vite + strict TypeScript
- Plain CSS (no framework) — palette and type scale live in
  [`src/index.css`](src/index.css)
- Express server route backed by the OpenAI Responses API
- Supabase/Postgres persistence managed through GitHub-deployed migrations
- Static seed questions in [`src/data/questions.ts`](src/data/questions.ts)

## Run it

```bash
npm install
```

Run the same fast preflight used by CI before handing off any code change:

```bash
npm run preflight
```

Database and PostgREST contract changes also require Docker Desktop:

```bash
npx supabase start
npm run db:test
npm run test:integration
```

Copy `.env.example` to `.env` and add your OpenAI API key before generating a set:

```dotenv
OPENAI_API_KEY=sk-your-key-here
OPENAI_MODEL=gpt-5.4-mini
OPENAI_GENERATOR_MODEL=gpt-5.5
OPENAI_EVALUATOR_MODEL=gpt-5.4-mini
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SECRET_KEY=sb_secret_your-key-here
```

The browser calls the local `/api/generate` route. OpenAI and Supabase secret
keys are read only by the Express backend and are never included in the client
bundle.

## Local Google Sheet imports

In local development, the landing page includes a Question sheet importer.
This module and its API route are unavailable on Vercel and in production mode.
The Google Sheet must be shared with anyone who has the link and use these
required columns:

```text
topic,label,context,prompt,answer_short,answer_explanation,source_1_title,source_1_publisher,source_1_url
```

Second and third sources are optional and use the same column pattern with
`source_2_` and `source_3_`. Topic values should exactly match a carousel topic
when the imported questions are intended for that topic's five-question set.

```bash
npm run dev       # http://localhost:5173
npm run build     # production build -> dist/
NODE_ENV=production npm start
```

## Deploy to Vercel

The repository includes a Vite deployment configuration and a catch-all
Vercel Function for the existing `/api/*` routes. Import the GitHub repository
in Vercel, keep the detected framework as **Vite**, and add these server-side
environment variables for Production (and Preview if you test there):

```dotenv
OPENAI_API_KEY=sk-your-key-here
OPENAI_MODEL=gpt-5.4-mini
OPENAI_GENERATOR_MODEL=gpt-5.5
OPENAI_EVALUATOR_MODEL=gpt-5.4-mini
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_SECRET_KEY=sb_secret_your-key-here
```

Do not give any secret a `VITE_` prefix. Vite exposes variables with that
prefix to browser code. The `/api/generate` function allows the landing-page
topic field to generate a quiz in production; its background evaluation and
database writes use Vercel's request-lifetime extension and a five-minute
function duration.

Until public generation has authentication or a durable rate limit, keep the
deployment protected or share its URL only with trusted testers: every visitor
who can reach the page can otherwise spend the configured OpenAI account's
quota.

## Supabase and GitHub schema workflow

The database schema is code-owned under [`supabase/migrations`](supabase/migrations).
Do not edit the production schema directly in Supabase's Table Editor.

For a local database (Docker Desktop required):

```bash
npm run supabase:start
npm run db:reset
npm run db:test
```

For hosted deployment, connect the GitHub repository in Supabase under
**Project Settings → Integrations → GitHub**, use `.` as the working directory,
select `main` as production, and enable **Deploy to production**. Migrations
merged to `main` are then applied automatically.

Generated questions are returned to the webpage before persistence and
evaluation finish. The backend saves the run, sources, immutable prompt
versions, evaluator decisions, and question-level Good/Weak feedback in the
background. If Supabase is unavailable, the quiz remains playable and the
terminal reports the failed write.

Generator and evaluator requests keep their canonical instructions stable and
put topic/question data in the final user input. Each prompt version derives a
stable `prompt_cache_key`; GPT-5.5 requests opt into 24-hour retention. Terminal
logs and `quiz_runs` record cached input tokens and cache-hit rates so caching
can be measured rather than assumed.

## Structure

```
server.ts                 Express + OpenAI Responses API boundary
server/prompts.ts         prompt loading and template rendering
server/persistence.ts     Supabase prompt, quiz, evaluation and feedback writes
prompts/                  canonical generator, evaluator and MVP task prompts
supabase/migrations/      code-owned Postgres schema and atomic RPC functions
src/
  types.ts                shared quiz, state and API domain contracts
  data/questions.ts       static seed bank + topic list
  hooks/useQuizEngine.ts  screen/quiz state machine, local progress and sharing
  components/
    Header, Menu           top bar + landing nav menu
    Landing                 hero, "try one" sample, topic picker
    QuizIntro                set-ready interstitial before question one
    QuizScreen               per-question UI (image / clues / connect / choice / blank / text kinds)
    Making                   question-set assembly transition screen
    Done                     recap screen
    RevealCurtain            shared clip-path "paper roll" reveal animation
    ImagePlaceholder          textured stand-in for the design's real archival photos
    Viewer                    fullscreen image lightbox
```

## Responsive behaviour

Matches the original design spec: the paper column is fluid up to a
860px cap and centred on wider viewports. Below 880px the primary quiz
action (`Reveal answer` / `Next question`) sticks to the bottom of the
screen with a fade; at 880px and up it sits in flow at the end of the
reading column instead (see the `@media (min-width: 880px)` rule in
[`QuizScreen.css`](src/components/QuizScreen.css)).

## Content

The static seed questions and landing sample are the exact copy from the
design prototype's static question bank. `image-slot` placeholders
stand in for the archival photography referenced in the copy (no photo
library is wired up yet) — swap `ImagePlaceholder` for real `<img>`
sources per question when art is sourced.

## Known gaps vs. the design prototype

- **Prototype generation pipeline.** Topic selection now calls the OpenAI
  Responses API with web search and Structured Outputs. The single-call
  prototype still needs the PRD's separate research, critique, verification,
  and ranking stages before production launch.
- **Saved-run sharing.** Generated questions and player feedback
  are persisted, and generated sets can be shared by run ID so recipients load
  the same stored questions instead of regenerating a demo topic.
- **No real photography** — see Content, above.
