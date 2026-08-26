# Quiz prompts

This directory is the canonical source of truth for all model prompts.

- `generator.md` — candidate research and generation prompt supplied by the product team.
- `generator-examples.md` — curated positive construction examples and editorial taste calibration.
- `evaluator.md` — independent critic, scoring, rewrite, and rejection prompt.
- `evaluator-examples.md` — calibrated ACCEPT, REWRITE, and REJECT examples.
- `open-ended-task.md` — temporary MVP specialization while generated questions are open-ended only.

Runtime code must load prompt text from this directory. Do not duplicate prompt prose in `server.ts` or client code.

Template variables use double braces:

- Generator: `{{TOPIC}}`, `{{N}}`
- Evaluator: `{{CANDIDATE_QUESTIONS}}`

The general prompts should remain format-independent. Product-stage restrictions belong in a separate task file so they can be removed without rewriting the canonical prompts.

Examples calibrate editorial judgment only. They are not factual sources, must not be copied, and never replace independent source verification.
