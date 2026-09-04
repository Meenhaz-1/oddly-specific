import assert from 'node:assert/strict';
import test from 'node:test';
import { googleSheetCsvUrl, parseCsv, parseQuestionSheet } from './sheet-import.js';

const HEADER = [
  'topic', 'label', 'context', 'prompt', 'answer_short', 'answer_explanation',
  'source_1_title', 'source_1_publisher', 'source_1_url',
].join(',');

test('parses quoted commas and escaped quotes', () => {
  assert.deepEqual(parseCsv('a,"b, c","say ""hello"""\n1,2,3'), [
    ['a', 'b, c', 'say "hello"'],
    ['1', '2', '3'],
  ]);
});

test('maps a valid sheet row into an open-ended question', () => {
  const questions = parseQuestionSheet([
    HEADER,
    'Cinema,Origins,"Context, with a comma",What is it?,The answer,Why it matters,Primary source,Archive,https://example.com/source',
  ].join('\n'));

  assert.equal(questions.length, 1);
  assert.equal(questions[0]?.topic, 'Cinema');
  assert.equal(questions[0]?.context, 'Context, with a comma');
  assert.equal(questions[0]?.sources.length, 1);
});

test('rejects missing columns and invalid source URLs', () => {
  assert.throws(() => parseQuestionSheet('topic,label\nCinema,Origins'), /Missing required columns/);
  assert.throws(
    () => parseQuestionSheet([
      HEADER,
      'Cinema,Origins,Context,Prompt,Answer,Explanation,Source,Archive,not-a-url',
    ].join('\n')),
    /valid URL/,
  );
});

test('only accepts canonical Google Sheets hosts and preserves gid', () => {
  const result = googleSheetCsvUrl('https://docs.google.com/spreadsheets/d/abc_123/edit#gid=42');
  assert.equal(result.csvUrl, 'https://docs.google.com/spreadsheets/d/abc_123/export?format=csv&gid=42');
  assert.throws(() => googleSheetCsvUrl('https://example.com/spreadsheets/d/abc/edit'), /Only .* Google Sheets/);
});
