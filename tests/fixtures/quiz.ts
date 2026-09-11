import type { GeneratedQuiz, OpenEndedQuestion, ProgressiveCluesQuestion } from '../../src/types';

export const runId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const source = { id: 's01a', title: 'Fixture evidence', publisher: 'Test archive', url: 'https://example.com/evidence' };
export function openQuestion(answer = 'Semaphore', id = 'q01'): OpenEndedQuestion {
  return { id, questionId: '11111111-1111-4111-8111-111111111111', position: 1, label: 'OPEN', format: 'open_ended',
    context: 'Distant towers relayed changing arm positions before electrical networks existed.',
    prompt: 'Which communication system connected the towers?',
    answer: { short: answer, explanation: 'Operators relayed visible positions between stations to carry messages.' }, sources: [source] };
}
export function progressiveQuestion(): ProgressiveCluesQuestion {
  return { id: 'q02', questionId: '22222222-2222-4222-8222-222222222222', position: 2, label: '3 CLUES', format: 'progressive_clues',
    prompt: 'Which material connects these observations?', clues: ['It comes from the outer layer of a tree.', 'Its enclosed cells resist the passage of liquid.', 'It can expand again after being compressed into a narrow neck.'],
    answer: { short: 'Cork', explanation: 'Its cellular structure makes a compressible seal for containers.' }, sources: [source] };
}
export function quiz(): GeneratedQuiz & { runId: string } {
  return { runId, title: 'Two discoveries', teaser: 'Look closely at the evidence.', questions: [openQuestion(), progressiveQuestion()] };
}
export function generation() {
  return { title: quiz().title, teaser: quiz().teaser, openEndedQuestion: openQuestion(), progressiveCluesQuestion: progressiveQuestion(),
    openEndedResearch: { candidateId: 'q01', claims: [{ supportType: 'direct' }], riskFlags: [], conflictsFound: false,
      blueprint: { playerAction: 'connect', evidenceForm: 'paired_observations', relationship: 'shared_link', answerContract: 'relationship' } },
    progressiveCluesResearch: { candidateId: 'q02', claims: [{ supportType: 'direct' }], riskFlags: [], conflictsFound: false,
      blueprint: { playerAction: 'identify', evidenceForm: 'timeline', relationship: 'chronology', answerContract: 'single_entity' } } };
}
export function evaluation() {
  return { evaluations: ['q01', 'q02'].map(candidateId => ({ candidateId, decision: 'ACCEPT', overall: 4.5,
    scores: { solvability: 4.5, revealQuality: 4.5, clueDiscipline: 4.5, originality: 4.5, answerPrecision: 4.5, wordingEfficiency: 4.5 },
    factualConfidence: 'High', clueLeakageIssues: [], alternativeAnswers: [], decisionRationale: 'Supported and fair.',
    verification: { mode: 'generator_research', evidenceStatus: 'complete', independentSearchRequired: false },
    rewrite: { applied: false, context: '', prompt: '', clues: [], answerShort: '', answerExplanation: '', score: 0 } })) };
}
export const modelResponse = (value: unknown) => ({ id: 'response-fixture', output_text: JSON.stringify(value), output: [], usage: { input_tokens: 100, output_tokens: 50, total_tokens: 150 } });
