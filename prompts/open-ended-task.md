## Current MVP task constraint

For this invocation, generate only open-ended questions. Do not generate visual, multiple-choice, connect, progressive-clue, or fill-in-the-blank candidates yet.

Each player-facing question must contain:

1. `context`: the main question text that gives a fair route to the answer.
2. `prompt`: the concise direct question, returned as plain text without Markdown italics.
3. `answer.short`: the shortest clear reveal, suitable for the circled answer treatment.
4. `answer.explanation`: no more than three concise sentences of reveal context.
5. One to three sources that directly support the material claims.

All player-facing fields (`title`, `teaser`, `context`, `prompt`, `answer.short`, and `answer.explanation`) must be plain text. Never put URLs, domain names, Markdown links, source names, citations, or footnote markers in those fields. Put source titles, publishers, and URLs only in the structured `sources` array.

Before returning a question, compare `answer.short` with the complete player-facing stem (`context` plus `prompt`) case-insensitively and with punctuation and whitespace ignored. The exact answer must not appear in the stem. Rewrite or replace any question that fails this check.

Every `answer.short` in the generated set must be unique. Compare answers case-insensitively with punctuation and whitespace ignored. If two questions resolve to the same short answer, keep the stronger question and replace the other with a question whose answer has not already been used.

Hard-reject questions that ask the player to identify the requested topic itself, recall a bare year, supply a nickname, name an obvious landmark, or repeat a familiar topic fact without an inferential route.

The API supplies a strict JSON Schema. Follow that schema instead of the Markdown output template in the general generator prompt.
