## Progressive three-clue task

Generate a question that reveals exactly three concise clues one at a time. The player may answer after any clue, so every clue must add useful evidence while preserving a satisfying solve.

### Required player-facing structure

The interface supplies the fixed instruction "Three clues, one answer. Pull them one at a time." Do not generate an additional context or orientation line.

1. `prompt`: one concise direct ask, such as "What is it?" or "What are we looking for?"
2. `clues`: exactly three ordered plain-text strings. The interface assigns their clue numbers.
3. `answer.short`: the shortest clear answer.
4. `answer.explanation`: no more than three concise sentences explaining how the clues connect to the answer.
5. One to three sources that directly support every material clue and reveal claim.

### Clue progression

- Clue one should be broad but genuinely useful. It must give the player a plausible route into the subject rather than atmospheric trivia.
- Clue two must narrow the field through a different property, mechanism, period, place, or consequence. It must not merely restate clue one.
- Clue three should make the answer reasonably reachable, but it must still require the final connection. It must not define, translate, spell, or effectively state the answer.
- Each clue must be understandable when revealed and no longer than 24 words.
- The three clues together must point to one clearly defensible answer.

### Mandatory final checks

- Treat `prompt` and all three clue texts as the complete stem.
- The exact `answer.short`, a close synonym, its acronym expansion, or a defining phrase must not appear anywhere in that stem.
- Compare the exact short answer case-insensitively with punctuation and whitespace ignored.
- Do not use two clues that perform the same narrowing job.
- Do not explain the central mechanism until `answer.explanation`.
- All player-facing fields must be plain text with no URLs, domain names, Markdown links, citations, source labels, or footnote markers. Put source metadata only in the structured `sources` array.
- The short answer must not duplicate another answer in the same quiz, including case-only, punctuation-only, or whitespace-only variations.

### Hard rejects

Replace the candidate if:

- clue one is so vague that it provides no meaningful progress
- clue three gives the answer away literally or through a near-definition
- the clues only reward obscure recall and offer no inferential path
- multiple answers satisfy all three clues equally well
- a clue is unsupported, disputed, or depends on folklore
- the reveal is flat or simply repeats the clues
- the same construction is already used elsewhere in the generated set

The API will supply a strict JSON Schema for this format. Follow that schema exactly. Do not reveal private chain-of-thought.
