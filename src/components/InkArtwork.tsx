import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Ellipse, G, Path, Pattern, Defs, Rect } from 'react-native-svg';
import { colors } from '@/theme/tokens';

export type InkMotif = 'bell' | 'bookmark' | 'calendar' | 'flower' | 'planet' | 'letter' | 'eye' | 'shield' | 'book' | 'gift' | 'spark' | 'key' | 'heart' | 'sound' | 'plus' | 'arrow' | 'search' | 'gear' | 'coffee' | 'crown' | 'rocket' | 'ghost' | 'pumpkin' | 'coat' | 'shades' | 'ball' | 'lips';

/** Original single-ink illustrations. Decorative; the surrounding control owns its label. */
export const InkDrawing = memo(function InkDrawing({ motif = 'flower', size = 80, color = colors.accent }: { motif?: InkMotif; size?: number; color?: string }) {
  return <View pointerEvents="none" aria-hidden={true} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <Svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <G stroke={color} strokeWidth={size < 48 ? 3.2 : 1.65} strokeLinecap="round" strokeLinejoin="round">
        {motif === 'bell' ? <><Path d="M24 65C33 54 27 35 37 26 48 14 68 20 71 36L73 57 82 67 21 72ZM40 78q9 18 22-2M48 18l-1-9 10-1 2 10M13 31l-7-6M18 18l-5-9M81 22l8-8M85 37l10-2M36 38q0-9 10-12" /></> : motif === 'bookmark' ? <><Path d="m26 11 48-4 5 80-25-15-23 20ZM37 24l24-2M38 32l18-2M18 41l-9 2M83 64l9 4M81 13l7-6" /><Path d="m50 42 4 8 9 1-7 6 2 10-8-5-8 5 2-10-7-6 9-1Z" /></> : motif === 'calendar' ? <><Path d="m14 23 69-5 5 66-69 6ZM15 39l69-5M30 11l2 22M66 8l2 22M30 50l9-1M49 48l9-1M69 46l5-1M32 65l9-1M51 63l10-1M34 78l8-1M65 65l5 4 9-12" /></> : null}
        {['bell', 'bookmark', 'calendar'].includes(motif) ? null : motif === 'lips' ? <><Path d="M7 48C24 44 32 19 45 34L51 39 59 32C72 21 83 45 95 48 79 69 71 79 50 79 30 78 18 64 7 48ZM8 49C27 46 37 52 50 51 67 52 76 44 94 48M12 53C30 61 43 64 50 63 66 64 81 56 91 51M21 23l-5-8M36 20l-2-13M76 23l8-8M36 87l-2 7M66 86l3 7" /></> : motif === 'coffee' ? <><Path d="M19 42 69 39 65 70C59 90 27 86 24 70ZM70 46C100 32 92 77 67 67M15 84C35 97 72 95 83 81M34 31C19 17 49 18 36 3M53 30C39 18 66 16 53 5M31 50l1 15" /></> : motif === 'crown' ? <><Path d="M20 70 12 29 36 46 50 15 65 43 89 26 81 70ZM21 77l61-2-1 11-58 2ZM41 62l9-12 9 11-9 9ZM28 5l4 8M75 4l-5 11" /><Circle cx={11} cy={25} r={4}/><Circle cx={50} cy={11} r={4}/><Circle cx={90} cy={22} r={4}/></> : motif === 'rocket' ? <><Path d="M31 60C36 31 60 13 84 9 90 39 71 61 49 70ZM57 22l21 19M34 45 14 47 10 72 32 61M62 65l-4 24-20 3 10-24M28 69C3 75 12 98 34 76M24 81l-4 8" /><Circle cx={58} cy={43} r={9}/><Path d="M14 9v13M8 15h13M85 74v13M79 80h13" /></> : motif === 'ghost' ? <><Path d="M20 79C12 61 28 56 24 35 21 1 76 3 76 34 73 54 82 63 91 69 86 91 66 72 64 85 61 99 44 73 38 83 32 94 29 82 20 79Z" /><Ellipse cx={42} cy={38} rx={4} ry={8}/><Ellipse cx={61} cy={36} rx={4} ry={8}/><Path d="M46 57q7-9 13-1M10 26l8-3M82 16l7-6" /></> : motif === 'pumpkin' ? <><Path d="M50 29C8 9-4 83 39 86 94 101 109 19 59 27L60 9 48 13ZM40 32C15 42 24 79 41 86M60 31C82 45 74 78 56 88M26 47l15-8-3 14ZM61 41l15 9-15 4ZM29 64l13 6 8-7 7 8 16-8-10 16-20 1Z" /></> : motif === 'coat' ? <><Path d="m34 17 16 9 16-11 16 13 11 35-16 6-6-21 4 40-52 1 5-40-6 23-16-6 14-39ZM34 17l-1 22 17-13 14 13 2-24M50 27v60M28 61l12 2-2 13-11-1M59 63l11-1 1 13-12 1" /></> : motif === 'shades' ? <><Path d="M9 42 41 39 42 58C28 78 6 67 9 42ZM57 39l33 4-3 18C68 76 51 63 57 39ZM42 46q7-9 15 0M9 46 3 37M90 47l6-10M17 49l11-3M63 47l11 2M38 15l5 10M61 13l-4 11M50 8v12" /></> : motif === 'ball' ? <><Circle cx={50} cy={52} r={35}/><Ellipse cx={52} cy={25} rx={9} ry={6}/><Path d="M44 28C10 45 26 79 47 87M59 26C82 32 84 61 70 78M50 31C42 49 44 66 63 83M17 39l-9-7M86 25l6-8M80 9v9M75 14h11" /></> : motif === 'flower' ? <>
          <Path d="M49 46C17 54 15 22 34 24 23 1 55 0 54 24 72 0 90 23 69 35 99 38 90 68 66 55 77 82 44 88 45 63 22 83 6 58 34 49Z" />
          <Circle cx={51} cy={43} r={11} /><Path d="M48 32 55 53M41 39 61 46M51 65C60 78 47 86 50 97M52 81C72 65 82 78 52 87M49 89C29 70 22 88 49 94" />
        </> : motif === 'planet' ? <>
          <Circle cx={50} cy={48} r={27} /><Path d="M26 37C30 20 56 16 70 32M27 62C-7 80 7 92 58 59 105 28 94 13 74 29M24 54C-2 73 15 79 53 55 91 31 91 22 77 28M44 23C27 41 48 73 57 73M63 25C46 33 41 59 43 72M29 35C40 43 57 44 75 39" />
          <Path d="m15 12 2 7 7 2-7 2-2 7-2-7-7-2 7-2ZM82 71v13M76 77h12" />
        </> : motif === 'letter' ? <>
          <Path d="m13 36 63-11 12 48-64 13ZM14 37 52 56 76 27M25 83 43 52M86 71 62 50M29 20C48 3 57 24 42 29 34 32 32 12 49 12M62 17l7-10M72 21l11-5" />
          <Path d="m66 34 9-2 3 11-9 2ZM32 68l21-4M33 73l14-3M5 49l8-2M7 58l8-2" />
        </> : motif === 'eye' ? <>
          <Path d="M8 50C30 17 69 17 93 47 70 79 28 81 8 50Z" /><Ellipse cx={51} cy={49} rx={16} ry={23} transform="rotate(12 51 49)" /><Ellipse cx={52} cy={49} rx={5} ry={13} fill={color} />
          <Path d="m20 33-7-10M34 26l-4-13M52 24V10M69 27l6-13M84 36l9-9M23 65l-7 9M42 73l-2 13M64 72l4 11M80 63l8 8" />
        </> : motif === 'shield' ? <>
          <Path d="M50 10C38 23 27 23 17 24L21 56C24 71 35 81 50 90 68 80 78 65 80 52L83 24C66 22 61 19 50 10ZM50 20C40 29 31 31 27 32L31 55C33 65 40 74 50 79 63 69 69 61 70 49L73 32C64 31 56 27 50 20Z" />
          <Path d="M38 48C32 37 46 33 50 43 58 29 72 43 59 55L50 63ZM9 13v10M4 18h10M87 73v12M81 79h12" />
        </> : motif === 'book' ? <>
          <Path d="m49 32 3 52C39 73 24 74 12 78L8 22C22 17 34 20 49 32ZM49 32C61 20 75 17 90 21L86 77C74 74 62 76 52 84M17 29l23 7M18 38l22 6M19 48l22 6M61 35l20-7M61 44l19-7M61 53l18-7M16 86c25-5 25 7 37 5 11-7 25-9 34-6M49 4v12M42 10l6 6 8-7" />
        </> : motif === 'gift' ? <>
          <Path d="m18 43 63-5 2 15-64 5ZM24 58l3 27 49-4 3-28M46 43l3 40M54 41l3 42M48 39C15 44 18 9 37 18 44 22 49 32 50 39ZM51 38C76-4 96 31 67 37ZM34 28l16 11 20-13M11 11v12M6 17h11M87 69v12M82 75h11" />
        </> : motif === 'key' ? <>
          <Path d="M39 54C10 61 5 24 23 17 45 4 61 31 44 48L77 77 86 68 92 75 83 87 75 89ZM23 25C11 37 33 49 38 35 41 25 29 20 23 25ZM49 61l12-12" />
        </> : motif === 'heart' ? <>
          <Path d="M49 82C39 72 8 54 12 31 16 8 41 12 50 32 62 1 94 16 89 38 85 58 62 74 49 82ZM20 36C19 25 30 20 36 28M24 52l6 7M48 5V0M6 13l7 6M88 7l-7 10M79 73l9 8" />
        </> : motif === 'sound' ? <>
          <Path d="M43 57V23C43 3 66 4 65 24L63 56C63 74 41 71 43 57ZM33 43l-1 12C28 84 76 90 77 55l1-11M52 82l-1 12M38 95h27M46 25l14 1M46 34h13M46 43h13M15 36C7 49 10 60 18 68M86 25C101 45 96 65 85 75" />
        </> : motif === 'gear' ? <>
          <Path d="m40 12 16 1 3 12 10 5 12-3 8 15-10 9-1 10 7 10-13 12-12-6-10 2-7 10-16-6 1-13-7-8-12-1-3-18 12-5 5-9ZM38 39C57 20 81 54 57 64 37 73 26 52 38 39Z" />
        </> : motif === 'search' ? <><Circle cx={43} cy={40} r={24} /><Path d="m59 59 25 28 6-6-26-28M24 39c0-12 10-18 19-16" /></> : motif === 'plus' ? <Path d="M48 18 45 83M18 51 82 46M53 19l-3 63" /> : motif === 'arrow' ? <Path d="M16 72C31 70 61 40 80 22M48 20l34-3-3 35" /> : <>
          <Path d="m51 6 8 29 28-13-17 26 25 13-31 3-1 30-15-26-24 19 10-29L6 47l30-5-8-27 19 21Z" /><Circle cx={51} cy={50} r={8} />
        </>}
      </G>
    </Svg>
  </View>;
});

/** A quiet printed field rather than a flat fill; texture never catches gestures. */
export const ArtCanvas = memo(function ArtCanvas() {
  return <View pointerEvents="none" aria-hidden={true} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
    <Svg width="100%" height="100%">
      <Defs><Pattern id="inkGrain" width={47} height={53} patternUnits="userSpaceOnUse"><Circle cx={3} cy={7} r={0.6} fill={colors.text} opacity={0.13} /><Circle cx={29} cy={35} r={0.45} fill={colors.text} opacity={0.1} /><Path d="m15 43 1.4-1M37 14l1 2" stroke={colors.text} strokeWidth={0.5} opacity={0.09} /></Pattern></Defs>
      <Rect width="100%" height="100%" fill="url(#inkGrain)" />
    </Svg>
    <View style={{ position: 'absolute', top: 105, right: -84, opacity: 0.09, transform: [{ rotate: '18deg' }] }}><InkDrawing motif="flower" size={270} color={colors.text} /></View>
    <View style={{ position: 'absolute', bottom: 105, left: -95, opacity: 0.09, transform: [{ rotate: '-24deg' }] }}><InkDrawing motif="planet" size={290} color={colors.accent} /></View>
  </View>;
});

export function PaperSurface({ variant = 'note', color = colors.surfaceSoft, ink = colors.border }: { variant?: 'note' | 'ticket' | 'letter' | 'oval'; color?: string; ink?: string }) {
  const outline = variant === 'oval' ? 'M50 2C83-2 98 18 98 48 101 80 86 98 50 98 15 102 1 78 2 50-1 20 16 2 50 2Z' : variant === 'ticket' ? 'M3 4 97 2 98 29C93 30 93 42 98 43L97 97 3 99 2 44C7 42 7 31 2 30Z' : variant === 'letter' ? 'M2 7 96 2 99 94 4 99Z' : 'M4 3 34 5 64 2 98 5 96 39 99 71 96 98 59 96 29 99 2 95 4 62 1 33Z';
  return <View pointerEvents="none" aria-hidden={true} accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
    <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none"><Path d={outline} fill={color} stroke={ink} strokeWidth={0.35} />{variant === 'letter' ? <Path d="m4 75 44-24 49 20M3 9l45 42L97 4" stroke={ink} strokeWidth={0.3} fill="none" opacity={0.5} /> : null}</Svg>
  </View>;
}

export function InkRule() {
  return <View pointerEvents="none" aria-hidden={true} accessible={false} style={{ height: 12, width: '100%' }}><Svg width="100%" height={12} viewBox="0 0 360 12" preserveAspectRatio="none"><Path d="M2 7C71 1 99 12 167 5S290 10 358 4M9 10C96 5 125 11 178 8" fill="none" stroke={colors.borderStrong} strokeWidth={0.65} /></Svg></View>;
}

export function NavigationArtwork() {
  return <View pointerEvents="none" aria-hidden={true} accessible={false} style={[StyleSheet.absoluteFill, { top: -22 }]}>
    <Svg width="100%" height="100%" viewBox="0 0 400 130" preserveAspectRatio="none">
      <Path d="M0 21Q42 0 86 13T162 16Q204-2 246 12T322 16Q363 0 400 12V130H0Z" fill={colors.accentSolid} />
      <Path d="M0 26Q42 8 86 18T162 21Q204 3 246 17T322 21Q363 5 400 17V130H0Z" fill="#24231F" />
      <Path d="M9 28Q44 14 78 22M170 24q35-15 65-4M330 23q33-12 60-2" fill="none" stroke={colors.text} strokeWidth={0.6} opacity={0.4} />
    </Svg>
  </View>;
}
