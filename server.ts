import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import express from 'express';
import OpenAI from 'openai';
import { waitUntil } from '@vercel/functions';
import type { InputTokenCountParams } from 'openai/resources/responses/input-tokens';
import type { ResponseCreateParamsNonStreaming } from 'openai/resources/responses/responses';
import type { GeneratedQuestion, GeneratedQuiz, OpenEndedQuestion, ProgressiveCluesQuestion } from './src/types';
import { GENERATED_QUESTION_COUNT } from './src/constants.js';
import {
  buildEvaluatorInput,
  buildGeneratorInput,
  getEvaluatorInstructions,
  getGeneratorInstructions,
  getPromptCacheKey,
} from './server/prompts.js';
import { validateTopic } from './server/topic.js';
import {
  applyEvaluationRewrite,
  deduplicateQuestionsByShortAnswer,
  validateGeneratedQuiz,
  validateGeneratedQuestion,
  validatePlayerFacingQuestion,
} from './server/question-validation.js';
import {
  createMixedQuizGenerationSchema,
  type QuestionResearch,
} from './server/question-schemas.js';
import { validateBlueprintPair } from './server/question-blueprints.js';
import {
  fetchRandomArchiveQuiz,
  fetchSharedQuiz,
  isSupabaseConfigured,
  markEvaluationFailed,
  persistEvaluations,
  persistGeneratedQuiz,
  saveQuestionFeedback,
  syncPromptVersions,
  type ResponseAudit,
} from './server/persistence.js';

const app = express();
app.disable('x-powered-by');
const port = Number(process.env.PORT || 5173);

type ResponseCreateParamsWithToolLimit = ResponseCreateParamsNonStreaming & { max_tool_calls: number };

function withToolCallLimit(
  params: ResponseCreateParamsNonStreaming,
  maxToolCalls: number,
): ResponseCreateParamsWithToolLimit {
  return { ...params, max_tool_calls: maxToolCalls };
}
const defaultModel = process.env.OPENAI_MODEL || 'gpt-5.4-mini';
const generatorModel = process.env.OPENAI_GENERATOR_MODEL || defaultModel;
const evaluatorModel = process.env.OPENAI_EVALUATOR_MODEL || defaultModel;
const generatorPromptCacheKey = getPromptCacheKey('generator');
const evaluatorPromptCacheKey = getPromptCacheKey('evaluator');

function continueAfterResponse(task: Promise<void>): void {
  if (process.env.VERCEL) {
    // Keep evaluation and persistence alive after the serverless response is sent.
    waitUntil(task);
    return;
  }
  void task;
}

interface ResponseUsage {
  input_tokens?: number;
  input_tokens_details?: { cached_tokens?: number; cache_write_tokens?: number } | null;
  output_tokens?: number;
  output_tokens_details?: { reasoning_tokens?: number } | null;
  total_tokens?: number;
}

function promptCacheConfig(model: string, promptCacheKey: string) {
  return {
    prompt_cache_key: promptCacheKey,
    ...(model.startsWith('gpt-5.5') ? { prompt_cache_retention: '24h' as const } : {}),
  };
}

function cacheHitRate(usage?: ResponseUsage | null): number | null {
  const inputTokens = usage?.input_tokens;
  const cachedTokens = usage?.input_tokens_details?.cached_tokens;
  if (!inputTokens || cachedTokens === undefined) return null;
  return cachedTokens / inputTokens;
}

function apiErrorDetails(error: unknown): { status?: number; message: string } {
  if (!(error instanceof Error)) return { message: String(error) };
  const possibleStatus = (error as Error & { status?: unknown }).status;
  return { status: typeof possibleStatus === 'number' ? possibleStatus : undefined, message: error.message };
}

function responseStats(result: {
  id?: string;
  usage?: ResponseUsage | null;
  output?: Array<{ type?: string }>;
}, initialInputTokens: number | null = null): string {
  const usage = result.usage;
  const webSearches = result.output?.filter((item) => item.type === 'web_search_call').length ?? 0;
  const cachedTokens = usage?.input_tokens_details?.cached_tokens;
  const cacheWriteTokens = usage?.input_tokens_details?.cache_write_tokens;
  const reasoningTokens = usage?.output_tokens_details?.reasoning_tokens;
  const toolLoopTokens = usage?.input_tokens !== undefined && initialInputTokens !== null
    ? Math.max(0, usage.input_tokens - initialInputTokens)
    : null;
  const hitRate = cacheHitRate(usage);
  return [
    result.id ? `response=${result.id}` : null,
    usage ? `tokens=${usage.input_tokens ?? '?'} in/${usage.output_tokens ?? '?'} out/${usage.total_tokens ?? '?'} total` : null,
    cachedTokens === undefined ? null : `cache=${cachedTokens} tokens/${hitRate === null ? '?' : `${(hitRate * 100).toFixed(1)}%`}`,
    cacheWriteTokens === undefined ? null : `cache-write=${cacheWriteTokens}`,
    initialInputTokens === null ? null : `initial-input=${initialInputTokens}`,
    toolLoopTokens === null ? null : `tool-loop-input=${toolLoopTokens}`,
    reasoningTokens === undefined ? null : `reasoning-output=${reasoningTokens}`,
    `web-search calls=${webSearches}`,
  ].filter(Boolean).join(', ');
}

function responseAudit(result: {
  id?: string;
  usage?: ResponseUsage | null;
  output?: Array<{ type?: string }>;
}, durationMs: number, promptCacheKey: string, initialInputTokens: number | null): ResponseAudit {
  const inputTokens = result.usage?.input_tokens ?? null;
  const cachedInputTokens = result.usage?.input_tokens_details?.cached_tokens ?? null;
  const outputTokens = result.usage?.output_tokens ?? null;
  const reasoningOutputTokens = result.usage?.output_tokens_details?.reasoning_tokens ?? null;
  return {
    responseId: result.id ?? null,
    inputTokens,
    initialInputTokens,
    toolLoopInputTokens: inputTokens !== null && initialInputTokens !== null
      ? Math.max(0, inputTokens - initialInputTokens)
      : null,
    cachedInputTokens,
    uncachedInputTokens: inputTokens !== null ? Math.max(0, inputTokens - (cachedInputTokens ?? 0)) : null,
    cacheWriteInputTokens: result.usage?.input_tokens_details?.cache_write_tokens ?? null,
    cacheHitRate: cacheHitRate(result.usage),
    outputTokens,
    reasoningOutputTokens,
    visibleOutputTokens: outputTokens !== null ? Math.max(0, outputTokens - (reasoningOutputTokens ?? 0)) : null,
    totalTokens: result.usage?.total_tokens ?? null,
    webSearchCalls: result.output?.filter((item) => item.type === 'web_search_call').length ?? 0,
    durationMs,
    promptCacheKey,
  };
}

function mergeResponseAudits(first: ResponseAudit, second: ResponseAudit, durationMs: number): ResponseAudit {
  const sumNullable = (left: number | null, right: number | null): number | null =>
    left === null && right === null ? null : (left ?? 0) + (right ?? 0);
  const inputTokens = sumNullable(first.inputTokens, second.inputTokens);
  const cachedInputTokens = sumNullable(first.cachedInputTokens, second.cachedInputTokens);
  const outputTokens = sumNullable(first.outputTokens, second.outputTokens);
  const reasoningOutputTokens = sumNullable(first.reasoningOutputTokens, second.reasoningOutputTokens);
  return {
    responseId: [first.responseId, second.responseId].filter(Boolean).join(',') || null,
    inputTokens,
    initialInputTokens: sumNullable(first.initialInputTokens, second.initialInputTokens),
    toolLoopInputTokens: sumNullable(first.toolLoopInputTokens, second.toolLoopInputTokens),
    cachedInputTokens,
    uncachedInputTokens: inputTokens === null ? null : Math.max(0, inputTokens - (cachedInputTokens ?? 0)),
    cacheWriteInputTokens: sumNullable(first.cacheWriteInputTokens, second.cacheWriteInputTokens),
    cacheHitRate: inputTokens ? (cachedInputTokens ?? 0) / inputTokens : null,
    outputTokens,
    reasoningOutputTokens,
    visibleOutputTokens: outputTokens === null ? null : Math.max(0, outputTokens - (reasoningOutputTokens ?? 0)),
    totalTokens: sumNullable(first.totalTokens, second.totalTokens),
    webSearchCalls: first.webSearchCalls + second.webSearchCalls,
    durationMs,
    promptCacheKey: first.promptCacheKey,
  };
}

function responseUsedWebSearch(result: { output?: Array<{ type?: string }> }): boolean {
  return result.output?.some((item) => item.type === 'web_search_call') ?? false;
}

function researchRequiresIndependentSearch(research?: QuestionResearch): boolean {
  return !research ||
    research.claims.length === 0 ||
    research.conflictsFound ||
    research.riskFlags.length > 0 ||
    research.claims.some((claim) => claim.supportType !== 'direct');
}

function inputTokenCountParams(params: ResponseCreateParamsNonStreaming): InputTokenCountParams {
  return {
    model: params.model,
    instructions: params.instructions,
    input: params.input,
    parallel_tool_calls: params.parallel_tool_calls,
    reasoning: params.reasoning,
    text: params.text,
    tool_choice: params.tool_choice,
    tools: params.tools,
    truncation: params.truncation ?? undefined,
  };
}

async function countInitialInputTokens(
  openai: OpenAI,
  params: ResponseCreateParamsNonStreaming,
  runId: string,
): Promise<number | null> {
  try {
    const result = await openai.responses.inputTokens.count(inputTokenCountParams(params));
    return result.input_tokens;
  } catch (error) {
    console.warn(`[${runId}] Initial input token count unavailable | ${apiErrorDetails(error).message}`);
    return null;
  }
}

interface CandidateEvaluation {
  candidateId: string;
  decision: 'ACCEPT' | 'REWRITE' | 'REJECT';
  scores: {
    solvability: number;
    revealQuality: number;
    clueDiscipline: number;
    originality: number;
    answerPrecision: number;
    wordingEfficiency: number;
  };
  overall: number;
  clueLeakageIssues: string[];
  alternativeAnswers: Array<{ answer: string; assessment: string }>;
  factualConfidence: 'High' | 'Medium' | 'Low';
  verification: {
    mode: 'generator_research' | 'independent_web_search';
    evidenceStatus: 'complete' | 'incomplete' | 'conflicting';
    independentSearchRequired: boolean;
    searchReason: string;
  };
  decisionRationale: string;
  rewrite: {
    applied: boolean;
    context: string;
    prompt: string;
    clues: string[];
    answerShort: string;
    answerExplanation: string;
    score: number;
  };
}

interface EvaluationResult {
  evaluations: CandidateEvaluation[];
}

function passesShippingBar(evaluation: CandidateEvaluation, question: GeneratedQuestion): boolean {
  const finalQuestion = applyEvaluationRewrite(question, evaluation.rewrite);
  return (
    evaluation.decision !== 'REJECT' &&
    evaluation.overall >= 4 &&
    evaluation.scores.solvability >= 4 &&
    evaluation.scores.revealQuality >= 4 &&
    evaluation.scores.clueDiscipline >= 4 &&
    evaluation.scores.answerPrecision >= 4 &&
    evaluation.factualConfidence !== 'Low' &&
    (!evaluation.rewrite.applied || evaluation.rewrite.score >= 4) &&
    validateGeneratedQuestion(finalQuestion).length === 0
  );
}

const candidateDirections = [
  {
    label: 'QUANTITATIVE CONSTRAINT',
    direction: 'a quantitative constraint whose result changes how the subject is understood, not routine arithmetic',
  },
  { label: 'HIDDEN PURPOSE', direction: 'hidden purpose or overlooked urban mechanism' },
  {
    label: 'CROSS-DOMAIN CONNECTION',
    direction: 'a semantic connection between evidence from different domains; exclude direct etymology or naming recall unless another independent reasoning layer exists',
  },
  { label: 'REVERSE ENGINEER', direction: 'reverse-engineer a familiar object or artifact' },
  {
    label: 'HISTORICAL CONSEQUENCE',
    direction: 'a historical consequence inferred from a constraint, not a standard origin story',
  },
  { label: 'SCIENTIFIC MECHANISM', direction: 'scientific or biological mechanism' },
  { label: 'ECONOMIC INCENTIVE', direction: 'economic incentive or unintended consequence' },
  { label: 'GEOGRAPHIC INFERENCE', direction: 'geographic inference from an unusual constraint' },
  { label: 'ORIGINAL USE', direction: 'original use that differs from the modern use' },
  { label: 'SURPRISING CONNECTION', direction: 'surprising connection between two well-supported facts' },
] as const;

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, mapper: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

async function withSingleRetry<T>(label: string, task: () => Promise<T>): Promise<T> {
  try {
    return await task();
  } catch (firstError) {
    const details = apiErrorDetails(firstError);
    console.warn(`${label} failed; retrying once.`, details.status || '', details.message);
    await new Promise((resolve) => setTimeout(resolve, 750));
    return task();
  }
}

app.use(express.json({ limit: '100kb' }));

function createQuizSchema(questionCount: number) {
  const questionIds = Array.from({ length: questionCount }, (_, index) => `q${String(index + 1).padStart(2, '0')}`);
  return {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'teaser', 'questions'],
  properties: {
    title: { type: 'string' },
    teaser: { type: 'string' },
    questions: {
      type: 'array',
      minItems: questionCount,
      maxItems: questionCount,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'position', 'label', 'format', 'context', 'prompt', 'answer', 'sources'],
        properties: {
          id: { type: 'string', enum: questionIds },
          position: { type: 'integer', minimum: 1, maximum: 10 },
          label: { type: 'string', pattern: "^[A-Z0-9 &'’-]+$", maxLength: 32 },
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
          sources: {
            type: 'array',
            minItems: 1,
            maxItems: 3,
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['id', 'title', 'publisher', 'url'],
              properties: {
                id: { type: 'string', pattern: '^s[0-9]{2}[a-c]$' },
                title: { type: 'string' },
                publisher: { type: 'string' },
                url: { type: 'string' },
              },
            },
          },
        },
      },
    },
  },
  };
}

function createEvaluationSchema(candidateCount: number) {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['evaluations'],
    properties: {
      evaluations: {
        type: 'array',
        minItems: candidateCount,
        maxItems: candidateCount,
        items: {
          type: 'object',
          additionalProperties: false,
          required: [
            'candidateId',
            'decision',
            'scores',
            'overall',
            'clueLeakageIssues',
            'alternativeAnswers',
            'factualConfidence',
            'verification',
            'decisionRationale',
            'rewrite',
          ],
          properties: {
            candidateId: { type: 'string' },
            decision: { type: 'string', enum: ['ACCEPT', 'REWRITE', 'REJECT'] },
            scores: {
              type: 'object',
              additionalProperties: false,
              required: ['solvability', 'revealQuality', 'clueDiscipline', 'originality', 'answerPrecision', 'wordingEfficiency'],
              properties: {
                solvability: { type: 'integer', minimum: 1, maximum: 5 },
                revealQuality: { type: 'integer', minimum: 1, maximum: 5 },
                clueDiscipline: { type: 'integer', minimum: 1, maximum: 5 },
                originality: { type: 'integer', minimum: 1, maximum: 5 },
                answerPrecision: { type: 'integer', minimum: 1, maximum: 5 },
                wordingEfficiency: { type: 'integer', minimum: 1, maximum: 5 },
              },
            },
            overall: { type: 'number', minimum: 1, maximum: 5 },
            clueLeakageIssues: { type: 'array', items: { type: 'string' } },
            alternativeAnswers: {
              type: 'array',
              minItems: 3,
              maxItems: 3,
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['answer', 'assessment'],
                properties: { answer: { type: 'string' }, assessment: { type: 'string' } },
              },
            },
            factualConfidence: { type: 'string', enum: ['High', 'Medium', 'Low'] },
            verification: {
              type: 'object',
              additionalProperties: false,
              required: ['mode', 'evidenceStatus', 'independentSearchRequired', 'searchReason'],
              properties: {
                mode: { type: 'string', enum: ['generator_research', 'independent_web_search'] },
                evidenceStatus: { type: 'string', enum: ['complete', 'incomplete', 'conflicting'] },
                independentSearchRequired: { type: 'boolean' },
                searchReason: { type: 'string' },
              },
            },
            decisionRationale: { type: 'string' },
            rewrite: {
              type: 'object',
              additionalProperties: false,
              required: ['applied', 'context', 'prompt', 'clues', 'answerShort', 'answerExplanation', 'score'],
              properties: {
                applied: { type: 'boolean' },
                context: { type: 'string' },
                prompt: { type: 'string' },
                clues: { type: 'array', minItems: 0, maxItems: 3, items: { type: 'string' } },
                answerShort: { type: 'string' },
                answerExplanation: { type: 'string' },
                score: { type: 'number', minimum: 0, maximum: 5 },
              },
            },
          },
        },
      },
    },
  };
}

async function evaluateQuestionsInBackground(
  openai: OpenAI,
  questions: GeneratedQuestion[],
  generatorResearch: QuestionResearch[],
  parentRunId: string,
): Promise<{ evaluations: CandidateEvaluation[]; audit: ResponseAudit } | { error: string }> {
  const runId = `${parentRunId}-EVAL`;
  const startedAt = Date.now();
  const maxWebSearchCalls = Math.min(2, Math.max(1, questions.length));
  console.log(
    `[${runId}] Background evaluation started for ${questions.length} questions with ${evaluatorModel} ` +
    `(generator research supplied, conditional web search, max calls=${maxWebSearchCalls}).`,
  );
  try {
    const runEvaluation = async (
      targetQuestions: GeneratedQuestion[],
      targetResearch: QuestionResearch[],
      toolChoice: 'auto' | 'required',
      suffix: string,
    ) => {
      const evaluationRunId = suffix ? `${runId}-${suffix}` : runId;
      const evaluationRequest = withToolCallLimit({
        model: evaluatorModel,
        instructions: getEvaluatorInstructions(),
        input: buildEvaluatorInput(
          JSON.stringify({ questions: targetQuestions, generatorResearch: targetResearch }),
          toolChoice === 'required'
            ? 'Independently verify the unresolved candidates with web search, then return the structured decisions.'
            : 'Evaluate every candidate independently. Reuse complete low-risk generator research and search only when the verification rules require it.',
        ),
        ...promptCacheConfig(evaluatorModel, evaluatorPromptCacheKey),
        tools: [{ type: 'web_search' }],
        tool_choice: toolChoice,
        reasoning: { effort: 'medium' },
        text: {
          format: {
            type: 'json_schema',
            name: suffix ? 'fallback_candidate_evaluations' : 'background_candidate_evaluations',
            strict: true,
            schema: createEvaluationSchema(targetQuestions.length),
          },
        },
        max_output_tokens: 18000,
        store: false,
      }, Math.min(maxWebSearchCalls, Math.max(1, targetQuestions.length)));
      const initialInputPromise = countInitialInputTokens(openai, evaluationRequest, evaluationRunId);
      const response = await openai.responses.create(evaluationRequest);
      const initialInputTokens = await initialInputPromise;
      return {
        response,
        result: JSON.parse(response.output_text) as EvaluationResult,
        audit: responseAudit(response, Date.now() - startedAt, evaluatorPromptCacheKey, initialInputTokens),
      };
    };

    const initial = await runEvaluation(questions, generatorResearch, 'auto', '');
    let evaluationResult = initial.result;
    let evaluationAudit = initial.audit;
    const initialUsedWebSearch = responseUsedWebSearch(initial.response);
    console.log(
      `[${runId}] Conditional evaluation pass completed in ${Math.round((Date.now() - startedAt) / 1000)}s ` +
      `(${responseStats(initial.response, initial.audit.initialInputTokens)}).`,
    );

    const researchByCandidate = new Map(generatorResearch.map((research) => [research.candidateId, research]));
    const evaluationByCandidate = new Map(evaluationResult.evaluations.map((evaluation) => [evaluation.candidateId, evaluation]));
    const fallbackQuestions = questions.filter((question) => {
      const evaluation = evaluationByCandidate.get(question.id);
      if (!evaluation || !passesShippingBar(evaluation, question)) return false;
      const verificationRequiresSearch =
        researchRequiresIndependentSearch(researchByCandidate.get(question.id)) ||
        evaluation.verification.independentSearchRequired ||
        evaluation.verification.evidenceStatus !== 'complete' ||
        evaluation.verification.mode === 'independent_web_search';
      const independentlyVerified = initialUsedWebSearch && evaluation.verification.mode === 'independent_web_search';
      return verificationRequiresSearch && !independentlyVerified;
    });

    if (fallbackQuestions.length > 0) {
      const fallbackIds = new Set(fallbackQuestions.map((question) => question.id));
      const fallbackResearch = generatorResearch.filter((research) => fallbackIds.has(research.candidateId));
      console.log(
        `[${runId}] Forcing independent verification for ${fallbackQuestions.length} shipping candidate(s): ` +
        fallbackQuestions.map((question) => question.id).join(', '),
      );
      const fallback = await runEvaluation(fallbackQuestions, fallbackResearch, 'required', 'VERIFY');
      const replacementByCandidate = new Map(
        fallback.result.evaluations.map((evaluation) => [evaluation.candidateId, evaluation]),
      );
      evaluationResult = {
        evaluations: evaluationResult.evaluations.map(
          (evaluation) => replacementByCandidate.get(evaluation.candidateId) ?? evaluation,
        ),
      };
      evaluationAudit = mergeResponseAudits(initial.audit, fallback.audit, Date.now() - startedAt);
      console.log(
        `[${runId}] Forced verification completed ` +
        `(${responseStats(fallback.response, fallback.audit.initialInputTokens)}).`,
      );
    }

    for (const evaluation of evaluationResult.evaluations) {
      const question = questions.find((candidate) => candidate.id === evaluation.candidateId);
      const ships = question ? passesShippingBar(evaluation, question) : false;
      const copyIssues = question
        ? validateGeneratedQuestion(applyEvaluationRewrite(question, evaluation.rewrite))
        : [];
      const rewrite = evaluation.rewrite.applied ? ` | rewrite=${evaluation.rewrite.score.toFixed(1)}` : '';
      console.log(
        `[${runId}] ${evaluation.candidateId} | ${evaluation.decision} | overall=${evaluation.overall.toFixed(1)} | ` +
        `confidence=${evaluation.factualConfidence} | verification=${evaluation.verification.mode} | ` +
        `ships=${ships ? 'YES' : 'NO'}${rewrite}`,
      );
      if (copyIssues.length > 0) {
        console.warn(`[${runId}] ${evaluation.candidateId} failed deterministic player-copy validation.`, {
          issues: copyIssues.map(({ code, field }) => ({ code, field })),
        });
      }
    }
    return {
      evaluations: evaluationResult.evaluations,
      audit: evaluationAudit,
    };
  } catch (error) {
    const details = apiErrorDetails(error);
    console.error(
      `[${runId}] Background evaluation failed after ${Math.round((Date.now() - startedAt) / 1000)}s:`,
      details.status || '',
      details.message,
    );
    return { error: details.message };
  }
}

async function runBackgroundWorkflow(
  openai: OpenAI,
  quiz: GeneratedQuiz,
  generatorResearch: QuestionResearch[],
  topic: string,
  externalRunId: string,
  runId: string,
  generationAudit: ResponseAudit,
): Promise<void> {
  const savePromise = persistGeneratedQuiz({
    runId,
    externalRunId,
    topic,
    generatorModel,
    evaluatorModel,
    quiz,
    generation: generationAudit,
    generatorResearch,
  });
  const evaluationOutcome = await evaluateQuestionsInBackground(openai, quiz.questions, generatorResearch, externalRunId);
  const generationSaved = await savePromise;
  if ('error' in evaluationOutcome) {
    if (generationSaved) await markEvaluationFailed(runId, externalRunId, evaluationOutcome.error);
    return;
  }
  if (!generationSaved) {
    console.warn(`[${externalRunId}-DB] Evaluation finished but cannot be attached because generation persistence failed.`);
    return;
  }
  await persistEvaluations(
    runId,
    externalRunId,
    evaluationOutcome.evaluations.map((evaluation) => ({
      ...evaluation,
      ships: (() => {
        const question = quiz.questions.find((candidate) => candidate.id === evaluation.candidateId);
        return question ? passesShippingBar(evaluation, question) : false;
      })(),
    })),
    evaluationOutcome.audit,
  );
}

const feedbackRateLimits = new Map<string, { count: number; resetAt: number }>();
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function feedbackRateLimitAllows(ip: string): boolean {
  const now = Date.now();
  const current = feedbackRateLimits.get(ip);
  if (!current || current.resetAt <= now) {
    feedbackRateLimits.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (current.count >= 60) return false;
  current.count += 1;
  return true;
}

app.get('/api/health', (_request, response) => {
  response.json({
    ok: true,
    openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
    supabaseConfigured: isSupabaseConfigured(),
    generatorModel,
    evaluatorModel,
  });
});

app.get('/api/quizzes/:runId', async (request, response) => {
  const runId = String(request.params.runId || '').trim();
  if (!uuidPattern.test(runId)) return response.status(400).json({ error: 'Provide a valid quiz run ID.' });
  if (!isSupabaseConfigured()) return response.status(503).json({ error: 'Shared quizzes are not configured.' });

  try {
    const quiz = await fetchSharedQuiz(runId);
    if (!quiz) return response.status(404).json({ error: 'This shared quiz could not be found.' });
    const playerCopyIssues = validateGeneratedQuiz(quiz);
    if (playerCopyIssues.length > 0) {
      console.warn(`[SHARE] Stored quiz ${runId} failed player-copy validation.`, {
        issues: playerCopyIssues.map(({ code, field }) => ({ code, field })),
      });
      return response.status(404).json({ error: 'This shared quiz is unavailable.' });
    }
    response.setHeader('Cache-Control', 'public, max-age=60, s-maxage=300');
    return response.json(quiz);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[SHARE] Could not load run ${runId} | ${message}`);
    return response.status(502).json({ error: 'Could not load this shared quiz. Please try again.' });
  }
});

app.post('/api/random-quiz', async (request, response) => {
  const requestedCount = request.body?.count;
  const exclusions = request.body?.excludeQuestionIds;
  if (!Number.isInteger(requestedCount) || requestedCount < 1 || requestedCount > 10) {
    return response.status(400).json({ error: 'Count must be an integer between 1 and 10.' });
  }
  if (!Array.isArray(exclusions) || exclusions.length > 500 || !exclusions.every((id) => typeof id === 'string' && uuidPattern.test(id))) {
    return response.status(400).json({ error: 'excludeQuestionIds must contain at most 500 valid UUIDs.' });
  }
  if (!isSupabaseConfigured()) {
    return response.status(503).json({ error: 'The question archive is not configured.' });
  }

  try {
    const quiz = await fetchRandomArchiveQuiz(requestedCount, [...new Set(exclusions)]);
    if (!quiz) {
      return response.status(404).json({ error: 'The archive does not have any vetted questions yet.' });
    }
    const questions = deduplicateQuestionsByShortAnswer(
      quiz.questions.filter((question) => validatePlayerFacingQuestion(question).length === 0),
    );
    if (questions.length !== requestedCount) {
      console.error(`[ARCHIVE] Requested ${requestedCount} questions but only ${questions.length} valid distinct questions were returned.`);
      return response.status(404).json({
        error: `The archive does not currently have ${requestedCount} distinct vetted questions available.`,
      });
    }
    return response.json({
      ...quiz,
      title: `${questions.length} Questions from the Archive`,
      teaser: `${questions.length} good ${questions.length === 1 ? 'question' : 'questions'}, mixed across subjects and pulled from the archive.`,
      questions: questions.map((question, index) => ({ ...question, position: index + 1 })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[ARCHIVE] Random quiz failed | ${message}`);
    return response.status(502).json({ error: 'Could not pick questions from the archive. Please try again.' });
  }
});

app.put('/api/questions/:questionId/feedback', async (request, response) => {
  const questionId = String(request.params.questionId || '').trim();
  const sessionId = String(request.body?.sessionId || '').trim();
  const rating = request.body?.rating;
  if (!uuidPattern.test(questionId) || !uuidPattern.test(sessionId) || !['good', 'weak'].includes(rating)) {
    return response.status(400).json({ error: 'Provide valid questionId, sessionId, and rating.' });
  }
  if (!feedbackRateLimitAllows(request.ip || 'unknown')) {
    return response.status(429).json({ error: 'Too many feedback requests. Try again shortly.' });
  }
  if (!isSupabaseConfigured()) return response.status(503).json({ error: 'Feedback storage is not configured.' });
  try {
    await saveQuestionFeedback(questionId, sessionId, rating as 'good' | 'weak');
    console.log(`[FEEDBACK] question=${questionId.slice(0, 8)} rating=${rating}`);
    return response.json({ ok: true, rating });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[FEEDBACK] Save failed for question=${questionId.slice(0, 8)} | ${message}`);
    return response.status(502).json({ error: 'Could not save feedback. Please try again.' });
  }
});

app.post('/api/generate', async (request, response) => {
  const topicValidation = validateTopic(request.body?.topic);
  const questionCount = GENERATED_QUESTION_COUNT;
  if (!topicValidation.valid) return response.status(400).json({ error: topicValidation.error });
  const { topic } = topicValidation;
  if (!process.env.OPENAI_API_KEY) return response.status(503).json({ error: 'OpenAI is not configured. Add OPENAI_API_KEY to .env and restart the server.' });

  const runId = `GEN-${Date.now().toString(36).toUpperCase()}`;
  const startedAt = Date.now();
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    console.log(`[${runId}] Quiz generation started.`, {
      questionCount,
      model: generatorModel,
      webSearchMaxCalls: 2,
    });
    const generationRequest = withToolCallLimit({
      model: generatorModel,
      instructions: getGeneratorInstructions(),
      input: buildGeneratorInput(
        topic,
        questionCount,
        'Generate exactly two questions in the named schema fields: q01 must be one open-ended question and q02 must be one progressive three-clue question. Return both now.',
      ),
      ...promptCacheConfig(generatorModel, generatorPromptCacheKey),
      tools: [{ type: 'web_search' }],
      reasoning: { effort: 'medium' },
      text: {
        format: {
          type: 'json_schema',
          name: 'mixed_verified_quiz',
          strict: true,
          schema: createMixedQuizGenerationSchema(),
        },
      },
      max_output_tokens: 14000,
      store: false,
    }, 2);
    const initialInputPromise = countInitialInputTokens(openai, generationRequest, runId);
    const result = await openai.responses.create(generationRequest);
    const initialInputTokens = await initialInputPromise;

    const generatedQuiz = JSON.parse(result.output_text) as {
      title: string;
      teaser: string;
      openEndedQuestion: OpenEndedQuestion;
      progressiveCluesQuestion: ProgressiveCluesQuestion;
      openEndedResearch: QuestionResearch;
      progressiveCluesResearch: QuestionResearch;
    };
    const generatorResearch = [generatedQuiz.openEndedResearch, generatedQuiz.progressiveCluesResearch];
    const blueprintIssues = validateBlueprintPair(
      generatedQuiz.openEndedResearch.blueprint,
      generatedQuiz.progressiveCluesResearch.blueprint,
    );
    if (blueprintIssues.length > 0) {
      console.warn(`[${runId}] Generated quiz failed blueprint diversity validation.`, { issues: blueprintIssues });
      return response.status(502).json({ error: 'The generated quiz did not pass our diversity checks. Please try again.' });
    }
    const databaseRunId = randomUUID();
    const quiz: GeneratedQuiz = {
      title: generatedQuiz.title,
      teaser: generatedQuiz.teaser,
      runId: databaseRunId,
      questions: [generatedQuiz.openEndedQuestion, generatedQuiz.progressiveCluesQuestion].map((question) => ({
        ...question,
        questionId: randomUUID(),
      })),
    };
    const playerCopyIssues = validateGeneratedQuiz(quiz);
    if (playerCopyIssues.length > 0) {
      console.warn(`[${runId}] Generated quiz failed deterministic player-copy validation.`, {
        issues: playerCopyIssues.map(({ code, field }) => ({ code, field })),
      });
      return response.status(502).json({ error: 'The generated quiz did not pass our quality checks. Please try again.' });
    }
    const generationAudit = responseAudit(result, Date.now() - startedAt, generatorPromptCacheKey, initialInputTokens);
    console.log(`[${runId}] OpenAI completed in ${Math.round((Date.now() - startedAt) / 1000)}s (${responseStats(result, initialInputTokens)}).`);
    for (const candidate of quiz.questions) {
      console.log(`[${runId}] Candidate generated.`, {
        candidateId: candidate.id,
        label: candidate.label,
        sourceCount: candidate.sources.length,
      });
    }
    console.log(`[${runId}] Sending questions to the webpage now; evaluation will continue in the background.`);
    response.json(quiz);
    continueAfterResponse(
      runBackgroundWorkflow(openai, quiz, generatorResearch, topic, runId, databaseRunId, generationAudit),
    );
  } catch (error) {
    const details = apiErrorDetails(error);
    console.error(`[${runId}] Quiz generation failed after ${Math.round((Date.now() - startedAt) / 1000)}s:`, details.status || '', details.message);
    const message = details.status === 401 ? 'The OpenAI API key was rejected.' : 'Quiz generation failed. Please try again.';
    response.status(details.status === 401 ? 401 : 502).json({ error: message });
  }
});

app.post('/api/pipeline-test', async (request, response) => {
  if (process.env.NODE_ENV === 'production' || process.env.VERCEL) {
    return response.status(404).json({ error: 'Not found.' });
  }
  const topicValidation = validateTopic(request.body?.topic);
  const requestedCount = Number(request.query.candidateCount ?? request.body?.candidateCount ?? 8);
  const candidateCount = Number.isInteger(requestedCount) && requestedCount >= 3 && requestedCount <= 10 ? requestedCount : 8;
  if (!topicValidation.valid) return response.status(400).json({ error: topicValidation.error });
  const { topic } = topicValidation;
  if (!process.env.OPENAI_API_KEY) return response.status(503).json({ error: 'OpenAI is not configured.' });

  const streaming = request.query.stream === '1';
  if (streaming) {
    response.status(200);
    response.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('X-Accel-Buffering', 'no');
    response.flushHeaders();
  }

  const runId = `PIPE-${Date.now().toString(36).toUpperCase()}`;
  const startedAt = Date.now();
  let currentStage = 'Starting pipeline';
  const writeEvent = (event: Record<string, unknown>) => {
    if (streaming) response.write(`${JSON.stringify(event)}\n`);
  };
  const logStage = (message: string) => {
    currentStage = message;
    console.log(`[${runId}] ${message}`);
    writeEvent({ type: 'log', runId, elapsedSeconds: Math.round((Date.now() - startedAt) / 1000), message });
  };
  const heartbeat = streaming
    ? setInterval(() => {
        writeEvent({
          type: 'heartbeat',
          runId,
          elapsedSeconds: Math.round((Date.now() - startedAt) / 1000),
          stage: currentStage,
        });
      }, 10_000)
    : undefined;

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    logStage(`Request received | topicCharacters=${Array.from(topic).length} | candidates=${candidateCount}`);
    logStage(`Models | generator=${generatorModel} | evaluator=${evaluatorModel} | reasoning=medium | web-search=enabled`);
    const concurrency = Math.min(3, candidateCount);
    const slots = Array.from({ length: candidateCount }, (_, index) => index);
    let completed = 0;
    logStage(`Hybrid pipeline started | workers=${concurrency} | each candidate is evaluated immediately after generation`);

    const processed = await mapWithConcurrency(slots, concurrency, async (_slot, index) => {
      const candidateNumber = index + 1;
      const candidateId = `q${String(candidateNumber).padStart(2, '0')}`;
      const assignment = candidateDirections[index % candidateDirections.length];
      const generationStartedAt = Date.now();
      logStage(`GEN START ${candidateId} | direction=${assignment.direction}`);

      const { generationResponse, rawCandidate } = await withSingleRetry(`GEN ${candidateId}`, async () => {
        const response = await openai.responses.create(withToolCallLimit({
          model: generatorModel,
          instructions: getGeneratorInstructions(),
          input: buildGeneratorInput(
            topic,
            1,
            `Generate exactly one candidate for slot ${candidateNumber}. Explore this direction first: ${assignment.direction}. ` +
              'Treat it as a search lens, not a requirement: abandon it if no premise in that direction clears the silent selection gate. ' +
              'Return only a premise that is open-ended, inferable, source-verifiable, and likely to clear the evaluator shipping bar.',
          ),
          ...promptCacheConfig(generatorModel, generatorPromptCacheKey),
          tools: [{ type: 'web_search' }],
          reasoning: { effort: 'medium' },
          text: { format: { type: 'json_schema', name: 'candidate_generation', strict: true, schema: createQuizSchema(1) } },
          max_output_tokens: 6000,
          store: false,
        }, 1));
        const generated = JSON.parse(response.output_text) as { questions: OpenEndedQuestion[] };
        const generatedCandidate = generated.questions[0];
        if (!generatedCandidate) throw new Error(`Generator returned no question for ${candidateId}.`);
        return { generationResponse: response, rawCandidate: generatedCandidate };
      });
      const candidate: OpenEndedQuestion = {
        ...rawCandidate,
        id: candidateId,
        position: candidateNumber,
        label: assignment.label,
        sources: rawCandidate.sources.map((source, sourceIndex) => ({
          ...source,
          id: `s${String(candidateNumber).padStart(2, '0')}${String.fromCharCode(97 + sourceIndex)}`,
        })),
      };
      logStage(`GEN DONE  ${candidateId} | ${Math.round((Date.now() - generationStartedAt) / 1000)}s | ${responseStats(generationResponse)}`);
      logStage(`CANDIDATE ${candidateId} | ${candidate.label} | answer="${candidate.answer.short}" | sources=${candidate.sources.length}`);
      logStage(`  Question: ${candidate.prompt}`);

      const evaluationStartedAt = Date.now();
      logStage(`EVAL START ${candidateId} | model=${evaluatorModel} | web search required, max calls=1`);
      const { evaluationResponse, rawEvaluation } = await withSingleRetry(`EVAL ${candidateId}`, async () => {
        const response = await openai.responses.create(withToolCallLimit({
          model: evaluatorModel,
          instructions: getEvaluatorInstructions(),
          input: buildEvaluatorInput(
            JSON.stringify([candidate]),
            'Evaluate this candidate independently and return one structured decision now.',
          ),
          ...promptCacheConfig(evaluatorModel, evaluatorPromptCacheKey),
          tools: [{ type: 'web_search' }],
          tool_choice: 'required',
          reasoning: { effort: 'medium' },
          text: {
            format: {
              type: 'json_schema',
              name: 'candidate_evaluation',
              strict: true,
              schema: createEvaluationSchema(1),
            },
          },
          max_output_tokens: 6000,
          store: false,
        }, 1));
        const parsedEvaluation = JSON.parse(response.output_text) as EvaluationResult;
        const generatedEvaluation = parsedEvaluation.evaluations[0];
        if (!generatedEvaluation) throw new Error(`Evaluator returned no decision for ${candidateId}.`);
        return { evaluationResponse: response, rawEvaluation: generatedEvaluation };
      });
      const evaluation: CandidateEvaluation = { ...rawEvaluation, candidateId };
      const ships = passesShippingBar(evaluation, candidate);
      const rewrite = evaluation.rewrite.applied ? ` | rewrite=${evaluation.rewrite.score.toFixed(1)}` : '';
      logStage(`EVAL DONE  ${candidateId} | ${Math.round((Date.now() - evaluationStartedAt) / 1000)}s | ${responseStats(evaluationResponse)}`);
      logStage(
        `VERDICT ${candidateId} | ${evaluation.decision} | overall=${evaluation.overall.toFixed(1)} | ` +
        `confidence=${evaluation.factualConfidence} | ships=${ships ? 'YES' : 'NO'}${rewrite}`,
      );
      logStage(`  Editor: ${evaluation.decisionRationale}`);
      if (evaluation.clueLeakageIssues.length > 0) logStage(`  Leakage flags: ${evaluation.clueLeakageIssues.length}`);
      completed += 1;
      logStage(`PROGRESS ${completed}/${candidateCount} candidates generated and evaluated`);
      return { candidate, evaluation };
    });

    const candidates = { questions: processed.map((item) => item.candidate).sort((a, b) => a.position - b.position) };
    const evaluationResult: EvaluationResult = {
      evaluations: processed.map((item) => item.evaluation).sort((a, b) => a.candidateId.localeCompare(b.candidateId)),
    };
    logStage(`All ${candidateCount} candidate pipelines completed in ${Math.round((Date.now() - startedAt) / 1000)}s.`);

    const ranked = evaluationResult.evaluations.filter((evaluation) => {
      const candidate = candidates.questions.find((question) => question.id === evaluation.candidateId);
      return candidate ? passesShippingBar(evaluation, candidate) : false;
    }).sort((a, b) => {
      const scoreA = a.rewrite.applied ? a.rewrite.score : a.overall;
      const scoreB = b.rewrite.applied ? b.rewrite.score : b.overall;
      return scoreB - scoreA;
    });
    const winningEvaluation = ranked[0];
    const original = winningEvaluation
      ? candidates.questions.find((candidate) => candidate.id === winningEvaluation.candidateId)
      : undefined;
    const finalist = original && winningEvaluation?.rewrite.applied
      ? applyEvaluationRewrite(original, winningEvaluation.rewrite)
      : original ?? null;

    const accepted = evaluationResult.evaluations.filter((evaluation) => evaluation.decision === 'ACCEPT').length;
    const rewritten = evaluationResult.evaluations.filter((evaluation) => evaluation.decision === 'REWRITE').length;
    const rejected = evaluationResult.evaluations.filter((evaluation) => evaluation.decision === 'REJECT').length;
    logStage(`3/3 Ranked results: ${accepted} accepted, ${rewritten} rewrite, ${rejected} rejected.`);
    if (ranked.length > 0) {
      logStage(`Shipping-bar ranking: ${ranked.map((evaluation, index) => {
        const score = evaluation.rewrite.applied ? evaluation.rewrite.score : evaluation.overall;
        return `${index + 1}. ${evaluation.candidateId} (${score.toFixed(1)})`;
      }).join(' | ')}`);
    }
    logStage(finalist ? `Finalist: ${finalist.id} — ${finalist.answer.short}` : 'No candidate cleared the shipping bar.');
    logStage(`Finished in ${Math.round((Date.now() - startedAt) / 1000)}s.`);

    const payload = {
      topic,
      candidateCount,
      models: { generator: generatorModel, evaluator: evaluatorModel },
      candidates: candidates.questions,
      evaluations: evaluationResult.evaluations,
      finalist,
    };
    if (heartbeat) clearInterval(heartbeat);
    if (streaming) {
      writeEvent({ type: 'result', data: payload });
      response.end();
    } else {
      response.json(payload);
    }
  } catch (error) {
    if (heartbeat) clearInterval(heartbeat);
    const details = apiErrorDetails(error);
    console.error(`[${runId}] Pipeline failed:`, details.status || '', details.message);
    const errorMessage = details.status === 401 ? 'The OpenAI API key was rejected.' : 'The generation/evaluation pipeline failed.';
    if (streaming) {
      writeEvent({ type: 'error', error: errorMessage });
      response.end();
    } else {
      response.status(details.status === 401 ? 401 : 502).json({ error: errorMessage });
    }
  }
});

export default app;

// Vercel imports the Express app as a function. The local process alone owns
// Vite middleware, static files, startup synchronization, and the TCP listener.
if (!process.env.VERCEL) {
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static('dist'));
    app.get('*path', (_request, response) => response.sendFile(`${process.cwd()}/dist/index.html`));
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  }

  if (isSupabaseConfigured()) {
    setImmediate(() => {
      void syncPromptVersions().catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[SUPABASE] Prompt synchronization failed at startup | ${message}`);
      });
    });
  } else {
    console.warn('[SUPABASE] Persistence disabled. Add SUPABASE_URL and SUPABASE_SECRET_KEY to .env.');
  }

  app.listen(port, '127.0.0.1', () => {
    console.log(`Oddly Specific running at http://127.0.0.1:${port}`);
  });
}
