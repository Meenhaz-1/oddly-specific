import type { GeneratedQuestion, OpenEndedQuestion, ProgressiveCluesQuestion } from '../src/types.js';

export type PlayerCopyIssueCode =
  | 'answer_leak'
  | 'clue_too_long'
  | 'duplicate_answer'
  | 'duplicate_clue'
  | 'invalid_clue_count'
  | 'url_or_markdown_link';

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

function containsExactAnswer(answerText: string, stemParts: string[]): boolean {
  const answer = normalizeForExactMatch(answerText);
  if (answer.length < 3) return false;

  const stem = normalizeForExactMatch(stemParts.join(' '));
  return ` ${stem} `.includes(` ${answer} `);
}

function wordCount(value: string): number {
  return value.trim().split(/\s+/u).filter(Boolean).length;
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
  if (containsExactAnswer(question.answer.short, [question.context, question.prompt])) {
    issues.push({ code: 'answer_leak', field: 'context_or_prompt' });
  }
  return issues;
}

export function validateProgressiveCluesQuestion(question: ProgressiveCluesQuestion): PlayerCopyIssue[] {
  const issues: PlayerCopyIssue[] = [];
  const fields = [
    ['prompt', question.prompt],
    ...question.clues.map((clue, index) => [`clues.${index}`, clue] as const),
    ['answer.short', question.answer.short],
    ['answer.explanation', question.answer.explanation],
  ] as const;

  if (question.clues.length !== 3) issues.push({ code: 'invalid_clue_count', field: 'clues' });
  for (const [field, value] of fields) {
    if (URL_OR_MARKDOWN_LINK.test(value)) issues.push({ code: 'url_or_markdown_link', field });
  }

  const seenClues = new Set<string>();
  for (const [index, clue] of question.clues.entries()) {
    if (wordCount(clue) > 24) issues.push({ code: 'clue_too_long', field: `clues.${index}` });
    const clueKey = normalizeForExactMatch(clue);
    if (clueKey && seenClues.has(clueKey)) issues.push({ code: 'duplicate_clue', field: `clues.${index}` });
    seenClues.add(clueKey);
  }

  if (containsExactAnswer(question.answer.short, [question.prompt, ...question.clues])) {
    issues.push({ code: 'answer_leak', field: 'prompt_or_clues' });
  }
  return issues;
}

export function validateGeneratedQuestion(question: GeneratedQuestion): PlayerCopyIssue[] {
  return question.format === 'progressive_clues'
    ? validateProgressiveCluesQuestion(question)
    : validatePlayerFacingQuestion(question);
}

interface GeneratedQuizLike {
  title: string;
  teaser: string;
  questions: GeneratedQuestion[];
}

export function validateGeneratedQuiz(quiz: GeneratedQuizLike): PlayerCopyIssue[] {
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
    for (const issue of validateGeneratedQuestion(question)) {
      issues.push({ ...issue, field: `${question.id}.${issue.field}` });
    }
  }
  return issues;
}

export function deduplicateQuestionsByShortAnswer<Question extends GeneratedQuestion>(questions: Question[]): Question[] {
  const seenAnswers = new Set<string>();
  return questions.filter((question) => {
    const answerKey = normalizeForExactMatch(question.answer.short);
    if (!answerKey || seenAnswers.has(answerKey)) return false;
    seenAnswers.add(answerKey);
    return true;
  });
}

export interface EvaluationRewrite {
  applied: boolean;
  context: string;
  prompt: string;
  clues: string[];
  answerShort: string;
  answerExplanation: string;
}

export function applyEvaluationRewrite<Question extends GeneratedQuestion>(
  question: Question,
  rewrite: EvaluationRewrite,
): Question {
  if (!rewrite.applied) return question;
  if (question.format === 'progressive_clues') {
    return {
      ...question,
      prompt: rewrite.prompt,
      clues: rewrite.clues,
      answer: {
        short: rewrite.answerShort,
        explanation: rewrite.answerExplanation,
      },
    } as Question;
  }
  return {
    ...question,
    context: rewrite.context,
    prompt: rewrite.prompt,
    answer: {
      short: rewrite.answerShort,
      explanation: rewrite.answerExplanation,
    },
  } as Question;
}
