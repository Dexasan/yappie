import { colors } from '@/theme/tokens';

export type GiftPresentation = {
  accent: string;
  background: string;
  emoji: string;
  label: string;
  sparkle: string;
  tagline: string;
};

const presentations: Record<string, GiftPresentation> = {
  rose: { accent: colors.accent, background: colors.accentSoft, emoji: '🌹', label: 'A CLASSIC', sparkle: '✦', tagline: 'A rose that blooms across the whole screen.' },
  coffee: { accent: colors.warning, background: colors.warningSoft, emoji: '☕', label: 'WARM & EASY', sparkle: '≈', tagline: 'A warm cup with rising animated steam.' },
  heart: { accent: colors.accent, background: colors.accentSoft, emoji: '💖', label: 'BIG FEELING', sparkle: '♥', tagline: 'A full-screen heart burst for someone special.' },
  fire: { accent: colors.accent, background: colors.accentSoft, emoji: '🎆', label: 'LOUD LOVE', sparkle: '✷', tagline: 'Fireworks, sparks, and a room-stopping entrance.' },
  crown: { accent: colors.warning, background: colors.warningSoft, emoji: '👑', label: 'ROYAL', sparkle: '◆', tagline: 'A gold crown with a bright sweeping shine.' },
  bumper: { accent: colors.signal, background: colors.signalSoft, emoji: '🚀', label: 'THE BIG ONE', sparkle: '★', tagline: 'Every animation, a huge entrance, and 30 days of Premium for them.' },
  halloween_pumpkin: { accent: colors.accent, background: colors.accentSoft, emoji: '🎃', label: 'OCTOBER DROP', sparkle: '✦', tagline: 'A glowing pumpkin pop for Halloween.' },
  halloween_ghost: { accent: colors.cobalt, background: colors.cobaltSoft, emoji: '👻', label: 'OCTOBER DROP', sparkle: '◌', tagline: 'A playful ghost that floats through the chat.' },
  christmas_card: { accent: colors.accent, background: colors.accentSoft, emoji: '💌', label: 'HOLIDAY DROP', sparkle: '❄', tagline: 'An animated card that opens just for them.' },
  santa_surprise: { accent: colors.accent, background: colors.accentSoft, emoji: '🎅', label: 'HOLIDAY DROP', sparkle: '❄', tagline: 'Santa lands with snow, bells, and confetti.' },
  winter_jacket: { accent: colors.cobalt, background: colors.cobaltSoft, emoji: '🧥', label: 'WINTER DROP', sparkle: '❄', tagline: 'A cozy winter flex wrapped in falling snow.' },
  summer_beach_ball: { accent: colors.cobalt, background: colors.cobaltSoft, emoji: '🏖️', label: 'SUMMER DROP', sparkle: '☀', tagline: 'A bouncing beach moment with sun and waves.' },
  summer_sunglasses: { accent: colors.warning, background: colors.warningSoft, emoji: '😎', label: 'SUMMER DROP', sparkle: '☀', tagline: 'Bright shades, lens flare, instant summer.' },
};

const fallback: GiftPresentation = {
  accent: colors.warning,
  background: colors.warningSoft,
  emoji: '🎁',
  label: 'YAPPIE GIFT',
  sparkle: '✦',
  tagline: 'A little something that feels big.',
};

export function giftPresentation(slug: string): GiftPresentation {
  return presentations[slug] ?? fallback;
}
