import type { QuestionBlueprint } from './question-schemas.js';

export const BLUEPRINT_AXES = ['playerAction', 'evidenceForm', 'relationship', 'answerContract'] as const;

export function countBlueprintDifferences(left: QuestionBlueprint, right: QuestionBlueprint): number {
  return BLUEPRINT_AXES.filter((axis) => left[axis] !== right[axis]).length;
}

export function validateBlueprintPair(left: QuestionBlueprint, right: QuestionBlueprint): string[] {
  const issues: string[] = [];
  const differences = countBlueprintDifferences(left, right);

  if (differences < 3) {
    issues.push(`The question pair differs on only ${differences} blueprint axes; at least 3 are required.`);
  }

  const repeatedWeakRoute =
    left.relationship === right.relationship &&
    (left.relationship === 'cultural_transfer' || left.relationship === 'mechanism');
  if (repeatedWeakRoute) {
    issues.push('The pair repeats the same high-risk construction route.');
  }

  return issues;
}
