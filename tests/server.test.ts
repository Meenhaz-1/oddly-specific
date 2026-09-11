import { afterAll, beforeAll, beforeEach, expect, test, vi } from 'vitest';
import type { Server } from 'node:http';
import { generation, evaluation, modelResponse, openQuestion } from './fixtures/quiz';

const mocks = vi.hoisted(() => ({ create: vi.fn(), count: vi.fn(), tasks: [] as Promise<void>[],
  fetchTopicArchiveQuestions: vi.fn(), persistGeneratedQuiz: vi.fn(), persistEvaluations: vi.fn(),
  persistQuizComposition: vi.fn(), markEvaluationFailed: vi.fn() }));
vi.mock('dotenv/config', () => ({}));
vi.mock('openai', () => ({ default: class { responses = { create: mocks.create, inputTokens: { count: mocks.count } }; } }));
vi.mock('@vercel/functions', () => ({ waitUntil: (task: Promise<void>) => mocks.tasks.push(task) }));
vi.mock('../server/persistence.js', () => ({ ...mocks, isSupabaseConfigured: () => true,
  fetchRandomArchiveQuiz: vi.fn(), fetchSharedQuiz: vi.fn(), getQuizPlayCount: vi.fn(), importCuratedSheet: vi.fn(),
  recordQuizPlay: vi.fn(), saveQuestionFeedback: vi.fn(), syncPromptVersions: vi.fn() }));

let server: Server;
let base: string;
beforeAll(async () => {
  const { default: app } = await import('../server');
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No test listener');
  base = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => { await Promise.all(mocks.tasks); await new Promise<void>(resolve => server.close(() => resolve())); });
beforeEach(async () => {
  await Promise.all(mocks.tasks); mocks.tasks.length = 0;
  vi.resetAllMocks();
  mocks.create.mockResolvedValueOnce(modelResponse(generation())).mockResolvedValue(modelResponse(evaluation()));
  mocks.count.mockResolvedValue({ input_tokens: 100 });
  mocks.persistGeneratedQuiz.mockResolvedValue(true);
  mocks.persistEvaluations.mockResolvedValue(true);
  mocks.fetchTopicArchiveQuestions.mockResolvedValue(['Amber', 'Basalt', 'Copper'].map((answer, index) => openQuestion(answer, `archive-${index}`)));
});
async function generate(body: unknown = { topic: 'Communication' }) {
  return fetch(`${base}/api/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}
test('returns two playable questions and persists their evaluation', async () => {
  const response = await generate(); const body = await response.json();
  expect(response.status).toBe(200); expect(body.questions.map((q: { format: string }) => q.format)).toEqual(['open_ended', 'progressive_clues']);
  expect(body.runId).toMatch(/^[a-f0-9-]{36}$/);
  await Promise.all(mocks.tasks);
  expect(mocks.persistGeneratedQuiz).toHaveBeenCalledOnce();
  expect(mocks.persistEvaluations.mock.calls[0][2]).toEqual(expect.arrayContaining([expect.objectContaining({ candidateId: 'q01', ships: true })]));
});
test('invalid topics never call the model', async () => {
  expect((await generate({ topic: '' })).status).toBe(400); expect(mocks.create).not.toHaveBeenCalled();
});
test('an insufficient archive stops before paid generation', async () => {
  mocks.fetchTopicArchiveQuestions.mockResolvedValue([]);
  expect((await generate({ topic: 'Communication', includeArchive: true })).status).toBe(404);
  expect(mocks.create).not.toHaveBeenCalled();
});
test('composes and saves five questions in the played order', async () => {
  const response = await generate({ topic: 'Communication', includeArchive: true }); const body = await response.json();
  expect(response.status).toBe(200);
  expect(body.questions.map((q: { answer: { short: string } }) => q.answer.short)).toEqual(['Amber', 'Semaphore', 'Basalt', 'Cork', 'Copper']);
  expect(body.questions.map((q: { position: number }) => q.position)).toEqual([1, 2, 3, 4, 5]);
  await Promise.all(mocks.tasks);
  expect(mocks.persistQuizComposition).toHaveBeenCalledWith(body.runId, body.questions);
});
test('duplicate answers never reach the player', async () => {
  mocks.fetchTopicArchiveQuestions.mockResolvedValue(['Semaphore', 'Basalt', 'Copper'].map(answer => openQuestion(answer)));
  expect((await generate({ topic: 'Communication', includeArchive: true })).status).toBe(502);
  expect(mocks.persistGeneratedQuiz).not.toHaveBeenCalled();
});
test.each(['', '{"title":'])('malformed model output returns a controlled error (%j)', async text => {
  mocks.create.mockReset().mockResolvedValue({ output_text: text });
  expect((await generate()).status).toBe(502); expect(mocks.persistGeneratedQuiz).not.toHaveBeenCalled();
});
test('authentication failure does not expose provider details', async () => {
  mocks.create.mockReset().mockRejectedValue(Object.assign(new Error('private provider details'), { status: 401 }));
  const response = await generate(); expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ error: 'The OpenAI API key was rejected.' });
});
test('rejects answer leakage before persistence', async () => {
  const payload = generation(); payload.openEndedQuestion.context += ' Semaphore';
  mocks.create.mockReset().mockResolvedValue(modelResponse(payload));
  expect((await generate()).status).toBe(502); expect(mocks.persistGeneratedQuiz).not.toHaveBeenCalled();
});
test('rejects a pair with insufficient blueprint diversity', async () => {
  const payload = generation(); payload.progressiveCluesResearch.blueprint = payload.openEndedResearch.blueprint;
  mocks.create.mockReset().mockResolvedValue(modelResponse(payload));
  expect((await generate()).status).toBe(502);
});
test('evaluation failure marks the saved run failed without losing the delivered quiz', async () => {
  mocks.create.mockReset().mockResolvedValueOnce(modelResponse(generation())).mockRejectedValue(new Error('evaluation offline'));
  expect((await generate()).status).toBe(200); await Promise.all(mocks.tasks);
  expect(mocks.markEvaluationFailed).toHaveBeenCalledWith(expect.any(String), expect.any(String), 'evaluation offline');
  expect(mocks.persistEvaluations).not.toHaveBeenCalled();
});
test('a failed generation save prevents orphan evaluation writes', async () => {
  mocks.persistGeneratedQuiz.mockResolvedValue(false);
  expect((await generate()).status).toBe(200); await Promise.all(mocks.tasks);
  expect(mocks.persistEvaluations).not.toHaveBeenCalled(); expect(mocks.persistQuizComposition).not.toHaveBeenCalled();
});
test('composition failure does not prevent saving evaluation', async () => {
  mocks.persistQuizComposition.mockRejectedValue(new Error('composition offline'));
  expect((await generate({ topic: 'Communication', includeArchive: true })).status).toBe(200);
  await Promise.all(mocks.tasks); expect(mocks.persistEvaluations).toHaveBeenCalledOnce();
});

test('does not wait for background evaluation before returning questions', async () => {
  let finish!: (value: unknown) => void;
  mocks.create.mockReset().mockResolvedValueOnce(modelResponse(generation())).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  const response = await generate();
  try { expect(response.status).toBe(200); expect(mocks.persistEvaluations).not.toHaveBeenCalled(); }
  finally { finish(modelResponse(evaluation())); await Promise.all(mocks.tasks); }
});
test('independently verifies risky candidates before marking them shippable', async () => {
  const payload = generation(); payload.openEndedResearch.conflictsFound = true;
  const verified = evaluation(); verified.evaluations[0].verification.mode = 'independent_web_search';
  mocks.create.mockReset().mockResolvedValueOnce(modelResponse(payload)).mockResolvedValueOnce(modelResponse(evaluation()))
    .mockResolvedValueOnce({ ...modelResponse(verified), output: [{ type: 'web_search_call' }] });
  expect((await generate()).status).toBe(200); await Promise.all(mocks.tasks);
  expect(mocks.create).toHaveBeenCalledTimes(3);
  expect(mocks.create.mock.calls[2][0].tool_choice).toBe('required');
  expect(mocks.persistEvaluations).toHaveBeenCalledOnce();
});
test.fails('KNOWN BUG: archive collisions recover using another available question', async () => {
  mocks.fetchTopicArchiveQuestions.mockResolvedValue(['Semaphore', 'Amber', 'Basalt', 'Copper'].map(answer => openQuestion(answer)));
  const response = await generate({ topic: 'Communication', includeArchive: true });
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.questions).toHaveLength(5);
  expect(new Set(body.questions.map((q: { answer: { short: string } }) => q.answer.short)).size).toBe(5);
});
