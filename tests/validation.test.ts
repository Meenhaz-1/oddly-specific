import { expect, test } from 'vitest';
import { applyEvaluationRewrite, deduplicateQuestionsByShortAnswer, validateGeneratedQuiz, validateProgressiveCluesQuestion } from '../server/question-validation';
import { openQuestion, progressiveQuestion, quiz } from './fixtures/quiz';
test('detects normalized duplicate answers across formats', () => {
  const value = quiz(); value.questions[1].answer.short = '  SEMAPHORE!! ';
  expect(validateGeneratedQuiz(value)).toContainEqual({ code: 'duplicate_answer', field: 'q02.answer.short' });
});
test('archive deduplication preserves the first question and does not mutate the input', () => {
  const input = [openQuestion(), openQuestion('SEMAPHORE!'), openQuestion('Cork')];
  expect(deduplicateQuestionsByShortAnswer(input).map(q => q.answer.short)).toEqual(['Semaphore', 'Cork']);
  expect(input).toHaveLength(3);
});
test('rejects links in player-facing explanations', () => {
  const value = quiz(); value.questions[0].answer.explanation = 'Read https://example.com';
  expect(validateGeneratedQuiz(value)).toContainEqual({ code: 'url_or_markdown_link', field: 'q01.answer.explanation' });
});
test('checks progressive clue length and duplication', () => {
  const q = progressiveQuestion(); q.clues = ['word '.repeat(25), 'The same observation.', 'The same observation.'];
  const codes = validateProgressiveCluesQuestion(q).map(issue => issue.code);
  expect(codes).toContain('clue_too_long'); expect(codes).toContain('duplicate_clue');
});
test('applies a progressive rewrite without changing its identity or evidence', () => {
  const q = progressiveQuestion();
  const rewrite = { applied: true, context: '', prompt: 'A revised ask?', clues: ['First revised clue.', 'Second revised clue.', 'Third revised clue.'], answerShort: 'New answer', answerExplanation: 'New explanation' };
  const updated = applyEvaluationRewrite(q, rewrite);
  expect(updated).toMatchObject({ id: q.id, questionId: q.questionId, sources: q.sources, prompt: rewrite.prompt, clues: rewrite.clues });
  expect(q.answer.short).toBe('Cork');
});
