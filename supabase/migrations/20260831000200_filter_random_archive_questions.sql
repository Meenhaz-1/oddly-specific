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
begin
  return query
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
        select jsonb_agg(
          jsonb_build_object(
            'id', qs.source_key,
            'title', qs.title,
            'publisher', qs.publisher,
            'url', qs.url
          ) order by qs.created_at, qs.id
        )
        from public.question_sources qs
        where qs.question_id = q.id
      ), '[]'::jsonb) as sources,
      q.id = any(excluded_ids) as was_excluded
    from public.questions q
    left join public.quiz_runs qr on qr.id = q.quiz_run_id
    join public.question_evaluations qe on qe.question_id = q.id
    where (q.origin = 'curated' or qr.status = 'evaluation_complete')
      and q.format = 'open_ended'
      and qe.ships
      and (q.origin = 'curated' or exists (
        select 1 from public.question_sources qs where qs.question_id = q.id
      ))
  ), normalized as (
    select
      eligible.*,
      trim(regexp_replace(lower(coalesce(eligible.answer_short, '')), '[^[:alnum:]]+', ' ', 'g')) as answer_key,
      trim(regexp_replace(lower(concat_ws(' ', eligible.context, eligible.prompt)), '[^[:alnum:]]+', ' ', 'g')) as stem_key
    from eligible
  ), valid as (
    select normalized.*
    from normalized
    where normalized.answer_key <> ''
      and not concat_ws(
        ' ',
        normalized.context,
        normalized.prompt,
        normalized.answer_short,
        normalized.answer_explanation
      ) ~*
        '(https?://|www[.]|\[[^]]+\][[:space:]]*[(]|[[:alnum:]-]+[.](com|org|net|gov|edu|mil|io|co|in|uk)([^[:alnum:]]|$))'
      and (
        char_length(normalized.answer_key) < 3
        or strpos(
          ' ' || normalized.stem_key || ' ',
          ' ' || normalized.answer_key || ' '
        ) = 0
      )
  ), ranked as (
    select
      valid.*,
      row_number() over (
        partition by valid.answer_key
        order by valid.was_excluded, random()
      ) as answer_rank
    from valid
  ), distinct_pool as (
    select
      ranked.*,
      count(*) filter (where not was_excluded) over ()::integer as unseen_count,
      count(*) over ()::integer as total_count
    from ranked
    where answer_rank = 1
  )
  select
    distinct_pool.question_id,
    distinct_pool.label,
    distinct_pool.context,
    distinct_pool.prompt,
    distinct_pool.answer_short,
    distinct_pool.answer_explanation,
    distinct_pool.topic,
    distinct_pool.sources,
    cardinality(excluded_ids) > 0
      and distinct_pool.unseen_count < least(requested_limit, distinct_pool.total_count)
      as reset_exclusions
  from distinct_pool
  order by distinct_pool.was_excluded, random()
  limit requested_limit;
end;
$$;

revoke all on function public.get_random_archive_questions(integer, uuid[]) from public, anon, authenticated;
grant execute on function public.get_random_archive_questions(integer, uuid[]) to service_role;

comment on function public.get_random_archive_questions(integer, uuid[]) is
  'Returns up to ten distinct, player-safe open-ended questions, preferring unseen questions and refilling from seen questions when necessary.';
