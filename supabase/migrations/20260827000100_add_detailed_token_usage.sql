alter table public.quiz_runs
  add column generation_initial_input_tokens integer,
  add column generation_tool_loop_input_tokens integer,
  add column generation_uncached_input_tokens integer,
  add column generation_cache_write_input_tokens integer,
  add column generation_reasoning_output_tokens integer,
  add column generation_visible_output_tokens integer,
  add column evaluation_initial_input_tokens integer,
  add column evaluation_tool_loop_input_tokens integer,
  add column evaluation_uncached_input_tokens integer,
  add column evaluation_cache_write_input_tokens integer,
  add column evaluation_reasoning_output_tokens integer,
  add column evaluation_visible_output_tokens integer;

alter table public.quiz_runs
  add constraint quiz_runs_generation_initial_input_tokens_nonnegative
    check (generation_initial_input_tokens is null or generation_initial_input_tokens >= 0),
  add constraint quiz_runs_generation_tool_loop_input_tokens_nonnegative
    check (generation_tool_loop_input_tokens is null or generation_tool_loop_input_tokens >= 0),
  add constraint quiz_runs_generation_uncached_input_tokens_nonnegative
    check (generation_uncached_input_tokens is null or generation_uncached_input_tokens >= 0),
  add constraint quiz_runs_generation_cache_write_input_tokens_nonnegative
    check (generation_cache_write_input_tokens is null or generation_cache_write_input_tokens >= 0),
  add constraint quiz_runs_generation_reasoning_output_tokens_nonnegative
    check (generation_reasoning_output_tokens is null or generation_reasoning_output_tokens >= 0),
  add constraint quiz_runs_generation_visible_output_tokens_nonnegative
    check (generation_visible_output_tokens is null or generation_visible_output_tokens >= 0),
  add constraint quiz_runs_evaluation_initial_input_tokens_nonnegative
    check (evaluation_initial_input_tokens is null or evaluation_initial_input_tokens >= 0),
  add constraint quiz_runs_evaluation_tool_loop_input_tokens_nonnegative
    check (evaluation_tool_loop_input_tokens is null or evaluation_tool_loop_input_tokens >= 0),
  add constraint quiz_runs_evaluation_uncached_input_tokens_nonnegative
    check (evaluation_uncached_input_tokens is null or evaluation_uncached_input_tokens >= 0),
  add constraint quiz_runs_evaluation_cache_write_input_tokens_nonnegative
    check (evaluation_cache_write_input_tokens is null or evaluation_cache_write_input_tokens >= 0),
  add constraint quiz_runs_evaluation_reasoning_output_tokens_nonnegative
    check (evaluation_reasoning_output_tokens is null or evaluation_reasoning_output_tokens >= 0),
  add constraint quiz_runs_evaluation_visible_output_tokens_nonnegative
    check (evaluation_visible_output_tokens is null or evaluation_visible_output_tokens >= 0);

comment on column public.quiz_runs.generation_initial_input_tokens is
  'Tokens in the initial generation request before hosted-tool iterations, counted by the OpenAI input token endpoint.';
comment on column public.quiz_runs.generation_tool_loop_input_tokens is
  'Generation input tokens beyond the initial request; derived as final input tokens minus initial input tokens.';
comment on column public.quiz_runs.generation_uncached_input_tokens is
  'Generation input tokens not served from cache; derived as input tokens minus cached input tokens.';
comment on column public.quiz_runs.generation_cache_write_input_tokens is
  'Generation input tokens written to the OpenAI prompt cache when reported by the API.';
comment on column public.quiz_runs.generation_reasoning_output_tokens is
  'Non-visible reasoning tokens in the generation response.';
comment on column public.quiz_runs.generation_visible_output_tokens is
  'Visible generation output tokens; derived as output tokens minus reasoning output tokens.';
comment on column public.quiz_runs.evaluation_initial_input_tokens is
  'Tokens in the initial evaluation request before hosted-tool iterations, counted by the OpenAI input token endpoint.';
comment on column public.quiz_runs.evaluation_tool_loop_input_tokens is
  'Evaluation input tokens beyond the initial request; derived as final input tokens minus initial input tokens.';
comment on column public.quiz_runs.evaluation_uncached_input_tokens is
  'Evaluation input tokens not served from cache; derived as input tokens minus cached input tokens.';
comment on column public.quiz_runs.evaluation_cache_write_input_tokens is
  'Evaluation input tokens written to the OpenAI prompt cache when reported by the API.';
comment on column public.quiz_runs.evaluation_reasoning_output_tokens is
  'Non-visible reasoning tokens in the evaluation response.';
comment on column public.quiz_runs.evaluation_visible_output_tokens is
  'Visible evaluation output tokens; derived as output tokens minus reasoning output tokens.';
