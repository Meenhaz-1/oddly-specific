// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { useQuizEngine } from '../src/hooks/useQuizEngine';
import { openQuestion, quiz, runId } from './fixtures/quiz';

const fetchMock = vi.fn();
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
beforeEach(() => {
  localStorage.clear(); sessionStorage.clear(); window.history.replaceState({}, '', '/');
  vi.stubGlobal('fetch', fetchMock); fetchMock.mockReset();
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
async function start() {
  const hook = renderHook(() => useQuizEngine());
  act(() => { hook.result.current.actions.setOther('Communication'); });
  act(() => { hook.result.current.actions.startQuiz(); });
  await waitFor(() => expect(hook.result.current.state.screen).toBe('intro'));
  return hook;
}
test('generation sends the topic and transitions to a validated playable set', async () => {
  fetchMock.mockResolvedValue(response(quiz()));
  const { result } = await start();
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ topic: 'Communication', count: 2, includeArchive: false });
  expect(result.current.bank).toHaveLength(2);
  expect(window.location.pathname).toBe('/quiz');
});
test('shows generation errors and allows a successful retry', async () => {
  fetchMock.mockResolvedValueOnce(response({ error: 'Temporary generation failure' }, 502)).mockResolvedValue(response(quiz()));
  const { result } = renderHook(() => useQuizEngine());
  act(() => { result.current.actions.startQuiz(); });
  await waitFor(() => expect(result.current.state.generationError).toBe('Temporary generation failure'));
  act(() => { result.current.actions.retryGeneration(); });
  await waitFor(() => expect(result.current.state.screen).toBe('intro'));
  expect(result.current.state.generationError).toBe('');
});
test('malformed successful responses do not enter the quiz', async () => {
  fetchMock.mockResolvedValue(response({ ...quiz(), questions: [] }));
  const { result } = renderHook(() => useQuizEngine());
  act(() => { result.current.actions.startQuiz(); });
  await waitFor(() => expect(result.current.state.generationError).toMatch(/incomplete|malformed/));
  expect(result.current.state.screen).toBe('making');
});
test('restores a generated set on reload', async () => {
  fetchMock.mockResolvedValue(response(quiz()));
  const first = await start(); first.unmount();
  const second = renderHook(() => useQuizEngine());
  expect(second.result.current.state.screen).toBe('intro');
  expect(second.result.current.bank.map(q => q.answer)).toEqual(['Semaphore', 'Cork']);
});
test('loads a shared quiz from its run link', async () => {
  window.history.replaceState({}, '', `/?run=${runId}`);
  fetchMock.mockResolvedValue(response({ ...quiz(), topic: 'Communication' }));
  const { result } = renderHook(() => useQuizEngine());
  await waitFor(() => expect(result.current.state.quizMode).toBe('shared'));
  expect(fetchMock).toHaveBeenCalledWith(`/api/quizzes/${runId}`, expect.objectContaining({ signal: expect.any(AbortSignal) }));
  expect(result.current.state.screen).toBe('intro');
});
test('random archive requests exclude already served question IDs', async () => {
  const questions = Array.from({ length: 10 }, (_, i) => ({ ...openQuestion(`Answer ${i}`), questionId: `11111111-1111-4111-8111-${String(i).padStart(12, '0')}`, topic: 'Test' }));
  fetchMock.mockImplementation(async () => response({ title: 'Archive', teaser: 'A mix', resetExclusions: false, questions }));
  const { result } = renderHook(() => useQuizEngine());
  act(() => { result.current.actions.randomQuiz(); });
  await waitFor(() => expect(result.current.state.screen).toBe('intro'));
  act(() => { result.current.actions.again(); });
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  expect(JSON.parse(fetchMock.mock.calls[1][1].body).excludeQuestionIds).toEqual(questions.map(q => q.questionId));
});
test('shares the stable run link through clipboard fallback', async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('navigator', { clipboard: { writeText } });
  fetchMock.mockResolvedValue(response(quiz()));
  const { result } = await start();
  await act(async () => { await result.current.actions.share(); });
  expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/?run=${runId}`);
  expect(result.current.state.shareStatus).toBe('Link copied');
});
// These assert desired behavior and must fail until request lifecycle fixes land.
// Vitest flags an unexpected pass, prompting removal of .fails when fixed.
test.fails('KNOWN BUG: navigating home prevents a late generation response from reopening the quiz', async () => {
  let resolve!: (value: Response) => void;
  fetchMock.mockReturnValue(new Promise<Response>(done => { resolve = done; }));
  const { result } = renderHook(() => useQuizEngine());
  act(() => { result.current.actions.startQuiz(); });
  act(() => { result.current.actions.goHome(); });
  await act(async () => { resolve(response(quiz())); });
  expect(result.current.state.screen).toBe('landing');
});

test.fails('KNOWN BUG: a newer generation wins when requests complete out of order', async () => {
  const pending: Array<(value: Response) => void> = [];
  fetchMock.mockImplementation(() => new Promise<Response>(resolve => pending.push(resolve)));
  const { result } = renderHook(() => useQuizEngine());
  act(() => { result.current.actions.startQuiz(); });
  act(() => { result.current.actions.startQuiz(); });
  await act(async () => { pending[1](response({ ...quiz(), teaser: 'New request' })); });
  await act(async () => { pending[0](response({ ...quiz(), teaser: 'Old request' })); });
  expect(result.current.state.teaser).toBe('New request');
});
test('aborts a shared-quiz request on unmount', () => {
  window.history.replaceState({}, '', `/?run=${runId}`);
  fetchMock.mockReturnValue(new Promise(() => {}));
  const hook = renderHook(() => useQuizEngine());
  const signal = fetchMock.mock.calls[0][1].signal as AbortSignal;
  expect(signal.aborted).toBe(false); hook.unmount(); expect(signal.aborted).toBe(true);
});
