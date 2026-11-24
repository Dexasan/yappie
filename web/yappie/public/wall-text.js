export const WALL_CAPACITY = 20;
export const WALL_REMOVE_AT = 12;
export const WALL_MAX_WORDS = 9;
export const WALL_MAX_LENGTH = 120;
export const WALL_COLORS = ['chalk', 'coral', 'sage', 'lilac'];

export function cleanWallText(value) {
  if (typeof value !== 'string') return '';
  return value.normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b\u2060\ufeff]/gu, ' ')
    .replace(/[\u202a-\u202e\u2066-\u2069]/gu, '')
    .replace(/\s+/gu, ' ').trim();
}

export function wallWordCount(value) {
  const text = cleanWallText(value);
  return text ? text.split(' ').length : 0;
}
