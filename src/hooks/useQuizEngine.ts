import { useCallback, useEffect, useRef, useState } from 'react';
import { GENERATED_QUESTION_COUNT, PROGRESSIVE_CLUES_CONTEXT, RANDOM_QUESTION_COUNT } from '../constants';
import { QUESTION_BANK } from '../data/questions';
import type {
  GeneratedQuestion,
  GeneratedQuiz,
  OpenEndedQuestion,
  ProgressiveCluesQuestion,
  QuizActions,
  QuizQuestion,
  QuizState,
  RandomQuizResponse,
  SeenState,
  SharedQuizResponse,
} from '../types';

// Reveal-curtain animation duration (ms). Matches the design's default.
export const REVEAL_MS = 620;
/** Pacing estimate for the assembling screen. Not a timeout: the request
 * resolves when it resolves; this only shapes the progress curve. */
export const EXPECTED_GENERATION_MS = 45_000;
const STORAGE_KEY = 'oddly-specific-progress-v1';
const FEEDBACK_SESSION_KEY = 'oddly-specific-feedback-session-v1';
const RANDOM_SEEN_SESSION_KEY = 'oddly-specific-random-seen-v1';
const HOME_PATH = '/';
const QUIZ_PATH = '/quiz';
const COMPLETE_PATH = '/quiz/complete';
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const initialState: QuizState = {
  screen: 'landing', // 'landing' | 'making' | 'intro' | 'quiz' | 'done'
  quizMode: 'generated',
  menu: false,
  topic: 'Indian sport',
  other: '',
  qi: 0,
  stage: 0, // 0 unrevealed, 1 mounted/clipped, 2 open
  roll: false,
  sourcesOpen: false,
  clueCount: 1,
  pick: null,
  vote: null,
  votes: {},
  viewer: null, // 'question' | null
  slide: 0, // -1 leaving left, 0 settled, 1 entering from right
  seen: {},
  shareStatus: '',
  questions: null,
  runId: null,
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

function isProgressiveCluesQuestion(value: unknown): value is ProgressiveCluesQuestion {
  if (!isRecord(value)) return false;
  return (
    typeof value.questionId === 'string' &&
    typeof value.id === 'string' &&
    typeof value.position === 'number' &&
    typeof value.label === 'string' &&
    value.format === 'progressive_clues' &&
    typeof value.prompt === 'string' &&
    Array.isArray(value.clues) &&
    value.clues.length === 3 &&
    value.clues.every((clue) => typeof clue === 'string') &&
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

function isGeneratedQuestion(value: unknown): value is GeneratedQuestion {
  return isOpenEndedQuestion(value) || isProgressiveCluesQuestion(value);
}

function isGeneratedQuiz(value: unknown): value is GeneratedQuiz {
  return (
    isRecord(value) &&
    typeof value.runId === 'string' &&
    typeof value.title === 'string' &&
    typeof value.teaser === 'string' &&
    Array.isArray(value.questions) &&
    value.questions.length === GENERATED_QUESTION_COUNT &&
    value.questions.every(isGeneratedQuestion) &&
    value.questions.filter((question) => question.format === 'open_ended').length === 1 &&
    value.questions.filter((question) => question.format === 'progressive_clues').length === 1
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

function toQuizQuestions(questions: GeneratedQuestion[]): QuizQuestion[] {
  return questions.map((generated) => {
    const shared = {
      questionId: generated.questionId,
      label: generated.label,
      ask: generated.prompt,
      answer: generated.answer.short,
      explain: generated.answer.explanation,
      sources: generated.sources.map((source) => ({
        title: source.title,
        meta: source.publisher,
        url: source.url,
      })),
    };
    if (generated.format === 'progressive_clues') {
      return {
        ...shared,
        kind: 'clues',
        setup: PROGRESSIVE_CLUES_CONTEXT,
        clues: generated.clues.map((text, index) => ({
          tag: `CLUE ${['ONE', 'TWO', 'THREE'][index]}`,
          text,
        })),
      };
    }
    return { ...shared, kind: 'text', setup: generated.context };
  });
}

function isSharedQuizResponse(value: unknown): value is SharedQuizResponse {
  if (!isGeneratedQuiz(value)) return false;
  const topic = (value as GeneratedQuiz & { topic?: unknown }).topic;
  return typeof value.runId === 'string' && uuidPattern.test(value.runId)
    && typeof topic === 'string' && topic.length > 0;
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

  const sharedRunId = params.get('run');
  if (sharedRunId && uuidPattern.test(sharedRunId)) {
    return { ...initialState, screen: 'making', topic: 'this shared set', runId: sharedRunId };
  }

  const path = window.location.pathname.replace(/\/+$/, '') || HOME_PATH;
  if (path === HOME_PATH) {
    window.localStorage.removeItem(STORAGE_KEY);
    return initialState;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialState;
    const saved = JSON.parse(raw) as Partial<QuizState>;
    if (!saved.screen || !['intro', 'quiz', 'done'].includes(saved.screen)) return initialState;
    const restored = { ...initialState, ...saved, roll: false, slide: 0 as const, viewer: null };
    if (path === COMPLETE_PATH) return { ...restored, screen: 'done' };
    if (path === QUIZ_PATH) {
      return restored.screen === 'done' ? { ...restored, screen: 'quiz', stage: 2 } : restored;
    }
    return initialState;
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
  const [sharedLoadAttempt, setSharedLoadAttempt] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  useEffect(() => {
    const restoreFromRoute = () => {
      const restored = getInitialState();
      if (restored.screen === 'landing' && window.location.pathname !== HOME_PATH) {
        window.history.replaceState({}, '', HOME_PATH);
      }
      setState(restored);
    };
    restoreFromRoute();
    window.addEventListener('popstate', restoreFromRoute);
    return () => window.removeEventListener('popstate', restoreFromRoute);
  }, []);

  useEffect(() => {
    if (!['intro', 'quiz', 'done'].includes(state.screen)) return;
    const { viewer: _viewer, roll: _roll, slide: _slide, shareStatus: _shareStatus, ...persisted } = state;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
  }, [state]);

  useEffect(() => {
    if (state.screen !== 'making' || !state.runId) return;
    const controller = new AbortController();
    const runId = state.runId;
    void (async () => {
      try {
        const apiResponse = await fetch(`/api/quizzes/${encodeURIComponent(runId)}`, { signal: controller.signal });
        const result: unknown = await apiResponse.json().catch(() => null);
        if (!apiResponse.ok) {
          const apiError = isRecord(result) && typeof result.error === 'string'
            ? result.error
            : 'Could not load this shared quiz.';
          throw new Error(apiError);
        }
        if (!isSharedQuizResponse(result) || result.runId !== runId) {
          throw new Error('The shared quiz was incomplete or malformed.');
        }
        setState((current) => ({
          ...current,
          screen: 'intro',
          quizMode: 'generated',
          topic: result.topic,
          questions: toQuizQuestions(result.questions),
          teaser: result.teaser,
          generationError: '',
        }));
        window.history.replaceState({}, '', QUIZ_PATH);
        window.scrollTo(0, 0);
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return;
        setState((current) => ({ ...current, generationError: errorMessage(error) }));
      }
    })();
    return () => controller.abort();
  }, [sharedLoadAttempt, state.screen, state.runId]);

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

  const navigate = useCallback((path: string, replace = false) => {
    if (`${window.location.pathname}${window.location.search}` === path) return;
    window.history[replace ? 'replaceState' : 'pushState']({}, '', path);
  }, []);

  const bank = state.questions?.length ? state.questions : QUESTION_BANK;
  const question = bank[state.qi]!;

  const openRoll = () => {
    patch({ stage: 1, roll: true });
    nextFrame(() => patch({ stage: 2 }));
    after(REVEAL_MS + 120, () => patch({ roll: false }));
  };

  const begin = async (topic: string): Promise<void> => {
    window.localStorage.removeItem(STORAGE_KEY);
    navigate(HOME_PATH);
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
      runId: null,
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
      patch({ questions, runId: result.runId || null, teaser: result.teaser, screen: 'intro' });
      navigate(QUIZ_PATH);
      window.scrollTo(0, 0);
    } catch (error) {
      patch({ generationError: errorMessage(error) });
    }
  };

  const beginRandom = async (): Promise<void> => {
    window.localStorage.removeItem(STORAGE_KEY);
    const excludedIds = getRandomSeenIds();
    patch({ screen: 'landing', menu: false, randomLoading: true, randomError: '', shareStatus: '' });
    navigate(HOME_PATH);
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
        runId: null,
        teaser: result.teaser,
        generationError: '',
        randomLoading: false,
        randomError: '',
      });
      navigate(QUIZ_PATH);
      window.scrollTo(0, 0);
    } catch (error) {
      patch({ screen: 'landing', randomLoading: false, randomError: errorMessage(error) });
    }
  };

  const advance = () => {
    const seen: Record<number, SeenState> = { ...state.seen, [state.qi]: state.stage >= 1 ? 'revealed' : 'skipped' };
    if (state.qi >= bank.length - 1) {
      patch({ seen, screen: 'done' });
      navigate(COMPLETE_PATH);
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
      window.localStorage.removeItem(STORAGE_KEY);
      patch({ screen: 'landing' });
      navigate(HOME_PATH);
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
    goHome: () => {
      window.localStorage.removeItem(STORAGE_KEY);
      patch({ screen: 'landing', menu: false, shareStatus: '' });
      navigate(HOME_PATH);
    },
    toggleMenu: () => patch((s) => ({ menu: !s.menu })),
    setOther: (value) => patch({ other: value }),
    startQuiz: () => begin(state.other.trim() || (state.quizMode === 'random' ? initialState.topic : state.topic)),
    pickTopic: (name) => begin(name),
    again: () => state.quizMode === 'random' ? void beginRandom() : void begin(state.topic),
    newTopic: () => {
      window.localStorage.removeItem(STORAGE_KEY);
      patch({ ...initialState, topic: state.quizMode === 'random' ? initialState.topic : state.topic });
      navigate(HOME_PATH);
      window.scrollTo(0, 0);
    },
    retryGeneration: () => {
      if (state.runId) {
        patch({ generationError: '' });
        setSharedLoadAttempt((attempt) => attempt + 1);
        return;
      }
      void begin(state.topic);
    },
    randomQuiz: () => {
      if (!state.randomLoading) void beginRandom();
    },
    startPlay: () => {
      patch({ screen: 'quiz', slide: 1 });
      navigate(QUIZ_PATH);
      window.scrollTo(0, 0);
      nextFrame(() => patch({ slide: 0 }));
    },
    relatedTopic: () => begin(state.topic.toLowerCase().includes('india') ? 'World history' : 'Everyday objects'),
    share: async () => {
      if (!state.runId) {
        patch({ shareStatus: 'This quiz is not available to share' });
        return;
      }
      const url = new URL(HOME_PATH, window.location.origin);
      url.searchParams.set('run', state.runId);
      try {
        if (navigator.share) {
          await navigator.share({
            title: `${bank.length} Questions on ${state.topic}`,
            text: `${bank.length} questions worth working out.`,
            url: url.toString(),
          });
          patch({ shareStatus: 'Shared' });
        } else {
          await navigator.clipboard.writeText(url.toString());
          patch({ shareStatus: 'Link copied' });
        }
      } catch (error) {
        if (!(error instanceof Error) || error.name !== 'AbortError') patch({ shareStatus: 'Could not copy link' });
      }
    },

    revealAnswer: () => openRoll(),
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
