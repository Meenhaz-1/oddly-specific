import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { REFERENCE_CORPUS, type ReferenceCandidate } from '../curation/reference-corpus.js';
import { validateGeneratedQuestion } from '../server/question-validation.js';
import { isTopicCategory } from '../src/topic-categories.js';
import type { GeneratedQuestion } from '../src/types.js';

const apply = process.argv.includes('--apply');
const publish = process.argv.includes('--publish');

function validateCandidate(candidate: ReferenceCandidate): string[] {
  const issues: string[] = [];
  if (!isTopicCategory(candidate.topic)) issues.push(`unknown homepage category: ${candidate.topic}`);
  if (candidate.status === 'future_format' && !candidate.compatibility.startsWith('future_')) issues.push('future_format status requires a future_* compatibility');
  if (candidate.status === 'rejected' && !candidate.rejectionReason) issues.push('rejected candidate requires a reason');
  if (candidate.adaptedQuestion) {
    issues.push(...validateGeneratedQuestion(candidate.adaptedQuestion as unknown as GeneratedQuestion).map(({ code, field }) => `${code}:${field}`));
  }
  if (['verified', 'evaluated', 'published'].includes(candidate.status) && candidate.verificationMode === 'independent_sources' && !candidate.verificationRecord?.sources.length) {
    issues.push('verified candidate requires independent factual sources');
  }
  return issues;
}

const candidates = REFERENCE_CORPUS.flatMap((deck) => deck.candidates.map((candidate) => ({ deck, candidate })));
const invalid = candidates.flatMap(({ deck, candidate }) => validateCandidate(candidate).map((issue) => `${deck.title} ${candidate.slideLocator}: ${issue}`));
if (invalid.length > 0) throw new Error(`Corpus validation failed:\n${invalid.join('\n')}`);

const counts = {
  decks: REFERENCE_CORPUS.length,
  candidates: candidates.length,
  compatible: candidates.filter(({ candidate }) => candidate.compatibility.startsWith('current_')).length,
  futureFormat: candidates.filter(({ candidate }) => candidate.compatibility.startsWith('future_')).length,
  rejected: candidates.filter(({ candidate }) => candidate.status === 'rejected').length,
  verified: candidates.filter(({ candidate }) => ['verified', 'evaluated', 'published'].includes(candidate.status)).length,
  publishable: candidates.filter(({ candidate }) => candidate.status === 'evaluated' && candidate.evaluatorMetadata?.ships === true).length,
  categories: Object.fromEntries([...new Set(candidates.map(({ candidate }) => candidate.topic))].sort().map((topic) => [topic, candidates.filter(({ candidate }) => candidate.topic === topic).length])),
};

if (!apply) {
  console.log(JSON.stringify({ mode: 'dry-run', writes: 0, ...counts }, null, 2));
  process.exit(0);
}

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) throw new Error('SUPABASE_URL and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) are required with --apply.');
const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });

let staged = 0;
let skippedPublished = 0;
let skippedEvaluated = 0;
let promoted = 0;

for (const deck of REFERENCE_CORPUS) {
  const { data: deckRow, error: deckError } = await supabase.from('reference_decks').upsert({
    title: deck.title,
    canonical_url: deck.canonicalUrl,
    uploader_author: deck.uploaderAuthor,
    source_year: deck.year,
    rights_mode: deck.rightsMode,
  }, { onConflict: 'canonical_url' }).select('id').single();
  if (deckError) throw deckError;

  for (const candidate of deck.candidates) {
    const { data: existing, error: lookupError } = await supabase.from('reference_question_candidates')
      .select('id,status,promoted_question_id,evaluator_metadata')
      .eq('deck_id', deckRow.id).eq('slide_locator', candidate.slideLocator).eq('revision', candidate.revision).maybeSingle();
    if (lookupError) throw lookupError;
    if (existing?.status === 'published') {
      skippedPublished += 1;
      continue;
    }
    if (existing?.status === 'evaluated') {
      const storedEvaluation = existing.evaluator_metadata as { ships?: boolean } | null;
      if (publish && storedEvaluation?.ships === true) {
        const { error: promoteError } = await supabase.rpc('publish_curated_question', { p_candidate_id: existing.id });
        if (promoteError) throw promoteError;
        promoted += 1;
      } else {
        skippedEvaluated += 1;
      }
      continue;
    }

    const candidatePayload = {
      deck_id: deckRow.id,
      slide_locator: candidate.slideLocator,
      revision: candidate.revision,
      premise_summary: candidate.premiseSummary,
      topic: candidate.topic,
      player_action: candidate.blueprint.playerAction,
      evidence_form: candidate.blueprint.evidenceForm,
      relationship: candidate.blueprint.relationship,
      answer_contract: candidate.blueprint.answerContract,
      compatibility: candidate.compatibility,
      status: candidate.status,
      verification_mode: candidate.verificationMode,
      rejection_reason: candidate.rejectionReason ?? null,
      adapted_question: candidate.adaptedQuestion ?? null,
      verification_record: candidate.verificationRecord ?? null,
      evaluator_metadata: candidate.evaluatorMetadata ?? null,
    };
    const result = existing
      ? await supabase.from('reference_question_candidates').update(candidatePayload).eq('id', existing.id).select('id').single()
      : await supabase.from('reference_question_candidates').insert(candidatePayload).select('id').single();
    if (result.error) throw result.error;
    staged += 1;

    if (!publish || candidate.status !== 'evaluated' || candidate.evaluatorMetadata?.ships !== true || !candidate.adaptedQuestion || !candidate.verificationRecord) continue;
    const { error: promoteError } = await supabase.rpc('publish_curated_question', { p_candidate_id: result.data.id });
    if (promoteError) throw promoteError;
    promoted += 1;
  }
}

console.log(JSON.stringify({ mode: publish ? 'apply-and-publish' : 'apply', ...counts, staged, skippedEvaluated, skippedPublished, promoted }, null, 2));
