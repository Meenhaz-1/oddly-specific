import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

function loadLocalSupabaseEnvironment(): void {
  if (process.env.SUPABASE_TEST_URL && process.env.SUPABASE_TEST_SECRET_KEY) {
    process.env.SUPABASE_URL = process.env.SUPABASE_TEST_URL;
    process.env.SUPABASE_SECRET_KEY = process.env.SUPABASE_TEST_SECRET_KEY;
    return;
  }
  const executable = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const output = execFileSync(executable, ['supabase', 'status', '-o', 'env'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const values = new Map<string, string>();
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^([A-Z_]+)="?(.*?)"?$/);
    if (match) values.set(match[1]!, match[2]!.replace(/"$/, ''));
  }
  process.env.SUPABASE_URL = values.get('API_URL');
  process.env.SUPABASE_SECRET_KEY = values.get('SERVICE_ROLE_KEY') || values.get('SECRET_KEY');
}

async function main(): Promise<void> {
  loadLocalSupabaseEnvironment();
  assert.ok(process.env.SUPABASE_URL, 'Local Supabase API URL was not found. Run `npx supabase start`.');
  assert.ok(process.env.SUPABASE_SECRET_KEY, 'Local Supabase service-role key was not found.');
  const apiUrl = new URL(process.env.SUPABASE_URL);
  assert.ok(
    ['127.0.0.1', 'localhost'].includes(apiUrl.hostname),
    `Refusing to run destructive integration checks against non-local host ${apiUrl.hostname}.`,
  );

  const { fetchTopicArchiveQuestions, getQuizPlayCount, recordQuizPlay } = await import('../server/persistence.js');
  const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const compositionContract = await client
    .from('quiz_run_question_sets')
    .select('quiz_run_id', { head: true, count: 'exact' });
  assert.equal(compositionContract.error, null, `Composition table contract failed: ${compositionContract.error?.message}`);

  // An empty result is expected. The assertion is that PostgREST can resolve the
  // explicitly named questions -> quiz_runs relationship without PGRST201.
  const topicQuestions = await fetchTopicArchiveQuestions('__integration_empty_topic__', 3);
  assert.deepEqual(topicQuestions, []);

  const before = await getQuizPlayCount();
  const eventId = randomUUID();
  const afterFirstWrite = await recordQuizPlay({
    id: eventId,
    topic: 'Integration test',
    mode: 'generated',
    runId: null,
  });
  const afterDuplicateWrite = await recordQuizPlay({
    id: eventId,
    topic: 'Integration test',
    mode: 'generated',
    runId: null,
  });
  assert.equal(afterFirstWrite, before + 1, 'A new play must increment the count exactly once.');
  assert.equal(afterDuplicateWrite, afterFirstWrite, 'Retrying the same play ID must not double-count.');

  console.log('Supabase integration contracts passed.');
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
