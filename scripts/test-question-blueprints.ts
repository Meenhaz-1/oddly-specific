import assert from 'node:assert/strict';
import { countBlueprintDifferences, validateBlueprintPair } from '../server/question-blueprints.js';
import { createMixedQuizGenerationSchema } from '../server/question-schemas.js';

const openBlueprint = {
  playerAction: 'connect', evidenceForm: 'paired_observations', relationship: 'shared_link', answerContract: 'relationship',
} as const;
const progressiveBlueprint = {
  playerAction: 'identify', evidenceForm: 'timeline', relationship: 'chronology', answerContract: 'single_entity',
} as const;

assert.equal(countBlueprintDifferences(openBlueprint, progressiveBlueprint), 4);
assert.deepEqual(validateBlueprintPair(openBlueprint, progressiveBlueprint), []);
assert.equal(validateBlueprintPair(openBlueprint, { ...openBlueprint, evidenceForm: 'quotation' }).length > 0, true);

const schema = createMixedQuizGenerationSchema();
assert.deepEqual(schema.required.slice(0, 4), ['title', 'teaser', 'openEndedQuestion', 'progressiveCluesQuestion']);
assert.equal(schema.properties.openEndedQuestion.properties.format.enum[0], 'open_ended');
assert.equal(schema.properties.progressiveCluesQuestion.properties.format.enum[0], 'progressive_clues');
assert.ok(schema.properties.openEndedResearch.properties.blueprint);

console.log('Question blueprint and public-format schema checks passed.');
