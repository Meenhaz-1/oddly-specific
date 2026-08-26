import { createHash } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { GeneratedQuiz, OpenEndedQuestion } from '../src/types';
import { getCanonicalPromptDefinitions } from './prompts';

export interface ResponseAudit {
  responseId: string | null;
  inputTokens: number | null;
  cachedInputTokens: number | null;
  cacheHitRate: number | null;
  outputTokens: number | null;
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
        p_questions: input.quiz.questions,
      });
      if (result.error) throw result.error;
      const cacheMetrics = await getAdminClient()
        .from('quiz_runs')
        .update({
          generation_cached_input_tokens: input.generation.cachedInputTokens,
          generation_cache_hit_rate: input.generation.cacheHitRate,
          generation_prompt_cache_key: input.generation.promptCacheKey,
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
          evaluation_cached_input_tokens: audit.cachedInputTokens,
          evaluation_cache_hit_rate: audit.cacheHitRate,
          evaluation_prompt_cache_key: audit.promptCacheKey,
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

export function questionsHaveDatabaseIds(questions: OpenEndedQuestion[]): boolean {
  return questions.every((question) => typeof question.questionId === 'string');
}
