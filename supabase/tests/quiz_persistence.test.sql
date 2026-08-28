begin;
select plan(46);

select has_table('public', 'prompt_versions', 'prompt_versions exists');
select has_table('public', 'quiz_runs', 'quiz_runs exists');
select has_table('public', 'questions', 'questions exists');
select has_table('public', 'question_sources', 'question_sources exists');
select has_table('public', 'question_evaluations', 'question_evaluations exists');
select has_table('public', 'question_feedback', 'question_feedback exists');
select has_function('public', 'save_generated_quiz', array['jsonb', 'jsonb'], 'generation RPC exists');
select has_function('public', 'save_quiz_evaluations', array['uuid', 'jsonb', 'jsonb'], 'evaluation RPC exists');
select has_function('public', 'get_random_archive_questions', array['integer', 'uuid[]'], 'random archive RPC exists');
select has_column('public', 'quiz_runs', 'generation_cached_input_tokens', 'generation cached tokens are stored');
select has_column('public', 'quiz_runs', 'generation_cache_hit_rate', 'generation cache hit rate is stored');
select has_column('public', 'quiz_runs', 'generation_prompt_cache_key', 'generation cache key is stored');
select has_column('public', 'quiz_runs', 'evaluation_cached_input_tokens', 'evaluation cached tokens are stored');
select has_column('public', 'quiz_runs', 'evaluation_cache_hit_rate', 'evaluation cache hit rate is stored');
select has_column('public', 'quiz_runs', 'evaluation_prompt_cache_key', 'evaluation cache key is stored');
select has_column('public', 'quiz_runs', 'generation_initial_input_tokens', 'generation initial input tokens are stored');
select has_column('public', 'quiz_runs', 'generation_tool_loop_input_tokens', 'generation tool-loop input tokens are stored');
select has_column('public', 'quiz_runs', 'generation_uncached_input_tokens', 'generation uncached input tokens are stored');
select has_column('public', 'quiz_runs', 'generation_cache_write_input_tokens', 'generation cache-write input tokens are stored');
select has_column('public', 'quiz_runs', 'generation_reasoning_output_tokens', 'generation reasoning output tokens are stored');
select has_column('public', 'quiz_runs', 'generation_visible_output_tokens', 'generation visible output tokens are stored');
select has_column('public', 'quiz_runs', 'evaluation_initial_input_tokens', 'evaluation initial input tokens are stored');
select has_column('public', 'quiz_runs', 'evaluation_tool_loop_input_tokens', 'evaluation tool-loop input tokens are stored');
select has_column('public', 'quiz_runs', 'evaluation_uncached_input_tokens', 'evaluation uncached input tokens are stored');
select has_column('public', 'quiz_runs', 'evaluation_cache_write_input_tokens', 'evaluation cache-write input tokens are stored');
select has_column('public', 'quiz_runs', 'evaluation_reasoning_output_tokens', 'evaluation reasoning output tokens are stored');
select has_column('public', 'quiz_runs', 'evaluation_visible_output_tokens', 'evaluation visible output tokens are stored');

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

insert into public.questions (
  id, quiz_run_id, candidate_id, position, label, format, context, prompt,
  answer_short, answer_explanation, raw_question
) values
  (
    '66666666-6666-4666-8666-666666666666', '33333333-3333-4333-8333-333333333333',
    'q02', 2, 'SECOND', 'open_ended', 'Second original context.', 'Second original prompt?',
    'Second answer', 'Second explanation.', '{}'::jsonb
  ),
  (
    '77777777-7777-4777-8777-777777777777', '33333333-3333-4333-8333-333333333333',
    'q03', 3, 'REJECTED', 'open_ended', 'Rejected context.', 'Rejected prompt?',
    'Rejected answer', 'Rejected explanation.', '{}'::jsonb
  );

insert into public.question_sources (question_id, source_key, title, publisher, url) values
  ('66666666-6666-4666-8666-666666666666', 's02a', 'Second source', 'Second publisher', 'https://example.com/second'),
  ('77777777-7777-4777-8777-777777777777', 's03a', 'Rejected source', 'Rejected publisher', 'https://example.com/rejected');

insert into public.question_evaluations (
  question_id, decision, solvability, reveal_quality, clue_discipline, originality,
  answer_precision, wording_efficiency, overall, factual_confidence, decision_rationale,
  clue_leakage_issues, alternative_answers, rewrite_applied, rewrite_score, ships, raw_evaluation
) values
  (
    '66666666-6666-4666-8666-666666666666', 'ACCEPT', 5, 5, 4, 4,
    5, 4, 4.5, 'High', 'Second question ships.', '{}', '[]'::jsonb, false, 0, true, '{}'::jsonb
  ),
  (
    '77777777-7777-4777-8777-777777777777', 'REJECT', 2, 2, 2, 2,
    2, 2, 2.0, 'Medium', 'Rejected question does not ship.', '{}', '[]'::jsonb, false, 0, false, '{}'::jsonb
  );

update public.question_evaluations
set rewrite_applied = true,
    rewrite_context = 'Rewritten context.',
    rewrite_prompt = 'Rewritten prompt?',
    rewrite_answer_short = 'Rewritten answer',
    rewrite_answer_explanation = 'Rewritten explanation.',
    rewrite_score = 4.8
where question_id = '44444444-4444-4444-8444-444444444444';

select results_eq(
  $$select count(*)::integer from public.get_random_archive_questions(10, '{}'::uuid[])$$,
  array[2],
  'only the two shipped questions are eligible'
);
select results_eq(
  $$select question_id from public.get_random_archive_questions(10, array['44444444-4444-4444-8444-444444444444'::uuid])$$,
  array['66666666-6666-4666-8666-666666666666'::uuid],
  'excluded question IDs are omitted while unseen questions remain'
);
select results_eq(
  $$select context from public.get_random_archive_questions(10, array['66666666-6666-4666-8666-666666666666'::uuid])$$,
  array['Rewritten context.'::text],
  'approved rewrite text takes precedence'
);
select results_eq(
  $$select sources->0->>'title' from public.get_random_archive_questions(10, array['66666666-6666-4666-8666-666666666666'::uuid])$$,
  array['Test source'::text],
  'archive questions include their sources'
);
select results_eq(
  $$select count(*)::integer from public.get_random_archive_questions(10, array[
    '44444444-4444-4444-8444-444444444444'::uuid,
    '66666666-6666-4666-8666-666666666666'::uuid
  ]) where reset_exclusions$$,
  array[2],
  'the pool resets after every eligible question has been excluded'
);
select results_eq(
  $$select count(*)::integer from public.get_random_archive_questions(10, '{}'::uuid[])
    where question_id = '77777777-7777-4777-8777-777777777777'::uuid$$,
  array[0],
  'questions that do not ship are never returned'
);
select ok(
  not has_function_privilege('anon', 'public.get_random_archive_questions(integer,uuid[])', 'execute'),
  'anon cannot execute the random archive RPC'
);
select ok(
  not has_function_privilege('authenticated', 'public.get_random_archive_questions(integer,uuid[])', 'execute'),
  'authenticated users cannot execute the random archive RPC'
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
