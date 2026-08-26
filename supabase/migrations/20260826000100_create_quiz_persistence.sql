create extension if not exists pgcrypto with schema extensions;

create table public.prompt_versions (
  id uuid primary key default gen_random_uuid(),
  prompt_key text not null check (prompt_key in ('generator', 'evaluator')),
  version_hash text not null check (version_hash ~ '^[0-9a-f]{64}$'),
  template text not null,
  source_paths text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (prompt_key, version_hash)
);

create table public.quiz_runs (
  id uuid primary key,
  external_run_id text not null unique,
  topic text not null,
  question_count integer not null check (question_count between 1 and 10),
  generator_model text not null,
  evaluator_model text not null,
  generator_prompt_version_id uuid not null references public.prompt_versions(id),
  evaluator_prompt_version_id uuid not null references public.prompt_versions(id),
  status text not null default 'generated' check (status in ('generated', 'evaluation_complete', 'evaluation_failed')),
  generation_response_id text,
  generation_input_tokens integer,
  generation_output_tokens integer,
  generation_total_tokens integer,
  generation_web_search_calls integer,
  generation_duration_ms integer,
  evaluation_response_id text,
  evaluation_input_tokens integer,
  evaluation_output_tokens integer,
  evaluation_total_tokens integer,
  evaluation_web_search_calls integer,
  evaluation_duration_ms integer,
  generation_error text,
  evaluation_error text,
  created_at timestamptz not null default now(),
  generated_at timestamptz,
  evaluated_at timestamptz
);

create table public.questions (
  id uuid primary key,
  quiz_run_id uuid not null references public.quiz_runs(id) on delete cascade,
  candidate_id text not null,
  position integer not null check (position between 1 and 10),
  label text not null,
  format text not null check (format = 'open_ended'),
  context text not null,
  prompt text not null,
  answer_short text not null,
  answer_explanation text not null,
  raw_question jsonb not null,
  created_at timestamptz not null default now(),
  unique (quiz_run_id, candidate_id),
  unique (quiz_run_id, position)
);

create table public.question_sources (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  source_key text not null,
  title text not null,
  publisher text not null,
  url text not null,
  created_at timestamptz not null default now(),
  unique (question_id, source_key)
);

create table public.question_evaluations (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null unique references public.questions(id) on delete cascade,
  decision text not null check (decision in ('ACCEPT', 'REWRITE', 'REJECT')),
  solvability integer not null check (solvability between 1 and 5),
  reveal_quality integer not null check (reveal_quality between 1 and 5),
  clue_discipline integer not null check (clue_discipline between 1 and 5),
  originality integer not null check (originality between 1 and 5),
  answer_precision integer not null check (answer_precision between 1 and 5),
  wording_efficiency integer not null check (wording_efficiency between 1 and 5),
  overall numeric(2,1) not null check (overall between 1 and 5),
  factual_confidence text not null check (factual_confidence in ('High', 'Medium', 'Low')),
  decision_rationale text not null,
  clue_leakage_issues text[] not null default '{}',
  alternative_answers jsonb not null default '[]'::jsonb,
  rewrite_applied boolean not null,
  rewrite_context text,
  rewrite_prompt text,
  rewrite_answer_short text,
  rewrite_answer_explanation text,
  rewrite_score numeric(2,1) not null check (rewrite_score between 0 and 5),
  ships boolean not null,
  raw_evaluation jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.question_feedback (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  anonymous_session_id uuid not null,
  rating text not null check (rating in ('good', 'weak')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (question_id, anonymous_session_id)
);

create index quiz_runs_topic_idx on public.quiz_runs (lower(topic));
create index quiz_runs_status_idx on public.quiz_runs (status, created_at desc);
create index questions_run_position_idx on public.questions (quiz_run_id, position);
create index question_evaluations_decision_idx on public.question_evaluations (decision, ships);
create index question_feedback_question_rating_idx on public.question_feedback (question_id, rating);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger question_evaluations_touch_updated_at
before update on public.question_evaluations
for each row execute function public.touch_updated_at();

create trigger question_feedback_touch_updated_at
before update on public.question_feedback
for each row execute function public.touch_updated_at();

create or replace function public.prevent_prompt_version_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'prompt_versions rows are immutable; insert a new version instead';
end;
$$;

create trigger prompt_versions_are_immutable
before update or delete on public.prompt_versions
for each row execute function public.prevent_prompt_version_mutation();

create or replace function public.save_generated_quiz(p_run jsonb, p_questions jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  run_id uuid := (p_run->>'id')::uuid;
  question_record jsonb;
  source_record jsonb;
  question_uuid uuid;
begin
  insert into public.quiz_runs (
    id, external_run_id, topic, question_count, generator_model, evaluator_model,
    generator_prompt_version_id, evaluator_prompt_version_id, status,
    generation_response_id, generation_input_tokens, generation_output_tokens,
    generation_total_tokens, generation_web_search_calls, generation_duration_ms, generated_at
  ) values (
    run_id, p_run->>'externalRunId', p_run->>'topic', (p_run->>'questionCount')::integer,
    p_run->>'generatorModel', p_run->>'evaluatorModel',
    (p_run->>'generatorPromptVersionId')::uuid, (p_run->>'evaluatorPromptVersionId')::uuid,
    'generated', p_run->>'generationResponseId',
    nullif(p_run->>'generationInputTokens', '')::integer,
    nullif(p_run->>'generationOutputTokens', '')::integer,
    nullif(p_run->>'generationTotalTokens', '')::integer,
    nullif(p_run->>'generationWebSearchCalls', '')::integer,
    nullif(p_run->>'generationDurationMs', '')::integer,
    now()
  )
  on conflict (id) do update set
    topic = excluded.topic,
    question_count = excluded.question_count,
    generation_response_id = excluded.generation_response_id,
    generation_input_tokens = excluded.generation_input_tokens,
    generation_output_tokens = excluded.generation_output_tokens,
    generation_total_tokens = excluded.generation_total_tokens,
    generation_web_search_calls = excluded.generation_web_search_calls,
    generation_duration_ms = excluded.generation_duration_ms,
    generated_at = coalesce(public.quiz_runs.generated_at, excluded.generated_at);

  for question_record in select value from jsonb_array_elements(p_questions)
  loop
    question_uuid := (question_record->>'questionId')::uuid;
    insert into public.questions (
      id, quiz_run_id, candidate_id, position, label, format, context, prompt,
      answer_short, answer_explanation, raw_question
    ) values (
      question_uuid, run_id, question_record->>'id', (question_record->>'position')::integer,
      question_record->>'label', question_record->>'format', question_record->>'context',
      question_record->>'prompt', question_record->'answer'->>'short',
      question_record->'answer'->>'explanation', question_record
    )
    on conflict (id) do update set
      label = excluded.label,
      context = excluded.context,
      prompt = excluded.prompt,
      answer_short = excluded.answer_short,
      answer_explanation = excluded.answer_explanation,
      raw_question = excluded.raw_question;

    for source_record in select value from jsonb_array_elements(coalesce(question_record->'sources', '[]'::jsonb))
    loop
      insert into public.question_sources (question_id, source_key, title, publisher, url)
      values (
        question_uuid, source_record->>'id', source_record->>'title',
        source_record->>'publisher', source_record->>'url'
      )
      on conflict (question_id, source_key) do update set
        title = excluded.title,
        publisher = excluded.publisher,
        url = excluded.url;
    end loop;
  end loop;

  return run_id;
end;
$$;

create or replace function public.save_quiz_evaluations(
  p_run_id uuid,
  p_metadata jsonb,
  p_evaluations jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  evaluation_record jsonb;
  question_uuid uuid;
begin
  for evaluation_record in select value from jsonb_array_elements(p_evaluations)
  loop
    select id into question_uuid
    from public.questions
    where quiz_run_id = p_run_id and candidate_id = evaluation_record->>'candidateId';

    if question_uuid is null then
      raise exception 'No question found for candidate % in run %', evaluation_record->>'candidateId', p_run_id;
    end if;

    insert into public.question_evaluations (
      question_id, decision, solvability, reveal_quality, clue_discipline, originality,
      answer_precision, wording_efficiency, overall, factual_confidence, decision_rationale,
      clue_leakage_issues, alternative_answers, rewrite_applied, rewrite_context,
      rewrite_prompt, rewrite_answer_short, rewrite_answer_explanation, rewrite_score,
      ships, raw_evaluation
    ) values (
      question_uuid, evaluation_record->>'decision',
      (evaluation_record->'scores'->>'solvability')::integer,
      (evaluation_record->'scores'->>'revealQuality')::integer,
      (evaluation_record->'scores'->>'clueDiscipline')::integer,
      (evaluation_record->'scores'->>'originality')::integer,
      (evaluation_record->'scores'->>'answerPrecision')::integer,
      (evaluation_record->'scores'->>'wordingEfficiency')::integer,
      (evaluation_record->>'overall')::numeric,
      evaluation_record->>'factualConfidence', evaluation_record->>'decisionRationale',
      array(select jsonb_array_elements_text(coalesce(evaluation_record->'clueLeakageIssues', '[]'::jsonb))),
      coalesce(evaluation_record->'alternativeAnswers', '[]'::jsonb),
      (evaluation_record->'rewrite'->>'applied')::boolean,
      nullif(evaluation_record->'rewrite'->>'context', ''),
      nullif(evaluation_record->'rewrite'->>'prompt', ''),
      nullif(evaluation_record->'rewrite'->>'answerShort', ''),
      nullif(evaluation_record->'rewrite'->>'answerExplanation', ''),
      (evaluation_record->'rewrite'->>'score')::numeric,
      coalesce((evaluation_record->>'ships')::boolean, false), evaluation_record
    )
    on conflict (question_id) do update set
      decision = excluded.decision,
      solvability = excluded.solvability,
      reveal_quality = excluded.reveal_quality,
      clue_discipline = excluded.clue_discipline,
      originality = excluded.originality,
      answer_precision = excluded.answer_precision,
      wording_efficiency = excluded.wording_efficiency,
      overall = excluded.overall,
      factual_confidence = excluded.factual_confidence,
      decision_rationale = excluded.decision_rationale,
      clue_leakage_issues = excluded.clue_leakage_issues,
      alternative_answers = excluded.alternative_answers,
      rewrite_applied = excluded.rewrite_applied,
      rewrite_context = excluded.rewrite_context,
      rewrite_prompt = excluded.rewrite_prompt,
      rewrite_answer_short = excluded.rewrite_answer_short,
      rewrite_answer_explanation = excluded.rewrite_answer_explanation,
      rewrite_score = excluded.rewrite_score,
      ships = excluded.ships,
      raw_evaluation = excluded.raw_evaluation;
  end loop;

  update public.quiz_runs set
    status = 'evaluation_complete',
    evaluation_response_id = p_metadata->>'responseId',
    evaluation_input_tokens = nullif(p_metadata->>'inputTokens', '')::integer,
    evaluation_output_tokens = nullif(p_metadata->>'outputTokens', '')::integer,
    evaluation_total_tokens = nullif(p_metadata->>'totalTokens', '')::integer,
    evaluation_web_search_calls = nullif(p_metadata->>'webSearchCalls', '')::integer,
    evaluation_duration_ms = nullif(p_metadata->>'durationMs', '')::integer,
    evaluation_error = null,
    evaluated_at = now()
  where id = p_run_id;
end;
$$;

alter table public.prompt_versions enable row level security;
alter table public.quiz_runs enable row level security;
alter table public.questions enable row level security;
alter table public.question_sources enable row level security;
alter table public.question_evaluations enable row level security;
alter table public.question_feedback enable row level security;

revoke all on table public.prompt_versions from anon, authenticated;
revoke all on table public.quiz_runs from anon, authenticated;
revoke all on table public.questions from anon, authenticated;
revoke all on table public.question_sources from anon, authenticated;
revoke all on table public.question_evaluations from anon, authenticated;
revoke all on table public.question_feedback from anon, authenticated;

grant select, insert, update, delete on table public.prompt_versions to service_role;
grant select, insert, update, delete on table public.quiz_runs to service_role;
grant select, insert, update, delete on table public.questions to service_role;
grant select, insert, update, delete on table public.question_sources to service_role;
grant select, insert, update, delete on table public.question_evaluations to service_role;
grant select, insert, update, delete on table public.question_feedback to service_role;

revoke all on function public.touch_updated_at() from public, anon, authenticated;
revoke all on function public.prevent_prompt_version_mutation() from public, anon, authenticated;
revoke all on function public.save_generated_quiz(jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.save_quiz_evaluations(uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.save_generated_quiz(jsonb, jsonb) to service_role;
grant execute on function public.save_quiz_evaluations(uuid, jsonb, jsonb) to service_role;
