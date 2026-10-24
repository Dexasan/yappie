import type { Href } from 'expo-router';

export function safeReturnTarget(value: unknown): Href | null {
  if (typeof value !== 'string') return null;
  return /^\/(post|messages|clubs|people)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ? value as Href : null;
}
