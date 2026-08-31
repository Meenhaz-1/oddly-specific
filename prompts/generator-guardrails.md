# Candidate selection and construction guardrails

Most weak questions fail before wording begins: the selected premise is too familiar, has no fair inference path, or cannot support one precise answer. Sourceability does not make a premise suitable. Apply this workflow silently before returning any candidate.

Success means the premise itself would plausibly earn at least 4 out of 5 for originality, reveal quality, clue discipline, and answer precision before wording polish. Do not return a weak premise in the hope that an evaluator can rescue it with a rewrite.

## 1. Diversify before selecting

Do not commit to the first relevant fact recalled or returned by search. That fact is often prominent because it is widely repeated, not because it supports a strong question.

Before drafting, internally consider several premise directions for each required question. Vary both the subject area and the relationship being tested: mechanism, constraint, consequence, comparison, sequence, purpose, or connection. Do not create several phrasings of the same central fact.

An assigned style or direction is an exploration seed, not a deliverable. Abandon it when its best available premise fails this gate, and choose a stronger relationship within the requested topic. Never preserve a weak premise merely to satisfy a format label or direction.

Use broad retrieval to map the topic and find evidence. Do not let search ranking choose the question. Prefer a premise only after comparing it with the other directions for originality, inferability, answer precision, and reveal quality.

## 2. Test novelty at the premise level

Evaluate the combination of:

- the intended answer
- the central fact or relationship
- the route by which the player reaches the answer

This combination is the premise fingerprint. A new surface wording does not create a new question when the fingerprint remains familiar.

Reject a premise when an experienced quizzer could identify the standard fact from the topic and one signature detail. Reject it when the answer and central fact are routinely presented together in general explainers, classroom material, listicles, trivia collections, or search summaries. Repeated coverage is evidence of exposure, not evidence of quality.

Treat common high-level shapes as higher risk, including famous origin stories, standard etymologies, iconic demonstrations, accidental inventions, record-book firsts, eponyms, and hidden-purpose facts about familiar objects. They are not automatically forbidden, but they require a genuinely non-canonical relationship and solving route. A different question word or an added detail is not enough.

## 3. Design the solve before writing the stem

For each surviving premise, define internally:

1. the exact answer and its required level of specificity
2. the observations or constraints available to the player
3. the reasoning step that connects those observations to the answer
4. the information reserved for the reveal

The player-facing route must be either fully inferable or anchored by independent clues from different domains. Bare recall of an underlying anecdote, name, date, definition, or standard association is not a route. At the same time, the stem must not disclose the central mechanism merely to make the question solvable.

If removing the mechanism makes the question impossible, the premise has no usable inference path. Discard it instead of restoring the explanation or replacing inference with extra recall clues.

## 4. Keep evidence and resolution on opposite sides of the reveal

The stem should contain observations, constraints, contrasts, or consequences. The answer explanation should contain the causal resolution, interpretation, or completed connection.

For every sentence, identify its function. Remove it when it:

- interprets the evidence instead of presenting it
- defines, translates, paraphrases, or nearly names the answer
- states the causal link the player is supposed to infer
- eliminates alternatives without supplying positive evidence
- adds commentary after the question is already fair

Run the final-sentence deletion test. If deleting the last explanatory sentence improves the question without breaking the solve, delete it. If deletion breaks the solve, reconsider the premise rather than keeping the leakage.

Naming a domain, person, place, product, or event is acceptable only when it supplies necessary evidence. Omit it when it collapses the problem into recognition of a well-known association.

## 5. Make clues independent

Each sentence or progressive clue must narrow the answer through a different dimension. Two facts are not independent merely because they use different words.

Classify each clue's role internally, such as time, location, physical constraint, behavior, linguistic form, consequence, or comparison. If two clues perform the same role or both restate the same mechanism, keep the stronger clue and replace or remove the other.

For progressive questions, clue one should open a legitimate route, clue two should narrow through a different dimension, and clue three should resolve the uncertainty without becoming a definition or near-synonym.

## 6. Establish the answer contract

Decide before drafting what kind of answer the question requests: object, person, place, event, process, mechanism, term, quantity, or relationship. The stem must support that type and level of specificity naturally.

Generate the strongest alternative answers internally and test each against the exact wording. Reject or fundamentally redesign the premise when:

- a generic description and a technical term fit equally well
- broader and narrower versions would both deserve credit
- synonyms or naming variants create materially different acceptable answers
- different answer types satisfy the same prompt
- the intended answer requires assumptions not established by the clues

Do not repair ambiguity with “be specific” or by accepting a long list of variants. Change the evidence or choose another premise.

## 7. Require reveal gain

Measure what the player learns only after the answer is revealed. A reveal has value when it completes a causal chain, resolves an apparent contradiction, connects previously separate clues, or changes how the evidence is understood.

Reject a candidate when the reveal only labels a mechanism already described, repeats the final clue, confirms a fully retold anecdote, or supplies an obscure name without improving understanding. An interesting fact is not automatically an interesting question.

## Mandatory silent selection gate

A candidate may be returned only when every answer below is yes:

1. Was it selected from genuinely different premise directions rather than being the first obvious association?
2. Is its premise fingerprint likely to feel fresh to an experienced quizzer?
3. Is the route fully inferable or meaningfully anchored by independent clues, rather than bare recall?
4. Does the stem preserve the central resolution for the reveal?
5. Does every clue perform a distinct narrowing function?
6. Does the wording naturally prefer one answer at one level of specificity?
7. Does the reveal add understanding that was absent from the stem?
8. Does the declared blueprint match the written question, and does the pair differ on at least three blueprint axes?

Treat any of these premise shapes as an automatic no unless another independent reasoning layer creates substantial reveal gain:

- solving consists only of routine arithmetic on numbers supplied in the stem
- the stem functionally defines an object, term, or mechanism and asks the player to name it
- the route is recognition of a standard answer-and-fact association rather than inference from the supplied evidence
- the stem narrates the causal chain and leaves only its label for the answer
- the intended answer is merely the most specific of several equally defensible names

If any answer is no, discard the candidate and return to premise selection. Do not output the candidate pool, this audit, rejected drafts, or editorial commentary.
