alter table public.quiz_runs
  add column generation_cached_input_tokens integer,
  add column generation_cache_hit_rate numeric(7, 6),
  add column generation_prompt_cache_key text,
  add column evaluation_cached_input_tokens integer,
  add column evaluation_cache_hit_rate numeric(7, 6),
  add column evaluation_prompt_cache_key text;

alter table public.quiz_runs
  add constraint quiz_runs_generation_cached_input_tokens_nonnegative
    check (generation_cached_input_tokens is null or generation_cached_input_tokens >= 0),
  add constraint quiz_runs_generation_cache_hit_rate_valid
    check (generation_cache_hit_rate is null or generation_cache_hit_rate between 0 and 1),
  add constraint quiz_runs_evaluation_cached_input_tokens_nonnegative
    check (evaluation_cached_input_tokens is null or evaluation_cached_input_tokens >= 0),
  add constraint quiz_runs_evaluation_cache_hit_rate_valid
    check (evaluation_cache_hit_rate is null or evaluation_cache_hit_rate between 0 and 1);

comment on column public.quiz_runs.generation_cached_input_tokens is
  'OpenAI input tokens served from prompt cache for generation.';
comment on column public.quiz_runs.generation_cache_hit_rate is
  'Generation cached input tokens divided by total input tokens.';
comment on column public.quiz_runs.generation_prompt_cache_key is
  'Version-derived OpenAI prompt cache key used for generation.';
comment on column public.quiz_runs.evaluation_cached_input_tokens is
  'OpenAI input tokens served from prompt cache for evaluation.';
comment on column public.quiz_runs.evaluation_cache_hit_rate is
  'Evaluation cached input tokens divided by total input tokens.';
comment on column public.quiz_runs.evaluation_prompt_cache_key is
  'Version-derived OpenAI prompt cache key used for evaluation.';
