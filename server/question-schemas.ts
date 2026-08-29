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
    required: ['title', 'teaser', 'openEndedQuestion', 'progressiveCluesQuestion'],
    properties: {
      title: { type: 'string' },
      teaser: { type: 'string' },
      openEndedQuestion: createOpenEndedQuestionSchema('q01', 1),
      progressiveCluesQuestion: createProgressiveCluesQuestionSchema('q02', 2),
    },
  };
}
