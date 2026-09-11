import { expect, test } from '@playwright/test';
import { openQuestion, quiz, runId } from '../fixtures/quiz';

test.beforeEach(async ({ page }) => {
  // Deny all unexpected external requests: these journeys cannot call a real model or database.
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== 'http://127.0.0.1:4174') return route.abort();
    if (url.pathname === '/api/play-count' || url.pathname === '/api/quiz-plays') return route.fulfill({ json: { count: 1 } });
    if (url.pathname.startsWith('/api/')) return route.fulfill({ status: 500, json: { error: 'Unexpected test API request' } });
    return route.continue();
  });
});
test('generate, play both formats, finish, and restore after reload', async ({ page }) => {
  await page.route('**/api/generate', route => route.fulfill({ json: quiz() }));
  await page.goto('/');
  await page.getByLabel('OR TYPE ANY TOPIC').fill('Communication');
  await page.getByRole('button', { name: 'Make my quiz' }).click();
  await expect(page.getByText('YOUR SET IS READY')).toBeVisible();
  await page.getByRole('button', { name: 'Start quiz' }).click();
  await expect(page.getByText('Which communication system connected the towers?')).toBeVisible();
  await page.getByRole('button', { name: 'Reveal answer' }).click();
  await expect(page.locator('.hand-answer')).toHaveText('Semaphore');
  await page.getByRole('button', { name: 'Next question' }).click();
  await expect(page.getByText('Which material connects these observations?')).toBeVisible();
  await expect(page.locator('.quiz__clue')).toHaveCount(1);
  await page.getByRole('button', { name: 'Pull the next clue' }).click();
  await expect(page.locator('.quiz__clue')).toHaveCount(2);
  await page.getByRole('button', { name: 'Pull the next clue' }).click();
  await expect(page.locator('.quiz__clue')).toHaveCount(3);
  await page.getByRole('button', { name: 'Reveal answer' }).click();
  await expect(page.locator('.hand-answer')).toHaveText('Cork');
  await page.getByRole('button', { name: 'Next question' }).click();
  await expect(page.getByRole('heading', { name: 'You finished 2 Questions on Communication.' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'You finished 2 Questions on Communication.' })).toBeVisible();
});
test('generation failure is visible and retry recovers', async ({ page }) => {
  let attempts = 0;
  await page.route('**/api/generate', route => ++attempts === 1
    ? route.fulfill({ status: 502, json: { error: 'Temporary test failure' } }) : route.fulfill({ json: quiz() }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Make my quiz' }).click();
  await expect(page.getByText('Temporary test failure')).toBeVisible();
  await page.getByRole('button', { name: /try again/i }).click();
  await expect(page.getByText('YOUR SET IS READY')).toBeVisible();
});
test('shared link opens the saved questions', async ({ page }) => {
  await page.route('**/api/quizzes/*', route => route.fulfill({ json: { ...quiz(), topic: 'Communication' } }));
  await page.goto(`/?run=${runId}`);
  await expect(page.getByText('YOUR SET IS READY')).toBeVisible();
  await page.getByRole('button', { name: 'Start quiz' }).click();
  await expect(page.getByText('Which communication system connected the towers?')).toBeVisible();
});

test('archive journey supplies ten questions and excludes them on the next draw', async ({ page }) => {
  const questions = Array.from({ length: 10 }, (_, index) => ({ ...openQuestion(`Answer ${index}`), topic: 'Communication', questionId: `11111111-1111-4111-8111-${String(index).padStart(12, '0')}` }));
  const draws: Array<{ excludeQuestionIds: string[] }> = [];
  await page.route('**/api/random-quiz', route => {
    draws.push(route.request().postDataJSON());
    return route.fulfill({ json: { title: 'Archive', teaser: 'A varied set', questions, resetExclusions: false } });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Surprise me with 10 questions' }).click();
  await expect(page.getByRole('heading', { name: '10 Questions from the Archive' })).toBeVisible();
  await page.getByRole('button', { name: 'Start quiz' }).click();
  for (let index = 0; index < 10; index++) {
    await page.getByRole('button', { name: 'Reveal answer' }).click();
    await expect(page.locator('.hand-answer')).toHaveText(`Answer ${index}`);
    await page.getByRole('button', { name: 'Next question' }).click();
  }
  await page.getByRole('button', { name: 'Pick 10 more' }).click();
  await expect(page.getByText('YOUR SET IS READY')).toBeVisible();
  expect(draws[1].excludeQuestionIds).toEqual(questions.map(q => q.questionId));
});
