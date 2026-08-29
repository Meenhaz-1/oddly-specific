alter table public.questions
  drop constraint questions_format_check;

alter table public.questions
  add constraint questions_format_check
  check (format in ('open_ended', 'progressive_clues'));

create or replace function public.get_random_archive_questions(
  p_limit integer,
  p_exclude_ids uuid[] default '{}'::uuid[]
)
returns table (
  question_id uuid,
  label text,
  context text,
  prompt text,
  answer_short text,
  answer_explanation text,
  topic text,
  sources jsonb,
  reset_exclusions boolean
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
  select count(*)::integer
    into unseen_count
  from public.questions q
  join public.quiz_runs qr on qr.id = q.quiz_run_id
  join public.question_evaluations qe on qe.question_id = q.id
  where qr.status = 'evaluation_complete'
    and q.format = 'open_ended'
    and qe.ships
    and exists (select 1 from public.question_sources qs where qs.question_id = q.id)
    and not (q.id = any(excluded_ids));

  if unseen_count = 0 and cardinality(excluded_ids) > 0 then
    excluded_ids := '{}'::uuid[];
    should_reset := true;
  end if;

  return query
  select
    q.id,
    q.label,
    case when qe.rewrite_applied then coalesce(qe.rewrite_context, q.context) else q.context end,
    case when qe.rewrite_applied then coalesce(qe.rewrite_prompt, q.prompt) else q.prompt end,
    case when qe.rewrite_applied then coalesce(qe.rewrite_answer_short, q.answer_short) else q.answer_short end,
    case when qe.rewrite_applied then coalesce(qe.rewrite_answer_explanation, q.answer_explanation) else q.answer_explanation end,
    qr.topic,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', qs.source_key,
            'title', qs.title,
            'publisher', qs.publisher,
            'url', qs.url
          )
          order by qs.created_at, qs.id
        )
        from public.question_sources qs
        where qs.question_id = q.id
      ),
      '[]'::jsonb
    ),
    should_reset
  from public.questions q
  join public.quiz_runs qr on qr.id = q.quiz_run_id
  join public.question_evaluations qe on qe.question_id = q.id
  where qr.status = 'evaluation_complete'
    and q.format = 'open_ended'
    and qe.ships
    and exists (select 1 from public.question_sources qs where qs.question_id = q.id)
    and not (q.id = any(excluded_ids))
  order by random()
  limit requested_limit;
end;
$$;

revoke all on function public.get_random_archive_questions(integer, uuid[]) from public, anon, authenticated;
grant execute on function public.get_random_archive_questions(integer, uuid[]) to service_role;

comment on function public.get_random_archive_questions(integer, uuid[]) is
  'Returns a uniformly random, service-role-only set of evaluated open-ended questions approved to ship.';
