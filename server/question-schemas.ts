function createSourcesSchema(questionId: string) {
  return {
    type: 'array',
    minItems: 1,
    maxItems: 3,
    items: {
      type: 'object',
      additionalProperties: false,
      required: ['id', 'title', 'publisher', 'url'],
      properties: {
        id: { type: 'string', pattern: `^s${questionId.slice(1)}[a-c]$` },
        title: { type: 'string' },
        publisher: { type: 'string' },
        url: { type: 'string' },
      },
    },
  };
}

export const researchRiskFlags = [
  'etymology',
  'first_or_only',
  'invention_origin',
  'quotation',
  'exact_date',
  'disputed_history',
  'internet_folklore',
] as const;

export const blueprintPlayerActions = ['identify', 'connect', 'explain', 'complete', 'compare', 'order'] as const;
export const blueprintEvidenceForms = [
  'narrative',
  'quotation',
  'list',
  'visual',
  'statistic',
  'artifact',
  'timeline',
  'paired_observations',
] as const;
export const blueprintRelationships = [
  'mechanism',
  'cause',
  'consequence',
  'shared_link',
  'transformation',
  'contrast',
  'chronology',
  'cultural_transfer',
] as const;
export const blueprintAnswerContracts = [
  'single_entity',
  'paired_entities',
  'entity_plus_reason',
  'phrase',
  'sequence',
  'relationship',
] as const;

export type ResearchRiskFlag = typeof researchRiskFlags[number];
export type BlueprintPlayerAction = typeof blueprintPlayerActions[number];
export type BlueprintEvidenceForm = typeof blueprintEvidenceForms[number];
export type BlueprintRelationship = typeof blueprintRelationships[number];
export type BlueprintAnswerContract = typeof blueprintAnswerContracts[number];

export interface QuestionBlueprint {
  playerAction: BlueprintPlayerAction;
  evidenceForm: BlueprintEvidenceForm;
  relationship: BlueprintRelationship;
  answerContract: BlueprintAnswerContract;
}

export interface ClaimEvidence {
  claim: string;
  sourceIds: string[];
  supportType: 'direct' | 'indirect';
}

export interface QuestionResearch {
  candidateId: string;
  blueprint: QuestionBlueprint;
  claims: ClaimEvidence[];
  riskFlags: ResearchRiskFlag[];
  conflictsFound: boolean;
}

function createQuestionResearchSchema(questionId: string) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['candidateId', 'blueprint', 'claims', 'riskFlags', 'conflictsFound'],
    properties: {
      candidateId: { type: 'string', enum: [questionId] },
      blueprint: {
        type: 'object',
        additionalProperties: false,
        required: ['playerAction', 'evidenceForm', 'relationship', 'answerContract'],
        properties: {
          playerAction: { type: 'string', enum: [...blueprintPlayerActions] },
          evidenceForm: { type: 'string', enum: [...blueprintEvidenceForms] },
          relationship: { type: 'string', enum: [...blueprintRelationships] },
          answerContract: { type: 'string', enum: [...blueprintAnswerContracts] },
        },
      },
      claims: {
        type: 'array',
        minItems: 1,
        maxItems: 6,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['claim', 'sourceIds', 'supportType'],
          properties: {
            claim: { type: 'string', minLength: 4, maxLength: 180 },
            sourceIds: {
              type: 'array',
              minItems: 1,
              maxItems: 3,
              items: { type: 'string', pattern: `^s${questionId.slice(1)}[a-c]$` },
            },
            supportType: { type: 'string', enum: ['direct', 'indirect'] },
          },
        },
      },
      riskFlags: {
        type: 'array',
        maxItems: researchRiskFlags.length,
        items: { type: 'string', enum: [...researchRiskFlags] },
      },
      conflictsFound: { type: 'boolean' },
    },
  };
}

export function createOpenEndedQuestionSchema(questionId: string, position: number) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['id', 'position', 'label', 'format', 'context', 'prompt', 'answer', 'sources'],
    properties: {
      id: { type: 'string', enum: [questionId] },
      position: { type: 'integer', enum: [position] },
      label: { type: 'string', pattern: "^[A-Z0-9 &'â€™-]+$", maxLength: 32 },
      format: { type: 'string', enum: ['open_ended'] },
      context: { type: 'string', minLength: 40, maxLength: 700 },
      prompt: { type: 'string', minLength: 8, maxLength: 220 },
      answer: {
        type: 'object',
        additionalProperties: false,
        required: ['short', 'explanation'],
        properties: {
          short: { type: 'string', minLength: 1, maxLength: 60 },
          explanation: { type: 'string', minLength: 30, maxLength: 500 },
        },
      },
      sources: createSourcesSchema(questionId),
    },
  };
}

export function createProgressiveCluesQuestionSchema(questionId: string, position: number) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['id', 'position', 'label', 'format', 'prompt', 'clues', 'answer', 'sources'],
    properties: {
      id: { type: 'string', enum: [questionId] },
      position: { type: 'integer', enum: [position] },
      label: { type: 'string', enum: ['3 CLUES'] },
      format: { type: 'string', enum: ['progressive_clues'] },
      prompt: { type: 'string', minLength: 8, maxLength: 100 },
      clues: {
        type: 'array',
        minItems: 3,
        maxItems: 3,
        items: { type: 'string', minLength: 10, maxLength: 180 },
      },
      answer: {
        type: 'object',
        additionalProperties: false,
        required: ['short', 'explanation'],
        properties: {
          short: { type: 'string', minLength: 1, maxLength: 60 },
          explanation: { type: 'string', minLength: 30, maxLength: 500 },
        },
      },
      sources: createSourcesSchema(questionId),
    },
  };
}

export function createMixedQuizGenerationSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    required: [
      'title',
      'teaser',
      'openEndedQuestion',
      'progressiveCluesQuestion',
      'openEndedResearch',
      'progressiveCluesResearch',
    ],
    properties: {
      title: { type: 'string' },
      teaser: { type: 'string' },
      openEndedQuestion: createOpenEndedQuestionSchema('q01', 1),
      progressiveCluesQuestion: createProgressiveCluesQuestionSchema('q02', 2),
      openEndedResearch: createQuestionResearchSchema('q01'),
      progressiveCluesResearch: createQuestionResearchSchema('q02'),
    },
  };
}
