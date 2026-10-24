import { InkDrawing, PaperSurface, type InkMotif } from './InkArtwork';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, View } from 'react-native';

import { giftPresentation } from '@/features/gifts/presentation';

export function GiftArtwork({ animated = false, slug, size = 72 }: { animated?: boolean; slug: string; size?: number }) {
  const gift = giftPresentation(slug);
  const motion = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const unit = size / 72;
  const [reduceMotion, setReduceMotion] = useState(true);

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (active) setReduceMotion(enabled);
    }).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => { active = false; subscription.remove(); };
  }, []);

  useEffect(() => {
    if (!animated || reduceMotion) {
      motion.setValue(0);
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(Animated.parallel([
      Animated.sequence([
        Animated.timing(motion, { duration: 850, easing: Easing.inOut(Easing.quad), toValue: 1, useNativeDriver: true }),
        Animated.timing(motion, { duration: 850, easing: Easing.inOut(Easing.quad), toValue: 0, useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.timing(pulse, { duration: 550, easing: Easing.out(Easing.back(1.6)), toValue: 1, useNativeDriver: true }),
        Animated.timing(pulse, { duration: 900, easing: Easing.inOut(Easing.quad), toValue: 0, useNativeDriver: true }),
      ]),
    ]));
    loop.start();
    return () => loop.stop();
  }, [animated, motion, pulse, reduceMotion]);
  const floatY = motion.interpolate({ inputRange: [0, 1], outputRange: [2 * unit, -4 * unit] });
  const rotate = motion.interpolate({ inputRange: [0, 1], outputRange: ['-4deg', '5deg'] });
  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.1] });
  const motifs: Record<string, InkMotif> = { rose:'flower', coffee:'coffee', heart:'heart', fire:'spark', crown:'crown', bumper:'rocket', halloween_pumpkin:'pumpkin', halloween_ghost:'ghost', christmas_card:'letter', santa_surprise:'gift', winter_jacket:'coat', summer_beach_ball:'ball', summer_sunglasses:'shades' };
  return <View accessibilityLabel={gift.label.toLowerCase() + ' gift'} accessibilityRole="image" style={{height:size,width:size,alignItems:'center',justifyContent:'center'}}>
    <PaperSurface variant="oval" color={gift.background} ink={gift.accent} />
    <Animated.View style={{transform:[{translateY:floatY},{rotate},{scale}]}}><InkDrawing motif={motifs[slug] || 'gift'} size={size * 0.83} color={gift.accent} /></Animated.View>
  </View>;
}
