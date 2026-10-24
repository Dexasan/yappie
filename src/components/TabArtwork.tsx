import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, Ellipse, G, Path } from 'react-native-svg';
import { colors } from '@/theme/tokens';

/** Original ink drawings, not a stock icon font. The active tab becomes a cut-paper stamp. */
export const TabArtwork = memo(function TabArtwork({ name, focused }: { name: string; focused: boolean }) {
  const ink = focused ? colors.black : colors.textMuted;
  const angle = name === 'quick-chat' ? '-7deg' : name === 'feed' ? '5deg' : name === 'clubs' ? '-5deg' : name === 'messages' ? '7deg' : '-4deg';
  return <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.frame, focused && { transform: [{ rotate: angle }, { translateY: -3 }] }]}>
    <Svg width={58} height={48} viewBox="0 0 64 52" fill="none">
      {focused ? <Path d="M7 7 18 4 28 6 43 3 58 8 56 19 59 30 54 46 39 47 29 45 14 49 5 43 7 29 4 19Z" fill={colors.text} /> : null}
      <G stroke={ink} strokeWidth={1.65} strokeLinecap="round" strokeLinejoin="round">
        {name === 'quick-chat' ? <>
          <Path d="M12 26C19 22 24 14 29 19L32 21 35 18C41 14 46 23 53 26 47 32 42 37 33 37 23 37 17 32 12 26Z" fill={focused ? colors.accentSolid : 'none'} />
          <Path d="M13 26C23 23 25 26 32 26 39 26 43 23 52 26M15 27C23 30 26 31 32 31 39 31 45 29 50 27" />
          <Path d="M16 13 13 9M23 12 22 6M47 15 51 11" />
        </> : name === 'feed' ? <>
          <Path d="M9 27C17 14 41 9 55 26 43 41 21 41 9 27Z" />
          <Ellipse cx={32} cy={27} rx={9} ry={11} transform="rotate(-12 32 27)" />
          <Ellipse cx={33} cy={26} rx={3.5} ry={6} fill={ink} />
          <Path d="M16 17 13 12M25 13 24 7M38 12 40 6M48 17 53 12M20 37 17 41M44 36 47 40" />
          <Circle cx={35} cy={23} r={1.3} fill={focused ? colors.text : colors.background} stroke="none" />
        </> : name === 'clubs' ? <>
          <Path d="M31 19C18 4 5 19 16 32 26 44 39 33 34 23 27 11 16 27 28 37 41 49 56 35 49 24 43 14 34 18 31 28" />
          <Path d="M28 18C38 4 54 11 49 24M16 32C13 20 25 17 31 26M37 37C43 39 49 33 46 28" />
          <Path d="M11 9 12 4M7 7 16 7M54 40 56 45M52 44 59 41" />
        </> : name === 'messages' ? <>
          <Path d="M10 15 49 11 54 37 14 42Z" />
          <Path d="M11 16 32 29 49 12M15 40 26 27M51 36 38 26" />
          <Path d="M40 8 42 2 45 7 51 8 46 11 44 17 41 12 36 11Z" fill={focused ? colors.accentSolid : colors.background} />
          <Path d="M8 24 3 25M9 30 5 31" />
        </> : <>
          <Path d="M20 42C9 33 12 13 25 8 40 2 53 13 51 28 50 42 36 49 20 42Z" />
          <Path d="M21 40 24 34 29 32 27 27C22 25 21 21 23 17 25 12 32 11 36 14L38 19 43 24 38 26 37 32 33 34 35 41" fill={focused ? colors.accentSolid : 'none'} />
          <Path d="M23 17C28 18 30 13 32 12M31 21 34 20M36 28 39 28" />
          <Path d="M8 11 7 5M4 8 11 7M54 40 59 43" />
        </>}
      </G>
      {focused ? <Path d="m20 49 23-1" stroke={colors.accent} strokeWidth={2} strokeLinecap="round" /> : null}
    </Svg>
  </View>;
});

const styles = StyleSheet.create({ frame: { alignItems: 'center', justifyContent: 'center', width: 58, height: 48 } });
