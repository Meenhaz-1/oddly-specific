create table public.quiz_play_events (
  id uuid primary key,
  topic text not null,
  mode text not null check (mode in ('generated', 'random', 'shared')),
  run_id uuid,
  played_at timestamptz not null default now()
);

create index quiz_play_events_played_at_idx on public.quiz_play_events (played_at desc);

create table public.quiz_run_question_sets (
  quiz_run_id uuid not null references public.quiz_runs(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  position integer not null check (position between 1 and 10),
  primary key (quiz_run_id, question_id),
  unique (quiz_run_id, position)
);

create or replace function public.record_quiz_play(
  p_id uuid,
  p_topic text,
  p_mode text,
  p_run_id uuid default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  total bigint;
begin
  insert into public.quiz_play_events (id, topic, mode, run_id)
  values (p_id, left(btrim(p_topic), 100), p_mode, p_run_id)
  on conflict (id) do nothing;

  select count(*) into total from public.quiz_play_events;
  return total;
end;
$$;

create or replace function public.get_topic_archive_questions(
  p_topic text,
  p_limit integer default 3,
  p_exclude_ids uuid[] default '{}'::uuid[]
)
returns table (
  question_id uuid, label text, context text, prompt text, answer_short text,
  answer_explanation text, topic text, sources jsonb
)
language sql
security definer
set search_path = public
as $$
  with eligible as (
    select
      q.id as question_id,
      q.label,
      case when qe.rewrite_applied then coalesce(qe.rewrite_context, q.context) else q.context end as context,
      case when qe.rewrite_applied then coalesce(qe.rewrite_prompt, q.prompt) else q.prompt end as prompt,
      case when qe.rewrite_applied then coalesce(qe.rewrite_answer_short, q.answer_short) else q.answer_short end as answer_short,
      case when qe.rewrite_applied then coalesce(qe.rewrite_answer_explanation, q.answer_explanation) else q.answer_explanation end as answer_explanation,
      coalesce(nullif(q.topic, ''), qr.topic) as topic,
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', qs.source_key, 'title', qs.title, 'publisher', qs.publisher, 'url', qs.url
        ) order by qs.created_at, qs.id)
        from public.question_sources qs where qs.question_id = q.id
      ), '[]'::jsonb) as sources,
      trim(regexp_replace(lower(coalesce(q.answer_short, '')), '[^[:alnum:]]+', ' ', 'g')) as answer_key
    from public.questions q
    left join public.quiz_runs qr on qr.id = q.quiz_run_id
    join public.question_evaluations qe on qe.question_id = q.id
    where (q.origin = 'curated' or qr.status = 'evaluation_complete')
      and q.format = 'open_ended'
      and qe.ships
      and lower(btrim(coalesce(nullif(q.topic, ''), qr.topic))) = lower(btrim(p_topic))
      and not (q.id = any(coalesce(p_exclude_ids, '{}'::uuid[])))
      and exists (select 1 from public.question_sources qs where qs.question_id = q.id)
  ), distinct_answers as (
    select eligible.*, row_number() over (partition by answer_key order by random()) as answer_rank
    from eligible
    where answer_key <> ''
  )
  select question_id, label, context, prompt, answer_short, answer_explanation, topic, sources
  from distinct_answers
  where answer_rank = 1
  order by random()
  limit least(greatest(coalesce(p_limit, 3), 1), 10);
$$;

create or replace function public.import_curated_sheet(
  p_sheet_url text,
  p_sheet_title text,
  p_questions jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deck_id uuid;
  item jsonb;
  source jsonb;
  candidate_id uuid;
  question_id uuid;
  imported integer := 0;
begin
  insert into public.reference_decks (title, canonical_url, uploader_author)
  values (p_sheet_title, p_sheet_url, 'Local Google Sheet importer')
  on conflict (canonical_url) do update set title = excluded.title
  returning id into deck_id;

  for item in select value from jsonb_array_elements(p_questions)
  loop
    if exists (
      select 1 from public.reference_question_candidates
      where reference_question_candidates.deck_id = deck_id
        and slide_locator = item->>'rowNumber'
        and revision = 1
    ) then
      continue;
    end if;

    candidate_id := gen_random_uuid();
    question_id := gen_random_uuid();

    insert into public.reference_question_candidates (
      id, deck_id, slide_locator, premise_summary, topic, player_action, evidence_form,
      relationship, answer_contract, compatibility, status, adapted_question,
      verification_record, evaluator_metadata
    ) values (
      candidate_id, deck_id, item->>'rowNumber', left(item->>'context', 500), item->>'topic',
      'identify', 'narrative', 'shared_link', 'single_entity', 'current_open_ended', 'evaluated', item,
      jsonb_build_object('mode', 'trusted_local_sheet', 'sources', item->'sources'),
      jsonb_build_object(
        'decision', 'ACCEPT', 'solvability', 4, 'revealQuality', 4, 'clueDiscipline', 4,
        'originality', 4, 'answerPrecision', 4, 'wordingEfficiency', 4, 'overall', 4,
        'factualConfidence', 'High', 'decisionRationale', 'Approved through the local sheet import workflow.',
        'clueLeakageIssues', '[]'::jsonb, 'alternativeAnswers', '[]'::jsonb, 'ships', true
      )
    );

    insert into public.questions (
      id, origin, reference_candidate_id, topic, candidate_id, position, label, format,
      context, prompt, answer_short, answer_explanation, raw_question
    ) values (
      question_id, 'curated', candidate_id, item->>'topic', 'sheet-' || item->>'rowNumber', 1,
      item->>'label', 'open_ended', item->>'context', item->>'prompt',
      item->>'answerShort', item->>'answerExplanation', item
    );

    for source in select value from jsonb_array_elements(item->'sources')
    loop
      insert into public.question_sources (question_id, source_key, title, publisher, url)
      values (question_id, source->>'id', source->>'title', source->>'publisher', source->>'url');
    end loop;

    insert into public.question_evaluations (
      question_id, decision, solvability, reveal_quality, clue_discipline, originality,
      answer_precision, wording_efficiency, overall, factual_confidence, decision_rationale,
      clue_leakage_issues, alternative_answers, rewrite_applied, rewrite_score, ships, raw_evaluation
    ) values (
      question_id, 'ACCEPT', 4, 4, 4, 4, 4, 4, 4, 'High',
      'Approved through the local sheet import workflow.', '{}', '[]'::jsonb, false, 0, true,
      jsonb_build_object('source', 'trusted_local_sheet')
    );

    update public.reference_question_candidates
    set status = 'published', promoted_question_id = question_id
    where id = candidate_id;
    imported := imported + 1;
  end loop;

  return imported;
end;
$$;

alter table public.quiz_play_events enable row level security;
alter table public.quiz_run_question_sets enable row level security;
revoke all on table public.quiz_play_events from anon, authenticated;
revoke all on table public.quiz_run_question_sets from anon, authenticated;
grant select, insert on table public.quiz_play_events to service_role;
grant select, insert, update, delete on table public.quiz_run_question_sets to service_role;
revoke all on function public.record_quiz_play(uuid, text, text, uuid) from public, anon, authenticated;
revoke all on function public.get_topic_archive_questions(text, integer, uuid[]) from public, anon, authenticated;
revoke all on function public.import_curated_sheet(text, text, jsonb) from public, anon, authenticated;
grant execute on function public.record_quiz_play(uuid, text, text, uuid) to service_role;
grant execute on function public.get_topic_archive_questions(text, integer, uuid[]) to service_role;
grant execute on function public.import_curated_sheet(text, text, jsonb) to service_role;
