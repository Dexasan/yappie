/** Yappie after dark: charcoal, warm chalk, and vermilion. */
export const colors = {
  background: '#111110', backgroundRaised: '#171716',
  surface: '#1A1A18', surfaceRaised: '#30302B', surfaceSoft: '#22221F',
  border: '#383832', borderStrong: '#77746A',
  primary: '#F1EBDD', primaryPressed: '#D6CBBB', primarySoft: '#30302B', primaryInk: '#111110',
  accent: '#FF775D', accentSolid: '#BF3826', accentSoft: '#36201B',
  signal: '#CDD8A2', signalSoft: '#252D20',
  cobalt: '#C2AEDF', cobaltSoft: '#2B2435',
  warning: '#E3BD76', warningSoft: '#30281B',
  text: '#F1EBDD', textMuted: '#BCB7AB', textSubtle: '#9E9A8E', link: '#FF917B',
  danger: '#FF8978', dangerSoft: '#36201E', success: '#AED0A0', successSoft: '#222E24',
  white: '#FFF9ED', black: '#111110', scrim: 'rgba(0, 0, 0, 0.78)',
  primaryGlow: 'rgba(201, 52, 32, 0.06)', accentGlow: 'rgba(201, 52, 32, 0.08)',
} as const;

export const fonts = {
  body: 'DMSans_400Regular', medium: 'DMSans_500Medium', bold: 'DMSans_700Bold',
  display: 'BarlowCondensed_700Bold', editorial: 'InstrumentSerif_400Regular', italic: 'InstrumentSerif_400Regular_Italic',
} as const;
export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, hero: 48 } as const;
export const radius = { xs: 3, sm: 5, md: 8, lg: 12, xl: 16, pill: 999 } as const;
export const shadows = {
  card: { elevation: 0, shadowColor: '#191917', shadowOffset: { height: 0, width: 0 }, shadowOpacity: 0, shadowRadius: 0 },
  floating: { elevation: 6, shadowColor: '#191917', shadowOffset: { height: 4, width: 0 }, shadowOpacity: 0.08, shadowRadius: 12 },
} as const;
