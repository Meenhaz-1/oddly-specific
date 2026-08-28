export type QuestionKind = 'image' | 'clues' | 'connect' | 'choice' | 'blank' | 'text';

export interface QuizSource {
  title: string;
  meta: string;
  url?: string;
}

export interface QuizClue {
  tag: string;
  text: string;
}

export interface QuizChoice {
  key: string;
  text: string;
}

export interface QuizQuestion {
  questionId?: string;
  label: string;
  kind: QuestionKind;
  setup: string;
  ask?: string;
  note?: string;
  imgAlt?: string;
  imgSrc?: string;
  answer: string;
  explain: string;
  clues?: QuizClue[];
  choices?: QuizChoice[];
  sources: QuizSource[];
}

export interface QuizTopic {
  name: string;
  count: string;
  tab: string;
}

export interface GeneratedQuiz {
  runId?: string;
  title: string;
  teaser: string;
  questions: OpenEndedQuestion[];
}

export interface RandomQuizResponse {
  title: string;
  teaser: string;
  questions: OpenEndedQuestion[];
  resetExclusions: boolean;
}

export interface OpenEndedSource {
  id: string;
  title: string;
  publisher: string;
  url: string;
}

export interface OpenEndedQuestion {
  questionId?: string;
  topic?: string;
  id: string;
  position: number;
  label: string;
  format: 'open_ended';
  context: string;
  prompt: string;
  answer: {
    short: string;
    explanation: string;
  };
  sources: OpenEndedSource[];
}

export type QuizScreen = 'landing' | 'making' | 'intro' | 'quiz' | 'done';
export type QuizMode = 'generated' | 'random';
export type RevealStage = 0 | 1 | 2;
export type Vote = 'up' | 'down' | null;
export type ViewerTarget = 'sample' | 'question' | null;
export type SeenState = 'revealed' | 'skipped';

export interface QuizState {
  screen: QuizScreen;
  quizMode: QuizMode;
  menu: boolean;
  topic: string;
  other: string;
  sample: RevealStage;
  sampleRoll: boolean;
  qi: number;
  stage: RevealStage;
  roll: boolean;
  sourcesOpen: boolean;
  clueCount: number;
  pick: string | null;
  vote: Vote;
  votes: Record<string, Vote>;
  viewer: ViewerTarget;
  slide: -1 | 0 | 1;
  seen: Record<number, SeenState>;
  shareStatus: string;
  questions: QuizQuestion[] | null;
  teaser: string;
  generationError: string;
  randomLoading: boolean;
  randomError: string;
}

export interface QuizActions {
  goHome: () => void;
  toggleMenu: () => void;
  setOther: (value: string) => void;
  startQuiz: () => void;
  pickTopic: (name: string) => void;
  again: () => void;
  newTopic: () => void;
  retryGeneration: () => void;
  randomQuiz: () => void;
  startPlay: () => void;
  relatedTopic: () => void;
  share: () => Promise<void>;
  revealSample: () => void;
  openSampleViewer: () => void;
  revealAnswer: () => void;
  nextClue: () => void;
  pickChoice: (key: string) => void;
  toggleSources: () => void;
  voteUp: () => void;
  voteDown: () => void;
  openViewer: () => void;
  closeViewer: () => void;
  next: () => void;
  back: () => void;
}
