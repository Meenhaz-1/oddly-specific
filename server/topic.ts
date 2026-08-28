import { MAX_TOPIC_CHARACTERS } from '../src/constants.js';

// Remove line-breaking controls and invisible direction/format controls while
// preserving ZWNJ/ZWJ, which are meaningful in several writing systems.
const UNSAFE_TOPIC_CHARACTERS =
  /[\p{Cc}\u00ad\u061c\u180e\u200b\u200e\u200f\u202a-\u202e\u2060-\u2069\ufeff]+/gu;

export type TopicValidationResult =
  | {
      valid: true;
      topic: string;
      characterCount: number;
      reason: null;
      error: null;
    }
  | {
      valid: false;
      topic: string;
      characterCount: number;
      reason: 'required' | 'too_long';
      error: string;
    };

export function normalizeTopicInput(value: unknown): string {
  if (typeof value !== 'string') return '';

  return value
    .normalize('NFKC')
    .replace(UNSAFE_TOPIC_CHARACTERS, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

export function validateTopic(value: unknown): TopicValidationResult {
  const topic = normalizeTopicInput(value);
  const characterCount = Array.from(topic).length;
  if (characterCount === 0) {
    return {
      valid: false,
      topic,
      characterCount,
      reason: 'required',
      error: 'Enter a topic.',
    };
  }
  if (characterCount > MAX_TOPIC_CHARACTERS) {
    return {
      valid: false,
      topic,
      characterCount,
      reason: 'too_long',
      error: `Keep the topic to ${MAX_TOPIC_CHARACTERS} characters or fewer.`,
    };
  }
  return {
    valid: true,
    topic,
    characterCount,
    reason: null,
    error: null,
  };
}
