import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { buildEvaluatorInput, getEvaluatorInstructions, getPromptCacheKey } from '../server/prompts.js';
import { applyEvaluationRewrite, validateGeneratedQuestion } from '../server/question-validation.js';
import type { GeneratedQuestion } from '../src/types.js';

const apply = process.argv.includes('--apply');
const requestedLimit = Number(process.argv.find((value) => value.startsWith('--limit='))?.split('=')[1] ?? 10);
const limit = Number.isInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 50) : 10;
const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) are required.');

const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: candidates, error: candidatesError } = await supabase.from('reference_question_candidates')
  .select('id,deck_id,slide_locator,premise_summary,topic,player_action,evidence_form,relationship,answer_contract,adapted_question,verification_mode,verification_record')
  .eq('status', 'verified').in('compatibility', ['current_open_ended', 'current_progressive_clues']).limit(limit);
if (candidatesError) throw candidatesError;

if (!apply) {
  console.log(JSON.stringify({ mode: 'preview', writes: 0, evaluable: candidates.length, candidates: candidates.map(({ id, slide_locator, topic }) => ({ id, slideLocator: slide_locator, topic })) }, null, 2));
} else {
if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is required with --apply.');

const evaluationSchema = {
  type: 'object', additionalProperties: false, required: ['evaluations'],
  properties: { evaluations: { type: 'array', minItems: 1, maxItems: 1, items: {
    type: 'object', additionalProperties: false,
    required: ['candidateId', 'decision', 'scores', 'overall', 'clueLeakageIssues', 'alternativeAnswers', 'factualConfidence', 'verification', 'decisionRationale', 'rewrite'],
    properties: {
      candidateId: { type: 'string' }, decision: { type: 'string', enum: ['ACCEPT', 'REWRITE', 'REJECT'] },
      scores: { type: 'object', additionalProperties: false, required: ['solvability', 'revealQuality', 'clueDiscipline', 'originality', 'answerPrecision', 'wordingEfficiency'], properties: {
        solvability: { type: 'integer', minimum: 1, maximum: 5 }, revealQuality: { type: 'integer', minimum: 1, maximum: 5 },
        clueDiscipline: { type: 'integer', minimum: 1, maximum: 5 }, originality: { type: 'integer', minimum: 1, maximum: 5 },
        answerPrecision: { type: 'integer', minimum: 1, maximum: 5 }, wordingEfficiency: { type: 'integer', minimum: 1, maximum: 5 },
      } },
      overall: { type: 'number', minimum: 1, maximum: 5 }, clueLeakageIssues: { type: 'array', items: { type: 'string' } },
      alternativeAnswers: { type: 'array', minItems: 3, maxItems: 3, items: { type: 'object', additionalProperties: false, required: ['answer', 'assessment'], properties: { answer: { type: 'string' }, assessment: { type: 'string' } } } },
      factualConfidence: { type: 'string', enum: ['High', 'Medium', 'Low'] },
      verification: { type: 'object', additionalProperties: false, required: ['mode', 'evidenceStatus', 'independentSearchRequired', 'searchReason'], properties: {
        mode: { type: 'string', enum: ['generator_research', 'independent_web_search', 'user_verified'] }, evidenceStatus: { type: 'string', enum: ['complete', 'incomplete', 'conflicting'] },
        independentSearchRequired: { type: 'boolean' }, searchReason: { type: 'string' },
      } },
      decisionRationale: { type: 'string' },
      rewrite: { type: 'object', additionalProperties: false, required: ['applied', 'context', 'prompt', 'clues', 'answerShort', 'answerExplanation', 'score'], properties: {
        applied: { type: 'boolean' }, context: { type: 'string' }, prompt: { type: 'string' }, clues: { type: 'array', minItems: 0, maxItems: 3, items: { type: 'string' } },
        answerShort: { type: 'string' }, answerExplanation: { type: 'string' }, score: { type: 'number', minimum: 0, maximum: 5 },
      } },
    },
  } } },
} as const;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const model = process.env.OPENAI_EVALUATOR_MODEL || process.env.OPENAI_MODEL || 'gpt-5.4-mini';
let evaluated = 0;
let shipping = 0;

for (const candidate of candidates) {
  const question = candidate.adapted_question as GeneratedQuestion;
  const blueprint = { playerAction: candidate.player_action, evidenceForm: candidate.evidence_form, relationship: candidate.relationship, answerContract: candidate.answer_contract };
  const response = await openai.responses.create({
    model,
    instructions: getEvaluatorInstructions(),
    input: buildEvaluatorInput(
      JSON.stringify({ questions: [question], referencePremise: candidate.premise_summary, blueprint, verificationMode: candidate.verification_mode, verificationRecord: candidate.verification_record }),
      candidate.verification_mode === 'user_verified'
        ? 'Evaluate this curated adaptation editorially. Its factual premise has been verified externally by the corpus owner; sources are intentionally blank. Do not reject or search solely because source records are absent.'
        : 'Evaluate this curated adaptation. Independently verify all material claims with web search. The reference deck is provenance only and is not factual evidence.',
    ),
    prompt_cache_key: getPromptCacheKey('evaluator'),
    ...(candidate.verification_mode === 'user_verified' ? {} : { tools: [{ type: 'web_search' as const }], tool_choice: 'required' as const }),
    text: { format: { type: 'json_schema', name: 'curated_candidate_evaluation', strict: true, schema: evaluationSchema } },
    max_output_tokens: 7000, store: false,
  });
  const evaluation = (JSON.parse(response.output_text) as { evaluations: Array<Record<string, unknown>> }).evaluations[0];
  if (!evaluation) throw new Error(`No evaluation returned for ${candidate.id}.`);
  const scores = evaluation.scores as Record<string, number>;
  const rewrite = evaluation.rewrite as { applied: boolean; context: string; prompt: string; clues: string[]; answerShort: string; answerExplanation: string; score: number };
  const finalQuestion = applyEvaluationRewrite(question, rewrite);
  const ships = evaluation.decision !== 'REJECT' && Number(evaluation.overall) >= 4 && scores.solvability >= 4 && scores.revealQuality >= 4 && scores.clueDiscipline >= 4 && scores.answerPrecision >= 4 && evaluation.factualConfidence !== 'Low' && (!rewrite.applied || rewrite.score >= 4) && validateGeneratedQuestion(finalQuestion).length === 0;
  const metadata = {
    ...evaluation, ships,
    solvability: scores.solvability, revealQuality: scores.revealQuality, clueDiscipline: scores.clueDiscipline,
    originality: scores.originality, answerPrecision: scores.answerPrecision, wordingEfficiency: scores.wordingEfficiency,
    responseId: response.id, inputTokens: response.usage?.input_tokens ?? null, outputTokens: response.usage?.output_tokens ?? null,
    webSearchCalls: response.output.filter((item) => item.type === 'web_search_call').length,
  };
  const { error: updateError } = await supabase.from('reference_question_candidates').update({ status: 'evaluated', evaluator_metadata: metadata }).eq('id', candidate.id).eq('status', 'verified');
  if (updateError) throw updateError;
  evaluated += 1;
  if (ships) shipping += 1;
  console.log(`${candidate.slide_locator}: ${String(evaluation.decision)} (ships=${ships})`);
}

console.log(JSON.stringify({ evaluated, shipping }, null, 2));
}
