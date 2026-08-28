import { useCallback, useEffect, useRef, useState } from 'react';
import { QUESTION_BANK } from '../data/questions';
import type { GeneratedQuiz, OpenEndedQuestion, QuizActions, QuizQuestion, QuizState, RandomQuizResponse, SeenState } from '../types';

// Reveal-curtain animation duration (ms). Matches the design's default.
export const REVEAL_MS = 620;
export const GENERATED_QUESTION_COUNT = 2;
export const RANDOM_QUESTION_COUNT = 10;
/** Pacing estimate for the assembling screen. Not a timeout: the request
 * resolves when it resolves; this only shapes the progress curve. */
export const EXPECTED_GENERATION_MS = 45_000;
const STORAGE_KEY = 'oddly-specific-progress-v1';
const FEEDBACK_SESSION_KEY = 'oddly-specific-feedback-session-v1';
const RANDOM_SEEN_SESSION_KEY = 'oddly-specific-random-seen-v1';
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const initialState: QuizState = {
  screen: 'landing', // 'landing' | 'making' | 'intro' | 'quiz' | 'done'
  quizMode: 'generated',
  menu: false,
  topic: 'Indian sport',
  other: '',
  sample: 0, // 0 closed, 1 mounted/clipped, 2 open
  sampleRoll: false,
  qi: 0,
  stage: 0, // 0 unrevealed, 1 mounted/clipped, 2 open
  roll: false,
  sourcesOpen: false,
  clueCount: 1,
  pick: null,
  vote: null,
  votes: {},
  viewer: null, // 'sample' | 'question' | null
  slide: 0, // -1 leaving left, 0 settled, 1 entering from right
  seen: {},
  shareStatus: '',
  questions: null,
  teaser: '',
  generationError: '',
  randomLoading: false,
  randomError: '',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isOpenEndedQuestion(value: unknown): value is OpenEndedQuestion {
  if (!isRecord(value)) return false;
  return (
    typeof value.questionId === 'string' &&
    typeof value.id === 'string' &&
    typeof value.position === 'number' &&
    typeof value.label === 'string' &&
    value.format === 'open_ended' &&
    typeof value.context === 'string' &&
    typeof value.prompt === 'string' &&
    isRecord(value.answer) &&
    typeof value.answer.short === 'string' &&
    typeof value.answer.explanation === 'string' &&
    Array.isArray(value.sources) &&
    value.sources.length > 0 &&
    value.sources.every(
      (source) =>
        isRecord(source) &&
        typeof source.id === 'string' &&
        typeof source.title === 'string' &&
        typeof source.publisher === 'string' &&
        typeof source.url === 'string',
    )
  );
}

function isGeneratedQuiz(value: unknown): value is GeneratedQuiz {
  return (
    isRecord(value) &&
    typeof value.runId === 'string' &&
    typeof value.title === 'string' &&
    typeof value.teaser === 'string' &&
    Array.isArray(value.questions) &&
    value.questions.length === GENERATED_QUESTION_COUNT &&
    value.questions.every(isOpenEndedQuestion)
  );
}

function isRandomQuizResponse(value: unknown): value is RandomQuizResponse {
  return (
    isRecord(value) &&
    typeof value.title === 'string' &&
    typeof value.teaser === 'string' &&
    typeof value.resetExclusions === 'boolean' &&
    Array.isArray(value.questions) &&
    value.questions.length >= 1 &&
    value.questions.length <= RANDOM_QUESTION_COUNT &&
    value.questions.every((question) => isOpenEndedQuestion(question) && typeof question.topic === 'string')
  );
}

function toQuizQuestions(questions: OpenEndedQuestion[]): QuizQuestion[] {
  return questions.map((generated) => ({
    questionId: generated.questionId,
    label: generated.label,
    kind: 'text',
    setup: generated.context,
    ask: generated.prompt,
    answer: generated.answer.short,
    explain: generated.answer.explanation,
    sources: generated.sources.map((source) => ({
      title: source.title,
      meta: source.publisher,
      url: source.url,
    })),
  }));
}

function getRandomSeenIds(): string[] {
  try {
    const parsed: unknown = JSON.parse(window.sessionStorage.getItem(RANDOM_SEEN_SESSION_KEY) || '[]');
    return Array.isArray(parsed)
      ? [...new Set(parsed.filter((value): value is string => typeof value === 'string' && uuidPattern.test(value)))].slice(-500)
      : [];
  } catch {
    return [];
  }
}

function getFeedbackSessionId(): string {
  const existing = window.localStorage.getItem(FEEDBACK_SESSION_KEY);
  if (existing) return existing;
  const sessionId = window.crypto.randomUUID();
  window.localStorage.setItem(FEEDBACK_SESSION_KEY, sessionId);
  return sessionId;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Quiz generation failed. Please try again.';
}

function getInitialState(): QuizState {
  if (typeof window === 'undefined') return initialState;
  const params = new URLSearchParams(window.location.search);

  if (params.get('quiz') === 'editorial-demo') {
    return { ...initialState, screen: 'intro', topic: params.get('topic') || initialState.topic };
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialState;
    const saved = JSON.parse(raw) as Partial<QuizState>;
    if (!saved.screen || !['intro', 'quiz', 'done'].includes(saved.screen)) return initialState;
    return { ...initialState, ...saved, roll: false, slide: 0, viewer: null };
  } catch {
    return initialState;
  }
}

/**
 * Ports the original design's `DCLogic` component state machine to a
 * plain React hook: same states, same timings, same transitions.
 *
 * IMPORTANT: side effects (setTimeout, scrollTo) must never live inside
 * a setState *updater function* — React (StrictMode, dev) invokes those
 * twice to check purity, which would double-fire timers/scroll. Side
 * effects only ever run in plain event handlers or setTimeout callbacks
 * below; anything passed to `patch` as a function is a pure reducer.
 */
export function useQuizEngine() {
  const [state, setState] = useState(getInitialState);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  useEffect(() => {
    if (!['intro', 'quiz', 'done'].includes(state.screen)) return;
    const { viewer: _viewer, roll: _roll, slide: _slide, shareStatus: _shareStatus, ...persisted } = state;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
  }, [state]);

  const after = useCallback((ms: number, fn: () => void) => {
    const id = setTimeout(fn, ms);
    timers.current.push(id);
  }, []);

  const nextFrame = useCallback((fn: () => void) => {
    requestAnimationFrame(() => requestAnimationFrame(fn));
  }, []);

  const patch = useCallback((fields: Partial<QuizState> | ((state: QuizState) => Partial<QuizState>)) => {
    setState((s) => ({ ...s, ...(typeof fields === 'function' ? fields(s) : fields) }));
  }, []);

  const bank = state.questions?.length ? state.questions : QUESTION_BANK;
  const question = bank[state.qi]!;

  const openRoll = (kind: 'sample' | 'answer') => {
    if (kind === 'sample') {
      patch({ sample: 1, sampleRoll: true });
      nextFrame(() => patch({ sample: 2 }));
      after(REVEAL_MS + 120, () => patch({ sampleRoll: false }));
    } else {
      patch({ stage: 1, roll: true });
      nextFrame(() => patch({ stage: 2 }));
      after(REVEAL_MS + 120, () => patch({ roll: false }));
    }
  };

  const begin = async (topic: string): Promise<void> => {
    patch({
      screen: 'making',
      quizMode: 'generated',
      menu: false,
      topic,
      qi: 0,
      stage: 0,
      roll: false,
      sourcesOpen: false,
      clueCount: 1,
      pick: null,
      vote: null,
      votes: {},
      seen: {},
      questions: null,
      teaser: '',
      generationError: '',
      randomLoading: false,
      randomError: '',
    });
    try {
      const apiResponse = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, count: GENERATED_QUESTION_COUNT }),
      });
      const result: unknown = await apiResponse.json();
      if (!apiResponse.ok) {
        const apiError = isRecord(result) && typeof result.error === 'string' ? result.error : 'Quiz generation failed.';
        throw new Error(apiError);
      }
      if (!isGeneratedQuiz(result)) throw new Error('The generated set was incomplete or malformed.');
      const questions = toQuizQuestions(result.questions);
      patch({ questions, teaser: result.teaser, screen: 'intro' });
      window.scrollTo(0, 0);
    } catch (error) {
      patch({ generationError: errorMessage(error) });
    }
  };

  const beginRandom = async (): Promise<void> => {
    const excludedIds = getRandomSeenIds();
    patch({ screen: 'landing', menu: false, randomLoading: true, randomError: '', shareStatus: '' });
    window.scrollTo(0, 0);
    try {
      const apiResponse = await fetch('/api/random-quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: RANDOM_QUESTION_COUNT, excludeQuestionIds: excludedIds }),
      });
      const result: unknown = await apiResponse.json().catch(() => null);
      if (!apiResponse.ok) {
        const apiError = isRecord(result) && typeof result.error === 'string'
          ? result.error
          : 'Could not pick questions from the archive.';
        throw new Error(apiError);
      }
      if (!isRandomQuizResponse(result)) throw new Error('The archive returned an incomplete or malformed quiz.');

      const servedIds = result.questions.map((item) => item.questionId!);
      const nextSeenIds = result.resetExclusions ? servedIds : [...new Set([...excludedIds, ...servedIds])];
      window.sessionStorage.setItem(RANDOM_SEEN_SESSION_KEY, JSON.stringify(nextSeenIds.slice(-500)));
      patch({
        screen: 'intro',
        quizMode: 'random',
        topic: 'The Archive',
        qi: 0,
        stage: 0,
        roll: false,
        sourcesOpen: false,
        clueCount: 1,
        pick: null,
        vote: null,
        votes: {},
        seen: {},
        questions: toQuizQuestions(result.questions),
        teaser: result.teaser,
        generationError: '',
        randomLoading: false,
        randomError: '',
      });
      window.scrollTo(0, 0);
    } catch (error) {
      patch({ screen: 'landing', randomLoading: false, randomError: errorMessage(error) });
    }
  };

  const advance = () => {
    const seen: Record<number, SeenState> = { ...state.seen, [state.qi]: state.stage >= 1 ? 'revealed' : 'skipped' };
    if (state.qi >= bank.length - 1) {
      patch({ seen, screen: 'done' });
      window.scrollTo(0, 0);
      return;
    }
    patch({ seen, slide: -1 });
    after(210, () => {
      setState((p) => ({
        ...p,
        qi: p.qi + 1,
        stage: 0 as const,
        roll: false,
        sourcesOpen: false,
        clueCount: 1,
        pick: null,
        vote: bank[p.qi + 1]?.questionId ? p.votes[bank[p.qi + 1]!.questionId!] ?? null : null,
        slide: 1 as const,
      }));
      window.scrollTo(0, 0);
      nextFrame(() => patch({ slide: 0 }));
    });
  };

  const back = () => {
    if (state.qi === 0) {
      patch({ screen: 'landing' });
      return;
    }
    patch({ slide: 1 });
    patch((p) => ({
      qi: p.qi - 1,
      stage: 0,
      roll: false,
      sourcesOpen: false,
      clueCount: 1,
      pick: null,
      vote: bank[p.qi - 1]?.questionId ? p.votes[bank[p.qi - 1]!.questionId!] ?? null : null,
    }));
    nextFrame(() => patch({ slide: 0 }));
  };

  const submitFeedback = (rating: 'up' | 'down') => {
    const questionId = question.questionId;
    patch((current) => ({
      vote: rating,
      votes: questionId ? { ...current.votes, [questionId]: rating } : current.votes,
    }));
    if (!questionId) return;
    const sessionId = getFeedbackSessionId();
    void fetch(`/api/questions/${encodeURIComponent(questionId)}/feedback`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, rating: rating === 'up' ? 'good' : 'weak' }),
    }).then(async (response) => {
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        console.warn(body?.error || 'Could not save question feedback.');
      }
    }).catch((error: unknown) => console.warn('Could not save question feedback.', error));
  };

  const actions: QuizActions = {
    goHome: () => patch({ screen: 'landing', menu: false, shareStatus: '' }),
    toggleMenu: () => patch((s) => ({ menu: !s.menu })),
    setOther: (value) => patch({ other: value }),
    startQuiz: () => begin(state.other.trim() || (state.quizMode === 'random' ? initialState.topic : state.topic)),
    pickTopic: (name) => begin(name),
    again: () => state.quizMode === 'random' ? void beginRandom() : void begin(state.topic),
    newTopic: () => {
      window.localStorage.removeItem(STORAGE_KEY);
      patch({ ...initialState, topic: state.quizMode === 'random' ? initialState.topic : state.topic });
      window.scrollTo(0, 0);
    },
    retryGeneration: () => begin(state.topic),
    randomQuiz: () => {
      if (!state.randomLoading) void beginRandom();
    },
    startPlay: () => {
      patch({ screen: 'quiz', slide: 1 });
      window.scrollTo(0, 0);
      nextFrame(() => patch({ slide: 0 }));
    },
    relatedTopic: () => begin(state.topic.toLowerCase().includes('india') ? 'World history' : 'Everyday objects'),
    share: async () => {
      const url = `${window.location.origin}${window.location.pathname}?quiz=editorial-demo&topic=${encodeURIComponent(state.topic)}`;
      try {
        if (navigator.share) {
          await navigator.share({
            title: `${bank.length} Questions on ${state.topic}`,
            text: `${bank.length} questions worth working out.`,
            url,
          });
          patch({ shareStatus: 'Shared' });
        } else {
          await navigator.clipboard.writeText(url);
          patch({ shareStatus: 'Link copied' });
        }
      } catch (error) {
        if (!(error instanceof Error) || error.name !== 'AbortError') patch({ shareStatus: 'Could not copy link' });
      }
    },

    revealSample: () => {
      if (!state.sample) openRoll('sample');
    },
    openSampleViewer: () => patch({ viewer: 'sample' }),

    revealAnswer: () => openRoll('answer'),
    nextClue: () => patch((s) => ({ clueCount: s.clueCount + 1 })),
    pickChoice: (key) => patch({ pick: key }),
    toggleSources: () => patch((s) => ({ sourcesOpen: !s.sourcesOpen })),
    voteUp: () => submitFeedback('up'),
    voteDown: () => submitFeedback('down'),
    openViewer: () => patch({ viewer: 'question' }),
    closeViewer: () => patch({ viewer: null }),
    next: advance,
    back,
  };

  return { state, question, bank, actions };
}
