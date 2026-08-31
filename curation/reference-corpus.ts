import type { QuestionBlueprint } from '../server/question-schemas.js';
import type { TopicCategory } from '../src/topic-categories.js';

export interface ReferenceSource {
  id: string;
  title: string;
  publisher: string;
  url: string;
}

export interface ReferenceCandidate {
  slideLocator: string;
  revision: number;
  premiseSummary: string;
  topic: TopicCategory;
  blueprint: QuestionBlueprint;
  compatibility: 'current_open_ended' | 'current_progressive_clues' | 'future_visual' | 'future_connect' | 'future_paired_answer' | 'future_audio_video' | 'rejected';
  status: 'screened' | 'adapted' | 'verified' | 'evaluated' | 'published' | 'rejected' | 'future_format';
  verificationMode: 'independent_sources' | 'user_verified';
  rejectionReason?: string;
  adaptedQuestion?: Record<string, unknown>;
  verificationRecord?: { sources: ReferenceSource[]; notes: string };
  evaluatorMetadata?: Record<string, unknown> & { ships?: boolean };
}

export interface ReferenceDeck {
  title: string;
  canonicalUrl: string;
  uploaderAuthor: string;
  year: number;
  rightsMode: 'adapt_and_verify';
  candidates: ReferenceCandidate[];
}

export const REFERENCE_CORPUS: ReferenceDeck[] = [
  {
    title: 'Uncanny Valley HighQ 2023 Filler Quiz',
    canonicalUrl: 'https://www.slideshare.net/slideshow/uncanny-valleyhighq-2023-filler-quiz/255911149',
    uploaderAuthor: 'Quizzito—The Quiz Society of Gargi College',
    year: 2023,
    rightsMode: 'adapt_and_verify',
    candidates: [{
      slideLocator: 'question-19',
      revision: 1,
      premiseSummary: 'Connect a web status code for legally censored content to the dystopian novel referenced by its number.',
      topic: 'Books, music & art',
      blueprint: { playerAction: 'connect', evidenceForm: 'statistic', relationship: 'shared_link', answerContract: 'single_entity' },
      compatibility: 'current_open_ended',
      status: 'verified',
      verificationMode: 'user_verified',
      adaptedQuestion: {
        id: 'curated-uncanny-q19-r1', position: 1, label: 'CROSS-DOMAIN', format: 'open_ended',
        context: 'Web servers can use status code 451 when access to a resource is denied for legal reasons. Its number was chosen as a deliberate literary reference.',
        prompt: 'Which novel does the code reference?',
        answer: { short: 'Fahrenheit 451', explanation: 'The status code points to Ray Bradbury’s novel about the suppression and burning of books.' },
      },
      verificationRecord: { notes: 'Factual verification accepted from the corpus owner; player-facing sources intentionally omitted.', sources: [] },
    }],
  },
  {
    title: 'Adrishtha — IFest India Quiz 2016 — Elimination Round',
    canonicalUrl: 'https://www.slideshare.net/slideshow/adrishtha-ifest-india-quiz-2016-elimination-round/68719858',
    uploaderAuthor: 'Adrishtha / IFest', year: 2016, rightsMode: 'adapt_and_verify', candidates: [],
  },
  {
    title: 'General Quiz Finals — El Dorado 2022',
    canonicalUrl: 'https://www.slideshare.net/slideshow/general-quiz-finalsel-dorado-2022/251602027',
    uploaderAuthor: 'Conquiztadors — Sri Venkateswara College', year: 2022, rightsMode: 'adapt_and_verify', candidates: [],
  },
  {
    title: 'Q-Factor MELAS 2022',
    canonicalUrl: 'https://www.slideshare.net/slideshow/qfactor-melas-2022/251657553',
    uploaderAuthor: 'Q-Factor', year: 2022, rightsMode: 'adapt_and_verify', candidates: [],
  },
  {
    title: 'In The Mood For Yellow Submarines — Rendezvous 2024',
    canonicalUrl: 'https://www.slideshare.net/slideshow/mela-quiz-for-rendezvous-2024-at-iit-delhi-in-the-mood-for-yellow-submarines-finals-co-set-with-arunabh-and-sabhya-run-as-an-open-quiz-for-rendezvous-2024/274831946',
    uploaderAuthor: 'Arunabh and Sabhya', year: 2024, rightsMode: 'adapt_and_verify', candidates: [],
  },
  {
    title: 'Women’s Day Quiz 2024 Finals — IIT KGP',
    canonicalUrl: 'https://www.slideshare.net/slideshow/womens-day-quiz-2024-finals-iit-kgppdf/266807174',
    uploaderAuthor: 'IIT Kharagpur Quiz Club', year: 2024, rightsMode: 'adapt_and_verify', candidates: [],
  },
  {
    title: 'Around the World Quiz 2019 — Prelims',
    canonicalUrl: 'https://www.slideshare.net/slideshow/around-the-world-quiz-2019-prelims/132110090',
    uploaderAuthor: 'Around the World Quiz', year: 2019, rightsMode: 'adapt_and_verify', candidates: [],
  },
  {
    title: 'Diversity Quiz Finals — IIT Kanpur',
    canonicalUrl: 'https://www.slideshare.net/slideshow/diversity-quiz-finals-by-quiz-club-iit-kanpur/269832342',
    uploaderAuthor: 'Quiz Club, IIT Kanpur', year: 2024, rightsMode: 'adapt_and_verify', candidates: [],
  },
];
