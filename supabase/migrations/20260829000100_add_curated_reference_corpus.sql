create table public.reference_decks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  canonical_url text not null unique,
  uploader_author text,
  source_year integer check (source_year between 1900 and 2100),
  rights_mode text not null default 'adapt_and_verify' check (rights_mode = 'adapt_and_verify'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.reference_question_candidates (
  id uuid primary key default gen_random_uuid(),
  deck_id uuid not null references public.reference_decks(id) on delete cascade,
  slide_locator text not null,
  revision integer not null default 1 check (revision > 0),
  supersedes_candidate_id uuid references public.reference_question_candidates(id),
  premise_summary text not null,
  topic text not null,
  player_action text not null check (player_action in ('identify', 'connect', 'explain', 'complete', 'compare', 'order')),
  evidence_form text not null check (evidence_form in ('narrative', 'quotation', 'list', 'visual', 'statistic', 'artifact', 'timeline', 'paired_observations')),
  relationship text not null check (relationship in ('mechanism', 'cause', 'consequence', 'shared_link', 'transformation', 'contrast', 'chronology', 'cultural_transfer')),
  answer_contract text not null check (answer_contract in ('single_entity', 'paired_entities', 'entity_plus_reason', 'phrase', 'sequence', 'relationship')),
  compatibility text not null check (compatibility in ('current_open_ended', 'current_progressive_clues', 'future_visual', 'future_connect', 'future_paired_answer', 'future_audio_video', 'rejected')),
  status text not null check (status in ('screened', 'adapted', 'verified', 'evaluated', 'published', 'rejected', 'future_format')),
  rejection_reason text,
  adapted_question jsonb,
  verification_record jsonb,
  evaluator_metadata jsonb,
  promoted_question_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (deck_id, slide_locator, revision),
  check ((status = 'rejected') = (rejection_reason is not null)),
  check (status <> 'future_format' or compatibility like 'future_%')
);

alter table public.questions
  add column origin text not null default 'generated' check (origin in ('generated', 'curated')),
  add column reference_candidate_id uuid unique references public.reference_question_candidates(id),
  add column topic text,
  add column blueprint jsonb,
  add column research_record jsonb;

update public.questions q
set topic = qr.topic
from public.quiz_runs qr
where qr.id = q.quiz_run_id;

alter table public.questions alter column quiz_run_id drop not null;
alter table public.questions add constraint questions_origin_parent_check check (
  (origin = 'generated' and quiz_run_id is not null and reference_candidate_id is null)
  or
  (origin = 'curated' and quiz_run_id is null and reference_candidate_id is not null and nullif(btrim(topic), '') is not null)
);

alter table public.reference_question_candidates
  add constraint reference_candidates_promoted_question_fk
  foreign key (promoted_question_id) references public.questions(id);

create index reference_candidates_deck_status_idx on public.reference_question_candidates (deck_id, status);
create index reference_candidates_topic_idx on public.reference_question_candidates (lower(topic));
create index questions_origin_topic_idx on public.questions (origin, lower(topic));

create trigger reference_decks_touch_updated_at
before update on public.reference_decks
for each row execute function public.touch_updated_at();

create trigger reference_candidates_touch_updated_at
before update on public.reference_question_candidates
for each row execute function public.touch_updated_at();

create or replace function public.assign_generated_question_topic()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.origin = 'generated' and nullif(btrim(new.topic), '') is null then
    select topic into new.topic from public.quiz_runs where id = new.quiz_run_id;
  end if;
  return new;
end;
$$;

create trigger questions_assign_generated_topic
before insert or update of quiz_run_id, origin, topic on public.questions
for each row execute function public.assign_generated_question_topic();

create or replace function public.capture_question_research()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.raw_question ? 'research' then
    new.research_record = new.raw_question->'research';
    new.blueprint = new.raw_question->'research'->'blueprint';
    new.raw_question = new.raw_question - 'research';
  end if;
  return new;
end;
$$;

create trigger questions_capture_research
before insert or update of raw_question on public.questions
for each row execute function public.capture_question_research();

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
  if question is null or jsonb_array_length(coalesce(candidate.verification_record->'sources', '[]'::jsonb)) = 0 then
    raise exception 'Candidate requires an adaptation and independent sources';
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

  for source in select value from jsonb_array_elements(candidate.verification_record->'sources') loop
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
    and exists (select 1 from public.question_sources qs where qs.question_id = q.id)
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
    and exists (select 1 from public.question_sources qs where qs.question_id = q.id)
    and not (q.id = any(excluded_ids))
  order by random()
  limit requested_limit;
end;
$$;

alter table public.reference_decks enable row level security;
alter table public.reference_question_candidates enable row level security;
revoke all on table public.reference_decks from anon, authenticated;
revoke all on table public.reference_question_candidates from anon, authenticated;
grant select, insert, update, delete on table public.reference_decks to service_role;
grant select, insert, update, delete on table public.reference_question_candidates to service_role;
revoke all on function public.assign_generated_question_topic() from public, anon, authenticated;
revoke all on function public.capture_question_research() from public, anon, authenticated;
revoke all on function public.publish_curated_question(uuid) from public, anon, authenticated;
grant execute on function public.publish_curated_question(uuid) to service_role;

comment on table public.reference_decks is 'Third-party quiz decks used only as adaptation provenance, never factual evidence.';
comment on table public.reference_question_candidates is 'Paraphrased, staged reference premises and independently verified original adaptations.';
