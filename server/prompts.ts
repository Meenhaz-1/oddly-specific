import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

function loadPrompt(filename: string): string {
  return readFileSync(new URL(`../prompts/${filename}`, import.meta.url), 'utf8').trim();
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

export function getGeneratorInstructions(): string {
  return canonicalGeneratorPrompt;
}

export function buildGeneratorInput(topic: string, candidateCount: number, request: string): string {
  return [
    `Topic: ${topic}`,
    `Number of candidates: ${candidateCount}`,
    'Do not optimize for quantity. If a candidate is weak, replace it.',
    '',
    request,
  ].join('\n');
}

export function getEvaluatorInstructions(): string {
  return evaluatorTemplate;
}

export function buildEvaluatorInput(candidateQuestions: string, request: string): string {
  return [
    'Candidate questions:',
    candidateQuestions,
    '',
    request,
  ].join('\n');
}

export function getPromptCacheKey(key: 'generator' | 'evaluator'): string {
  const definition = getCanonicalPromptDefinitions().find((candidate) => candidate.key === key);
  if (!definition) throw new Error(`Missing canonical ${key} prompt.`);
  const version = createHash('sha256').update(definition.template, 'utf8').digest('hex').slice(0, 16);
  return `oddly-specific-${key}-${version}`;
}
