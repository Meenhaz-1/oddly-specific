interface Question {
  id: string;
  label: string;
  context: string;
  prompt: string;
  answer: { short: string; explanation: string };
  sources: Array<{ title: string; publisher: string; url: string }>;
}

interface Evaluation {
  candidateId: string;
  decision: 'ACCEPT' | 'REWRITE' | 'REJECT';
  overall: number;
  factualConfidence: string;
  decisionRationale: string;
}

interface PipelineResult {
  topic: string;
  models: { generator: string; evaluator: string };
  candidates: Question[];
  evaluations: Evaluation[];
  finalist: Question | null;
}

interface StreamEvent {
  type: 'log' | 'heartbeat' | 'result' | 'error';
  elapsedSeconds?: number;
  message?: string;
  data?: PipelineResult;
  error?: string;
}

const rawArgs = process.argv.slice(2);
const possibleCount = Number(rawArgs.at(-1));
const hasCount = Number.isInteger(possibleCount) && possibleCount >= 4 && possibleCount <= 10;
const candidateCount = hasCount ? possibleCount : 6;
const topic = (hasCount ? rawArgs.slice(0, -1) : rawArgs).join(' ').trim();

if (!topic) {
  console.error('Usage: npm run generate -- "Your topic" [candidate count: 4-10]');
  console.error('Example: npm run generate -- "Calcutta" 6');
  process.exit(1);
}

const baseEndpoint = process.env.QUIZ_API_URL || 'http://127.0.0.1:5173/api/pipeline-test';
const endpoint = `${baseEndpoint}${baseEndpoint.includes('?') ? '&' : '?'}stream=1`;
const startedAt = Date.now();

try {
  console.log(`Topic: ${topic}`);
  console.log(`Requesting ${candidateCount} researched candidates from ${baseEndpoint}\n`);

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ topic, candidateCount }),
  });

  if (!response.ok) {
    const errorBody = (await response.json()) as { error?: string };
    throw new Error(errorBody.error || `Request failed with HTTP ${response.status}`);
  }
  if (!response.body) throw new Error('The server returned no response stream.');

  let body: PipelineResult | undefined;
  let buffer = '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  const handleLine = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line) as StreamEvent;
    const seconds = event.elapsedSeconds ?? Math.round((Date.now() - startedAt) / 1000);
    const elapsed = String(seconds).padStart(3, ' ');
    if (event.type === 'log') console.log(`[+${elapsed}s] ${event.message}`);
    if (event.type === 'heartbeat') console.log(`[+${elapsed}s] Still working...`);
    if (event.type === 'result') body = event.data;
    if (event.type === 'error') throw new Error(event.error || 'Pipeline failed.');
  };

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) handleLine(line);
    if (done) break;
  }
  if (buffer.trim()) handleLine(buffer);
  if (!body) throw new Error('The pipeline ended without returning results.');

  console.log(`\nCompleted in ${Math.round((Date.now() - startedAt) / 1000)}s.`);
  console.log(`Models: generator=${body.models.generator}, evaluator=${body.models.evaluator}\n`);

  const evaluations = new Map(body.evaluations.map((evaluation) => [evaluation.candidateId, evaluation]));
  for (const [index, question] of body.candidates.entries()) {
    const evaluation = evaluations.get(question.id);
    console.log(`${index + 1}. [${evaluation?.decision ?? 'NOT EVALUATED'} | ${evaluation?.overall ?? '-'}] ${question.label}`);
    console.log(question.context);
    console.log(`Question: ${question.prompt}`);
    console.log(`Answer: ${question.answer.short}`);
    console.log(`Why: ${question.answer.explanation}`);
    if (evaluation) console.log(`Editor: ${evaluation.decisionRationale}`);
    console.log(`Sources: ${question.sources.map((source) => `${source.publisher} - ${source.url}`).join('\n         ')}`);
    console.log('');
  }

  if (body.finalist) {
    console.log('FINALIST');
    console.log(body.finalist.context);
    console.log(`Question: ${body.finalist.prompt}`);
    console.log(`Answer: ${body.finalist.answer.short}`);
    console.log(`Reveal: ${body.finalist.answer.explanation}`);
  } else {
    console.log('NO FINALIST: No candidate cleared the shipping bar.');
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Generation failed: ${message}`);
  console.error('Make sure the server is running in another terminal with: npm run dev');
  process.exitCode = 1;
}
