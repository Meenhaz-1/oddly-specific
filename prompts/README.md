# Quiz prompts

This directory is the canonical source of truth for all model prompts.

- `generator.md` — candidate research and generation prompt supplied by the product team.
- `evaluator.md` — independent critic, scoring, rewrite, and rejection prompt.
- `open-ended-task.md` — temporary MVP specialization while generated questions are open-ended only.

Runtime code must load prompt text from this directory. Do not duplicate prompt prose in `server.ts` or client code.

Template variables use double braces:

- Generator: `{{TOPIC}}`, `{{N}}`
- Evaluator: `{{CANDIDATE_QUESTIONS}}`

The general prompts should remain format-independent. Product-stage restrictions belong in a separate task file so they can be removed without rewriting the canonical prompts.
