import type { GeneratedQuiz, OpenEndedQuestion } from '../src/types.js';

export type PlayerCopyIssueCode = 'answer_leak' | 'duplicate_answer' | 'url_or_markdown_link';

export interface PlayerCopyIssue {
  code: PlayerCopyIssueCode;
  field: string;
}

const URL_OR_MARKDOWN_LINK = /(?:https?:\/\/|www\.|\[[^\]]+\]\s*\(|\b(?:[a-z0-9-]+\.)+(?:com|org|net|gov|edu|mil|io|co|in|uk)\b)/iu;

function normalizeForExactMatch(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('en-US')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function hasExactAnswerLeak(question: OpenEndedQuestion): boolean {
  const answer = normalizeForExactMatch(question.answer.short);
  if (answer.length < 3) return false;

  const stem = normalizeForExactMatch(`${question.context} ${question.prompt}`);
  return ` ${stem} `.includes(` ${answer} `);
}

export function validatePlayerFacingQuestion(question: OpenEndedQuestion): PlayerCopyIssue[] {
  const issues: PlayerCopyIssue[] = [];
  const fields = [
    ['context', question.context],
    ['prompt', question.prompt],
    ['answer.short', question.answer.short],
    ['answer.explanation', question.answer.explanation],
  ] as const;

  for (const [field, value] of fields) {
    if (URL_OR_MARKDOWN_LINK.test(value)) issues.push({ code: 'url_or_markdown_link', field });
  }
  if (hasExactAnswerLeak(question)) issues.push({ code: 'answer_leak', field: 'context_or_prompt' });
  return issues;
}

export function validateGeneratedQuiz(quiz: GeneratedQuiz): PlayerCopyIssue[] {
  const issues: PlayerCopyIssue[] = [];
  const seenAnswers = new Set<string>();
  if (URL_OR_MARKDOWN_LINK.test(quiz.title)) issues.push({ code: 'url_or_markdown_link', field: 'title' });
  if (URL_OR_MARKDOWN_LINK.test(quiz.teaser)) issues.push({ code: 'url_or_markdown_link', field: 'teaser' });
  for (const question of quiz.questions) {
    const answerKey = normalizeForExactMatch(question.answer.short);
    if (answerKey && seenAnswers.has(answerKey)) {
      issues.push({ code: 'duplicate_answer', field: `${question.id}.answer.short` });
    }
    seenAnswers.add(answerKey);
    for (const issue of validatePlayerFacingQuestion(question)) {
      issues.push({ ...issue, field: `${question.id}.${issue.field}` });
    }
  }
  return issues;
}

export function deduplicateQuestionsByShortAnswer(questions: OpenEndedQuestion[]): OpenEndedQuestion[] {
  const seenAnswers = new Set<string>();
  return questions.filter((question) => {
    const answerKey = normalizeForExactMatch(question.answer.short);
    if (!answerKey || seenAnswers.has(answerKey)) return false;
    seenAnswers.add(answerKey);
    return true;
  });
}

export function applyEvaluationRewrite(
  question: OpenEndedQuestion,
  rewrite: {
    applied: boolean;
    context: string;
    prompt: string;
    answerShort: string;
    answerExplanation: string;
  },
): OpenEndedQuestion {
  if (!rewrite.applied) return question;
  return {
    ...question,
    context: rewrite.context,
    prompt: rewrite.prompt,
    answer: {
      short: rewrite.answerShort,
      explanation: rewrite.answerExplanation,
    },
  };
}
