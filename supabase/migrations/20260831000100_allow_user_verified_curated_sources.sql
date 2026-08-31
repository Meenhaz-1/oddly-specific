alter table public.reference_question_candidates
  add column verification_mode text not null default 'independent_sources'
  check (verification_mode in ('independent_sources', 'user_verified'));

update public.reference_question_candidates
set verification_mode = 'user_verified';

create or replace function public.publish_curated_question(p_candidate_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  candidate public.reference_question_candidates%rowtype;
  question jsonb;
  evaluation jsonb;
  source jsonb;
  question_id uuid := gen_random_uuid();
begin
  select * into candidate from public.reference_question_candidates where id = p_candidate_id for update;
  if not found then raise exception 'Reference candidate not found'; end if;
  if candidate.status = 'published' then return candidate.promoted_question_id; end if;
  if candidate.status <> 'evaluated' or coalesce((candidate.evaluator_metadata->>'ships')::boolean, false) is not true then
    raise exception 'Candidate has not cleared the evaluator shipping bar';
  end if;
  if candidate.compatibility not in ('current_open_ended', 'current_progressive_clues') then
    raise exception 'Candidate format is not currently playable';
  end if;
  question := candidate.adapted_question;
  evaluation := candidate.evaluator_metadata;
  if question is null then raise exception 'Candidate requires an adaptation'; end if;
  if candidate.verification_mode = 'independent_sources'
    and jsonb_array_length(coalesce(candidate.verification_record->'sources', '[]'::jsonb)) = 0 then
    raise exception 'Independently verified candidates require factual sources';
  end if;

  insert into public.questions (
    id, origin, reference_candidate_id, topic, blueprint, research_record, candidate_id, position,
    label, format, context, prompt, answer_short, answer_explanation, raw_question
  ) values (
    question_id, 'curated', candidate.id, candidate.topic,
    jsonb_build_object('playerAction', candidate.player_action, 'evidenceForm', candidate.evidence_form, 'relationship', candidate.relationship, 'answerContract', candidate.answer_contract),
    candidate.verification_record, question->>'id', (question->>'position')::integer, question->>'label', question->>'format',
    coalesce(question->>'context', ''), question->>'prompt', question->'answer'->>'short', question->'answer'->>'explanation', question
  );

  for source in select value from jsonb_array_elements(coalesce(candidate.verification_record->'sources', '[]'::jsonb)) loop
    insert into public.question_sources (question_id, source_key, title, publisher, url)
    values (question_id, source->>'id', source->>'title', source->>'publisher', source->>'url');
  end loop;

  insert into public.question_evaluations (
    question_id, decision, solvability, reveal_quality, clue_discipline, originality,
    answer_precision, wording_efficiency, overall, factual_confidence, decision_rationale,
    clue_leakage_issues, alternative_answers, rewrite_applied, rewrite_score, ships, raw_evaluation
  ) values (
    question_id, evaluation->>'decision', (evaluation->>'solvability')::integer,
    (evaluation->>'revealQuality')::integer, (evaluation->>'clueDiscipline')::integer,
    (evaluation->>'originality')::integer, (evaluation->>'answerPrecision')::integer,
    (evaluation->>'wordingEfficiency')::integer, (evaluation->>'overall')::numeric,
    evaluation->>'factualConfidence', evaluation->>'decisionRationale',
    array(select jsonb_array_elements_text(coalesce(evaluation->'clueLeakageIssues', '[]'::jsonb))),
    coalesce(evaluation->'alternativeAnswers', '[]'::jsonb), false, 0, true, evaluation
  );

  update public.reference_question_candidates
  set status = 'published', promoted_question_id = question_id
  where id = candidate.id;
  return question_id;
end;
$$;

create or replace function public.get_random_archive_questions(
  p_limit integer,
  p_exclude_ids uuid[] default '{}'::uuid[]
)
returns table (
  question_id uuid, label text, context text, prompt text, answer_short text,
  answer_explanation text, topic text, sources jsonb, reset_exclusions boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_limit integer := least(greatest(coalesce(p_limit, 10), 1), 10);
  excluded_ids uuid[] := coalesce(p_exclude_ids, '{}'::uuid[]);
  unseen_count integer;
  should_reset boolean := false;
begin
  select count(*)::integer into unseen_count
  from public.questions q
  left join public.quiz_runs qr on qr.id = q.quiz_run_id
  join public.question_evaluations qe on qe.question_id = q.id
  where (q.origin = 'curated' or qr.status = 'evaluation_complete')
    and q.format = 'open_ended' and qe.ships
    and (q.origin = 'curated' or exists (select 1 from public.question_sources qs where qs.question_id = q.id))
    and not (q.id = any(excluded_ids));

  if unseen_count = 0 and cardinality(excluded_ids) > 0 then
    excluded_ids := '{}'::uuid[];
    should_reset := true;
  end if;

  return query
  select q.id, q.label,
    case when qe.rewrite_applied then coalesce(qe.rewrite_context, q.context) else q.context end,
    case when qe.rewrite_applied then coalesce(qe.rewrite_prompt, q.prompt) else q.prompt end,
    case when qe.rewrite_applied then coalesce(qe.rewrite_answer_short, q.answer_short) else q.answer_short end,
    case when qe.rewrite_applied then coalesce(qe.rewrite_answer_explanation, q.answer_explanation) else q.answer_explanation end,
    coalesce(nullif(q.topic, ''), qr.topic),
    coalesce((select jsonb_agg(jsonb_build_object('id', qs.source_key, 'title', qs.title, 'publisher', qs.publisher, 'url', qs.url) order by qs.created_at, qs.id) from public.question_sources qs where qs.question_id = q.id), '[]'::jsonb),
    should_reset
  from public.questions q
  left join public.quiz_runs qr on qr.id = q.quiz_run_id
  join public.question_evaluations qe on qe.question_id = q.id
  where (q.origin = 'curated' or qr.status = 'evaluation_complete')
    and q.format = 'open_ended' and qe.ships
    and (q.origin = 'curated' or exists (select 1 from public.question_sources qs where qs.question_id = q.id))
    and not (q.id = any(excluded_ids))
  order by random()
  limit requested_limit;
end;
$$;

comment on column public.reference_question_candidates.verification_mode is
  'independent_sources requires factual source rows; user_verified accepts the corpus owner verification and permits blank player-facing sources.';
