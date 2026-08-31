import type { QuizTopic } from './types';

export const TOPIC_CATEGORIES = [
  { name: 'Indian sport', count: 'NEW', tab: '#E4D9B8' },
  { name: 'Cinema', count: '10', tab: '#CADCD2' },
  { name: 'World history', count: '10', tab: '#E9D3B2' },
  { name: 'Science & strange things', count: '10', tab: '#DCD2E0' },
  { name: 'Video games', count: '10', tab: '#D9DCC6' },
  { name: 'Books, music & art', count: 'NEW', tab: '#E3CED0' },
  { name: 'Places & cultures', count: 'NEW', tab: '#C9D9E6' },
  { name: 'People & society', count: 'NEW', tab: '#E7D7C9' },
  { name: 'Everyday objects', count: 'NEW', tab: '#D5DEC8' },
] as const satisfies readonly QuizTopic[];

export type TopicCategory = typeof TOPIC_CATEGORIES[number]['name'];
export const TOPIC_CATEGORY_NAMES = TOPIC_CATEGORIES.map(({ name }) => name) as TopicCategory[];

export function isTopicCategory(value: string): value is TopicCategory {
  return TOPIC_CATEGORY_NAMES.includes(value as TopicCategory);
}
