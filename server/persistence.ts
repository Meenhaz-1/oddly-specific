import { createHash } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  GeneratedQuestion,
  GeneratedQuiz,
  OpenEndedQuestion,
  RandomQuizResponse,
  SharedQuizResponse,
} from '../src/types';
import { PROGRESSIVE_CLUES_CONTEXT } from '../src/constants.js';
import { getCanonicalPromptDefinitions } from './prompts.js';
import type { QuestionResearch } from './question-schemas.js';

export interface ResponseAudit {
  responseId: string | null;
  inputTokens: number | null;
  initialInputTokens: number | null;
  toolLoopInputTokens: number | null;
  cachedInputTokens: number | null;
  uncachedInputTokens: number | null;
  cacheWriteInputTokens: number | null;
  cacheHitRate: number | null;
  outputTokens: number | null;
  reasoningOutputTokens: number | null;
  visibleOutputTokens: number | null;
  totalTokens: number | null;
  webSearchCalls: number;
  durationMs: number;
  promptCacheKey: string;
}

export interface GeneratedQuizPersistenceInput {
  runId: string;
  externalRunId: string;
  topic: string;
  generatorModel: string;
  evaluatorModel: string;
  quiz: GeneratedQuiz;
  generation: ResponseAudit;
  generatorResearch: QuestionResearch[];
}

export interface PersistedEvaluation {
  candidateId: string;
  decision: 'ACCEPT' | 'REWRITE' | 'REJECT';
  scores: Record<string, number>;
  overall: number;
  clueLeakageIssues: string[];
  alternativeAnswers: Array<{ answer: string; assessment: string }>;
  factualConfidence: 'High' | 'Medium' | 'Low';
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
  ships: boolean;
}

interface PromptVersionIds {
  generator: string;
  evaluator: string;
}

let adminClient: SupabaseClient | undefined;
let promptSyncPromise: Promise<PromptVersionIds> | undefined;

export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);
}

function getAdminClient(): SupabaseClient {
  if (!isSupabaseConfigured()) throw new Error('Supabase is not configured.');
  adminClient ??= createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return adminClient;
}

function promptHash(template: string): string {
  return createHash('sha256').update(template, 'utf8').digest('hex');
}

async function syncPromptVersionsOnce(): Promise<PromptVersionIds> {
  const client = getAdminClient();
  const ids: Partial<PromptVersionIds> = {};
  console.log('[SUPABASE] Synchronizing immutable prompt versions...');

  for (const definition of getCanonicalPromptDefinitions()) {
    const versionHash = promptHash(definition.template);
    const existing = await client
      .from('prompt_versions')
      .select('id')
      .eq('prompt_key', definition.key)
      .eq('version_hash', versionHash)
      .maybeSingle();
    if (existing.error) throw existing.error;

    let id = existing.data?.id as string | undefined;
    if (!id) {
      const inserted = await client
        .from('prompt_versions')
        .insert({
          prompt_key: definition.key,
          version_hash: versionHash,
          template: definition.template,
          source_paths: definition.sourcePaths,
        })
        .select('id')
        .single();
      if (inserted.error?.code === '23505') {
        const raced = await client
          .from('prompt_versions')
          .select('id')
          .eq('prompt_key', definition.key)
          .eq('version_hash', versionHash)
          .single();
        if (raced.error) throw raced.error;
        id = raced.data.id as string;
      } else if (inserted.error) {
        throw inserted.error;
      } else {
        id = inserted.data.id as string;
      }
      console.log(`[SUPABASE] Added ${definition.key} prompt version ${versionHash.slice(0, 12)}.`);
    }
    ids[definition.key] = id;
  }

  if (!ids.generator || !ids.evaluator) throw new Error('Prompt version synchronization returned incomplete IDs.');
  console.log('[SUPABASE] Prompt versions ready.');
  return ids as PromptVersionIds;
}

export function syncPromptVersions(): Promise<PromptVersionIds> {
  promptSyncPromise ??= syncPromptVersionsOnce().catch((error: unknown) => {
    promptSyncPromise = undefined;
    throw error;
  });
  return promptSyncPromise;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(label: string, operation: () => Promise<T>): Promise<T> {
  const waits = [0, 300, 1200];
  let lastError: unknown;
  for (const [index, waitMs] of waits.entries()) {
    if (waitMs) await delay(waitMs);
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      console.warn(`[SUPABASE] ${label} attempt ${index + 1}/${waits.length} failed.`);
    }
  }
  throw lastError;
}

export async function persistGeneratedQuiz(input: GeneratedQuizPersistenceInput): Promise<boolean> {
  if (!isSupabaseConfigured()) {
    console.warn(`[${input.externalRunId}-DB] Supabase is not configured; generated questions were not saved.`);
    return false;
  }
  console.log(`[${input.externalRunId}-DB] DB SAVE START | questions=${input.quiz.questions.length}`);
  try {
    const promptVersions = await withRetry('prompt synchronization', syncPromptVersions);
    await withRetry('generated quiz save', async () => {
      const result = await getAdminClient().rpc('save_generated_quiz', {
        p_run: {
          id: input.runId,
          externalRunId: input.externalRunId,
          topic: input.topic,
          questionCount: input.quiz.questions.length,
          generatorModel: input.generatorModel,
          evaluatorModel: input.evaluatorModel,
          generatorPromptVersionId: promptVersions.generator,
          evaluatorPromptVersionId: promptVersions.evaluator,
          generationResponseId: input.generation.responseId,
          generationInputTokens: input.generation.inputTokens,
          generationOutputTokens: input.generation.outputTokens,
          generationTotalTokens: input.generation.totalTokens,
          generationWebSearchCalls: input.generation.webSearchCalls,
          generationDurationMs: input.generation.durationMs,
        },
        p_questions: input.quiz.questions.map((question) => {
          const research = input.generatorResearch.find((record) => record.candidateId === question.id);
          const persistedQuestion = question.format === 'progressive_clues'
            ? { ...question, context: PROGRESSIVE_CLUES_CONTEXT }
            : question;
          return { ...persistedQuestion, research };
        }),
      });
      if (result.error) throw result.error;
      const cacheMetrics = await getAdminClient()
        .from('quiz_runs')
        .update({
          generation_initial_input_tokens: input.generation.initialInputTokens,
          generation_tool_loop_input_tokens: input.generation.toolLoopInputTokens,
          generation_cached_input_tokens: input.generation.cachedInputTokens,
          generation_uncached_input_tokens: input.generation.uncachedInputTokens,
          generation_cache_write_input_tokens: input.generation.cacheWriteInputTokens,
          generation_cache_hit_rate: input.generation.cacheHitRate,
          generation_prompt_cache_key: input.generation.promptCacheKey,
          generation_reasoning_output_tokens: input.generation.reasoningOutputTokens,
          generation_visible_output_tokens: input.generation.visibleOutputTokens,
        })
        .eq('id', input.runId);
      if (cacheMetrics.error) throw cacheMetrics.error;
    });
    console.log(`[${input.externalRunId}-DB] DB SAVE DONE | run=${input.runId}`);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[${input.externalRunId}-DB] DB SAVE FAILED | ${message}`);
    return false;
  }
}

export async function persistEvaluations(
  runId: string,
  externalRunId: string,
  evaluations: PersistedEvaluation[],
  audit: ResponseAudit,
): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  console.log(`[${externalRunId}-DB] EVALUATION SAVE START | decisions=${evaluations.length}`);
  try {
    await withRetry('evaluation save', async () => {
      const result = await getAdminClient().rpc('save_quiz_evaluations', {
        p_run_id: runId,
        p_metadata: audit,
        p_evaluations: evaluations,
      });
      if (result.error) throw result.error;
      const cacheMetrics = await getAdminClient()
        .from('quiz_runs')
        .update({
          evaluation_initial_input_tokens: audit.initialInputTokens,
          evaluation_tool_loop_input_tokens: audit.toolLoopInputTokens,
          evaluation_cached_input_tokens: audit.cachedInputTokens,
          evaluation_uncached_input_tokens: audit.uncachedInputTokens,
          evaluation_cache_write_input_tokens: audit.cacheWriteInputTokens,
          evaluation_cache_hit_rate: audit.cacheHitRate,
          evaluation_prompt_cache_key: audit.promptCacheKey,
          evaluation_reasoning_output_tokens: audit.reasoningOutputTokens,
          evaluation_visible_output_tokens: audit.visibleOutputTokens,
        })
        .eq('id', runId);
      if (cacheMetrics.error) throw cacheMetrics.error;
    });
    console.log(`[${externalRunId}-DB] EVALUATION SAVE DONE`);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[${externalRunId}-DB] EVALUATION SAVE FAILED | ${message}`);
    return false;
  }
}

export async function markEvaluationFailed(runId: string, externalRunId: string, message: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const result = await getAdminClient()
    .from('quiz_runs')
    .update({ status: 'evaluation_failed', evaluation_error: message, evaluated_at: new Date().toISOString() })
    .eq('id', runId);
  if (result.error) console.error(`[${externalRunId}-DB] Could not persist evaluation failure | ${result.error.message}`);
}

export async function saveQuestionFeedback(questionId: string, sessionId: string, rating: 'good' | 'weak'): Promise<void> {
  if (!isSupabaseConfigured()) throw new Error('Supabase is not configured.');
  await withRetry('question feedback save', async () => {
    const result = await getAdminClient()
      .from('question_feedback')
      .upsert(
        { question_id: questionId, anonymous_session_id: sessionId, rating, updated_at: new Date().toISOString() },
        { onConflict: 'question_id,anonymous_session_id' },
      );
    if (result.error) throw result.error;
  });
}

interface SharedQuizRunRow {
  id: string;
  topic: string;
  question_count: number;
}

interface SharedQuizQuestionRow {
  id: string;
  candidate_id: string;
  position: number;
  label: string;
  format: 'open_ended' | 'progressive_clues';
  context: string;
  prompt: string;
  answer_short: string;
  answer_explanation: string;
  raw_question: Record<string, unknown> | null;
}

interface SharedQuizSourceRow {
  question_id: string;
  source_key: string;
  title: string;
  publisher: string;
  url: string;
}

interface QuizCompositionRow {
  question_id: string;
  position: number;
}

export async function persistQuizComposition(runId: string, questions: GeneratedQuestion[]): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const result = await getAdminClient().from('quiz_run_question_sets').upsert(
    questions.map((question, index) => ({
      quiz_run_id: runId,
      question_id: question.questionId,
      position: index + 1,
    })),
    { onConflict: 'quiz_run_id,question_id' },
  );
  if (result.error) throw result.error;
}

export async function fetchSharedQuiz(runId: string): Promise<SharedQuizResponse | null> {
  if (!isSupabaseConfigured()) throw new Error('Supabase is not configured.');
  const client = getAdminClient();
  const runResult = await client
    .from('quiz_runs')
    .select('id, topic, question_count')
    .eq('id', runId)
    .maybeSingle();
  if (runResult.error) throw runResult.error;
  if (!runResult.data) return null;

  const run = runResult.data as SharedQuizRunRow;
  const compositionResult = await client
    .from('quiz_run_question_sets')
    .select('question_id, position')
    .eq('quiz_run_id', runId)
    .order('position');
  if (compositionResult.error) throw compositionResult.error;
  const composition = (compositionResult.data || []) as QuizCompositionRow[];
  const questionQuery = client
    .from('questions')
    .select('id, candidate_id, position, label, format, context, prompt, answer_short, answer_explanation, raw_question');
  const questionResult = composition.length
    ? await questionQuery.in('id', composition.map((item) => item.question_id))
    : await questionQuery.eq('quiz_run_id', runId).order('position');
  if (questionResult.error) throw questionResult.error;
  const unorderedRows = (questionResult.data || []) as SharedQuizQuestionRow[];
  const questionRows = composition.length
    ? composition.flatMap((item) => {
        const row = unorderedRows.find((candidate) => candidate.id === item.question_id);
        return row ? [{ ...row, position: item.position }] : [];
      })
    : unorderedRows;
  const expectedCount = composition.length || run.question_count;
  if (questionRows.length !== expectedCount) return null;

  const questionIds = questionRows.map((question) => question.id);
  const sourceResult = await client
    .from('question_sources')
    .select('question_id, source_key, title, publisher, url')
    .in('question_id', questionIds)
    .order('created_at');
  if (sourceResult.error) throw sourceResult.error;
  const sourceRows = (sourceResult.data || []) as SharedQuizSourceRow[];

  const questions = questionRows.map((row) => {
    const stored = row.raw_question || {};
    const sources = sourceRows
      .filter((source) => source.question_id === row.id)
      .map((source) => ({
        id: source.source_key,
        title: source.title,
        publisher: source.publisher,
        url: source.url,
      }));
    const base = {
      ...stored,
      questionId: row.id,
      id: row.candidate_id,
      position: row.position,
      label: row.label,
      format: row.format,
      prompt: row.prompt,
      answer: { short: row.answer_short, explanation: row.answer_explanation },
      sources,
    };
    return row.format === 'progressive_clues'
      ? base
      : { ...base, context: row.context };
  }) as GeneratedQuestion[];

  return {
    runId: run.id,
    topic: run.topic,
    title: `${questions.length} Questions on ${run.topic}`,
    teaser: `The original ${questions.length}-question set, saved exactly as it was generated.`,
    questions,
  };
}

interface RandomArchiveRow {
  question_id: string;
  label: string;
  context: string;
  prompt: string;
  answer_short: string;
  answer_explanation: string;
  topic: string;
  sources: Array<{ id: string; title: string; publisher: string; url: string }>;
  reset_exclusions: boolean;
}

export async function getQuizPlayCount(): Promise<number> {
  if (!isSupabaseConfigured()) throw new Error('Supabase is not configured.');
  const result = await getAdminClient()
    .from('quiz_play_events')
    .select('id', { count: 'exact', head: true });
  if (result.error) throw result.error;
  return result.count ?? 0;
}

export async function recordQuizPlay(input: {
  id: string;
  topic: string;
  mode: 'generated' | 'random' | 'shared';
  runId: string | null;
}): Promise<number> {
  if (!isSupabaseConfigured()) throw new Error('Supabase is not configured.');
  const insertResult = await getAdminClient()
    .from('quiz_play_events')
    .upsert({
      id: input.id,
      topic: input.topic,
      mode: input.mode,
      run_id: input.runId,
    }, { onConflict: 'id', ignoreDuplicates: true });
  if (insertResult.error) throw insertResult.error;
  return getQuizPlayCount();
}

export async function importCuratedSheet(input: {
  url: string;
  title: string;
  questions: unknown[];
}): Promise<number> {
  if (!isSupabaseConfigured()) throw new Error('Supabase is not configured.');
  const result = await getAdminClient().rpc('import_curated_sheet', {
    p_sheet_url: input.url,
    p_sheet_title: input.title,
    p_questions: input.questions,
  });
  if (result.error) throw result.error;
  return Number(result.data);
}

export async function fetchTopicArchiveQuestions(topic: string, count: number): Promise<OpenEndedQuestion[]> {
  if (!isSupabaseConfigured()) throw new Error('Supabase is not configured.');
  const result = await getAdminClient()
    .from('questions')
    .select(`
      id, label, context, prompt, answer_short, answer_explanation, topic, origin,
      question_sources(source_key, title, publisher, url),
      question_evaluations!inner(ships, rewrite_applied, rewrite_context, rewrite_prompt, rewrite_answer_short, rewrite_answer_explanation),
      quiz_runs!questions_quiz_run_id_fkey(status)
    `)
    .eq('format', 'open_ended')
    .ilike('topic', topic)
    .limit(100);
  if (result.error) throw result.error;
  const rows = (result.data || []) as unknown as Array<{
    id: string;
    label: string;
    context: string;
    prompt: string;
    answer_short: string;
    answer_explanation: string;
    topic: string;
    origin: 'generated' | 'curated';
    question_sources: Array<{ source_key: string; title: string; publisher: string; url: string }>;
    question_evaluations: {
      ships: boolean;
      rewrite_applied: boolean;
      rewrite_context: string | null;
      rewrite_prompt: string | null;
      rewrite_answer_short: string | null;
      rewrite_answer_explanation: string | null;
    };
    quiz_runs: { status: string } | null;
  }>;
  return rows
    .filter((row) => {
      return row.question_sources.length > 0
        && (row.origin === 'curated' || row.quiz_runs?.status === 'evaluation_complete');
    })
    .sort((left, right) => {
      if (left.question_evaluations.ships !== right.question_evaluations.ships) {
        return left.question_evaluations.ships ? -1 : 1;
      }
      return Math.random() - 0.5;
    })
    .slice(0, count)
    .map((row, index) => {
      const evaluation = row.question_evaluations;
      return {
    questionId: row.id,
    topic: row.topic,
    id: row.id,
    position: index + 1,
    label: row.label,
    format: 'open_ended',
    context: evaluation.rewrite_applied ? evaluation.rewrite_context || row.context : row.context,
    prompt: evaluation.rewrite_applied ? evaluation.rewrite_prompt || row.prompt : row.prompt,
    answer: {
      short: evaluation.rewrite_applied ? evaluation.rewrite_answer_short || row.answer_short : row.answer_short,
      explanation: evaluation.rewrite_applied
        ? evaluation.rewrite_answer_explanation || row.answer_explanation
        : row.answer_explanation,
    },
    sources: row.question_sources.map((source) => ({
      id: source.source_key,
      title: source.title,
      publisher: source.publisher,
      url: source.url,
    })),
  };
    });
}

export async function fetchRandomArchiveQuiz(
  count: number,
  excludeQuestionIds: string[],
): Promise<RandomQuizResponse | null> {
  if (!isSupabaseConfigured()) throw new Error('Supabase is not configured.');
  const result = await getAdminClient().rpc('get_random_archive_questions', {
    p_limit: count,
    p_exclude_ids: excludeQuestionIds,
  });
  if (result.error) throw result.error;
  const rows = (result.data || []) as RandomArchiveRow[];
  if (rows.length === 0) return null;

  const questions: OpenEndedQuestion[] = rows.map((row, index) => ({
    questionId: row.question_id,
    topic: row.topic,
    id: row.question_id,
    position: index + 1,
    label: row.label,
    format: 'open_ended',
    context: row.context,
    prompt: row.prompt,
    answer: {
      short: row.answer_short,
      explanation: row.answer_explanation,
    },
    sources: row.sources,
  }));

  return {
    title: `${questions.length} Questions from the Archive`,
    teaser: `${questions.length} good ${questions.length === 1 ? 'question' : 'questions'}, mixed across subjects and pulled from the archive.`,
    questions,
    resetExclusions: rows[0]?.reset_exclusions === true,
  };
}

export function questionsHaveDatabaseIds(questions: OpenEndedQuestion[]): boolean {
  return questions.every((question) => typeof question.questionId === 'string');
}
