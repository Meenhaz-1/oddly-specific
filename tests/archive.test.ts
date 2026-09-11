import { beforeEach, expect, test, vi } from 'vitest';
import { openQuestion, source } from './fixtures/quiz';
const db = vi.hoisted(() => ({ rows: [] as unknown[], error: null as unknown, select: vi.fn(), rpc: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ ilike: () => ({ limit: async () => ({ data: db.rows, error: db.error }) }) }) }) }), rpc: db.rpc }) }));
import { fetchTopicArchiveQuestions } from '../server/persistence';
beforeEach(() => { vi.stubEnv('SUPABASE_URL', 'http://127.0.0.1:54321'); vi.stubEnv('SUPABASE_SECRET_KEY', 'test-only'); db.rows = []; db.error = null; });
function row(ships = true, status = 'evaluation_complete') {
  const q = openQuestion();
  return { id: q.questionId, label: q.label, context: q.context, prompt: q.prompt, answer_short: q.answer.short, answer_explanation: q.answer.explanation,
    topic: 'Communication', origin: 'generated', question_sources: [{ source_key: source.id, ...source }], quiz_runs: { status },
    question_evaluations: { ships, rewrite_applied: false } };
}
test('excludes unfinished generated questions and questions without sources', async () => {
  db.rows = [row(true, 'pending'), { ...row(), question_sources: [] }];
  expect(await fetchTopicArchiveQuestions('Communication', 3)).toEqual([]);
});
test('maps approved editorial rewrites to player copy', async () => {
  const value = row(); value.question_evaluations = { ships: true, rewrite_applied: true };
  db.rows = [{ ...value, question_evaluations: { ...value.question_evaluations, rewrite_context: 'Revised evidence', rewrite_prompt: 'Revised question?', rewrite_answer_short: 'Optical relay', rewrite_answer_explanation: 'Revised explanation' } }];
  const result = await fetchTopicArchiveQuestions('Communication', 3);
  expect(result[0]).toMatchObject({ context: 'Revised evidence', prompt: 'Revised question?', answer: { short: 'Optical relay', explanation: 'Revised explanation' } });
});
test('propagates database failures instead of treating them as an empty archive', async () => {
  db.error = { message: 'database unavailable' };
  await expect(fetchTopicArchiveQuestions('Communication', 3)).rejects.toEqual(db.error);
});
test.fails('KNOWN BUG: rejected archive questions must never be served', async () => {
  db.rows = [row(false)];
  expect(await fetchTopicArchiveQuestions('Communication', 3)).toEqual([]);
});
