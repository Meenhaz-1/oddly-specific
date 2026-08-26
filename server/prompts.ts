import { readFileSync } from 'node:fs';

function loadPrompt(filename: string): string {
  return readFileSync(new URL(`../prompts/${filename}`, import.meta.url), 'utf8').trim();
}

function render(template: string, variables: Record<string, string | number>): string {
  return Object.entries(variables).reduce(
    (rendered, [name, value]) => rendered.replaceAll(`{{${name}}}`, String(value)),
    template,
  );
}

const generatorTemplate = loadPrompt('generator.md');
const evaluatorTemplate = loadPrompt('evaluator.md');
const openEndedTask = loadPrompt('open-ended-task.md');
const canonicalGeneratorPrompt = `${generatorTemplate}\n\n${openEndedTask}`;

export interface CanonicalPromptDefinition {
  key: 'generator' | 'evaluator';
  template: string;
  sourcePaths: string[];
}

export function getCanonicalPromptDefinitions(): CanonicalPromptDefinition[] {
  return [
    {
      key: 'generator',
      template: canonicalGeneratorPrompt,
      sourcePaths: ['prompts/generator.md', 'prompts/open-ended-task.md'],
    },
    {
      key: 'evaluator',
      template: evaluatorTemplate,
      sourcePaths: ['prompts/evaluator.md'],
    },
  ];
}

export function buildGeneratorPrompt(topic: string, candidateCount: number): string {
  return render(canonicalGeneratorPrompt, { TOPIC: topic, N: candidateCount });
}

export function buildEvaluatorPrompt(candidateQuestions: string): string {
  return render(evaluatorTemplate, { CANDIDATE_QUESTIONS: candidateQuestions });
}
