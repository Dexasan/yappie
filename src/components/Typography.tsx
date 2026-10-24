import { createContext, forwardRef, useContext } from 'react';
import { StyleSheet, Text as NativeText, TextInput as NativeTextInput } from 'react-native';
import type { TextProps, TextInputProps, TextStyle, StyleProp } from 'react-native';
import { colors, fonts } from '@/theme/tokens';

const FontContext = createContext<TextStyle>({ fontFamily: fonts.body });

function resolveFont(style: StyleProp<TextStyle>, inherited: TextStyle = {}) {
  const flat = StyleSheet.flatten(style) ?? {};
  const weight = flat.fontWeight;
  const family = flat.fontFamily ?? (flat.fontStyle === 'italic'
    ? fonts.italic
    : weight ? (weight === 'bold' || Number(weight) >= 600 ? fonts.bold : Number(weight) >= 500 ? fonts.medium : fonts.body)
    : inherited.fontFamily ?? fonts.body);
  return { ...flat, fontFamily: family, fontWeight: 'normal' as const, fontStyle: 'normal' as const };
}

/** Bundled font faces on Android, iOS, and web, including nested accent text. */
export const Text = forwardRef<NativeText, TextProps>(function Text({ style, children, ...props }, ref) {
  const inherited = useContext(FontContext);
  const resolved = resolveFont(style, inherited);
  return <FontContext.Provider value={resolved}><NativeText {...props} ref={ref} style={resolved}>{children}</NativeText></FontContext.Provider>;
});

export const TextInput = forwardRef<NativeTextInput, TextInputProps>(function TextInput({ style, ...props }, ref) {
  return <NativeTextInput selectionColor={colors.accent} placeholderTextColor={colors.textSubtle} {...props} ref={ref} style={resolveFont(style)} />;
});
