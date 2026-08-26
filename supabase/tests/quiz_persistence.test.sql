begin;
select plan(25);

select has_table('public', 'prompt_versions', 'prompt_versions exists');
select has_table('public', 'quiz_runs', 'quiz_runs exists');
select has_table('public', 'questions', 'questions exists');
select has_table('public', 'question_sources', 'question_sources exists');
select has_table('public', 'question_evaluations', 'question_evaluations exists');
select has_table('public', 'question_feedback', 'question_feedback exists');
select has_function('public', 'save_generated_quiz', array['jsonb', 'jsonb'], 'generation RPC exists');
select has_function('public', 'save_quiz_evaluations', array['uuid', 'jsonb', 'jsonb'], 'evaluation RPC exists');
select has_column('public', 'quiz_runs', 'generation_cached_input_tokens', 'generation cached tokens are stored');
select has_column('public', 'quiz_runs', 'generation_cache_hit_rate', 'generation cache hit rate is stored');
select has_column('public', 'quiz_runs', 'generation_prompt_cache_key', 'generation cache key is stored');
select has_column('public', 'quiz_runs', 'evaluation_cached_input_tokens', 'evaluation cached tokens are stored');
select has_column('public', 'quiz_runs', 'evaluation_cache_hit_rate', 'evaluation cache hit rate is stored');
select has_column('public', 'quiz_runs', 'evaluation_prompt_cache_key', 'evaluation cache key is stored');

select ok(
  not has_table_privilege('anon', 'public.questions', 'select,insert,update,delete'),
  'anon has no question table privileges'
);
select ok(
  not has_table_privilege('authenticated', 'public.question_feedback', 'select,insert,update,delete'),
  'authenticated has no feedback table privileges'
);

insert into public.prompt_versions (id, prompt_key, version_hash, template, source_paths) values
  ('11111111-1111-4111-8111-111111111111', 'generator', repeat('a', 64), 'generator', array['prompts/generator.md']),
  ('22222222-2222-4222-8222-222222222222', 'evaluator', repeat('b', 64), 'evaluator', array['prompts/evaluator.md']);

select lives_ok(
  $$select public.save_generated_quiz(
    '{"id":"33333333-3333-4333-8333-333333333333","externalRunId":"GEN-TEST","topic":"Test","questionCount":1,"generatorModel":"gpt-test","evaluatorModel":"gpt-test","generatorPromptVersionId":"11111111-1111-4111-8111-111111111111","evaluatorPromptVersionId":"22222222-2222-4222-8222-222222222222","generationResponseId":"resp-test","generationInputTokens":10,"generationOutputTokens":20,"generationTotalTokens":30,"generationWebSearchCalls":1,"generationDurationMs":100}'::jsonb,
    '[{"questionId":"44444444-4444-4444-8444-444444444444","id":"q01","position":1,"label":"TEST","format":"open_ended","context":"A sufficiently long test context for a generated question.","prompt":"What is being tested?","answer":{"short":"Persistence","explanation":"This verifies an atomic generated-question database write."},"sources":[{"id":"s01a","title":"Test source","publisher":"Test publisher","url":"https://example.com/source"}]}]'::jsonb
  )$$,
  'generated quiz RPC succeeds'
);
select results_eq(
  $$select count(*)::integer from public.quiz_runs where external_run_id = 'GEN-TEST'$$,
  array[1],
  'one run is stored'
);
select results_eq(
  $$select count(*)::integer from public.questions where quiz_run_id = '33333333-3333-4333-8333-333333333333'$$,
  array[1],
  'one question is stored'
);
select results_eq(
  $$select count(*)::integer from public.question_sources where question_id = '44444444-4444-4444-8444-444444444444'$$,
  array[1],
  'one source is stored'
);

select lives_ok(
  $$select public.save_quiz_evaluations(
    '33333333-3333-4333-8333-333333333333',
    '{"responseId":"resp-eval","inputTokens":5,"outputTokens":10,"totalTokens":15,"webSearchCalls":0,"durationMs":50}'::jsonb,
    '[{"candidateId":"q01","decision":"ACCEPT","scores":{"solvability":5,"revealQuality":5,"clueDiscipline":4,"originality":4,"answerPrecision":5,"wordingEfficiency":4},"overall":4.5,"clueLeakageIssues":[],"alternativeAnswers":[{"answer":"A","assessment":"No"},{"answer":"B","assessment":"No"},{"answer":"C","assessment":"No"}],"factualConfidence":"High","decisionRationale":"Strong test question.","rewrite":{"applied":false,"context":"","prompt":"","answerShort":"","answerExplanation":"","score":0},"ships":true}]'::jsonb
  )$$,
  'evaluation RPC succeeds'
);
select results_eq(
  $$select count(*)::integer from public.question_evaluations where question_id = '44444444-4444-4444-8444-444444444444'$$,
  array[1],
  'one evaluation is stored'
);

select lives_ok(
  $$insert into public.question_feedback (question_id, anonymous_session_id, rating)
    values ('44444444-4444-4444-8444-444444444444', '55555555-5555-4555-8555-555555555555', 'good')$$,
  'first feedback write succeeds'
);
select lives_ok(
  $$insert into public.question_feedback (question_id, anonymous_session_id, rating)
    values ('44444444-4444-4444-8444-444444444444', '55555555-5555-4555-8555-555555555555', 'weak')
    on conflict (question_id, anonymous_session_id) do update set rating = excluded.rating$$,
  'feedback can be changed'
);
select results_eq(
  $$select rating from public.question_feedback where question_id = '44444444-4444-4444-8444-444444444444'$$,
  array['weak'::text],
  'one editable feedback row remains'
);

select * from finish();
rollback;
