# Yappie UI consistency

New features must ship with UI that matches the existing app. Treat the current implementation as the visual reference; do not add plain links or generic cards as temporary feature UI.

- Reuse `src/theme/tokens.ts`, `Typography`, shared controls in `ui.tsx` / `EngagementUI.tsx`, and the original SVG ink artwork in `InkArtwork.tsx`.
- Preserve charcoal backgrounds, warm chalk text, vermilion accents, condensed display headings, serif/italic editorial copy, irregular paper surfaces, and illustrated controls.
- The approved logo is the vermilion-and-chalk talking-mouth artwork. Keep its silhouette and print texture; do not restore the rejected face seal or Y monogram. `assets/brand/yappie-logo-source.png` holds the approved charcoal-backed artwork and `yappie-master-transparent.png` its transparent production version.
- Use direct, functional copy. Labels should explain the feature or action; omit decorative slogans, redundant introductions, and vague metaphors. Preserve useful instructions, status messages, accessibility labels, and safety/privacy information.
- Keep matching as the initial experience. Yap's header has the illustrated Activity control, not a profile shortcut.
- Me's gear opens Settings; notification preferences belong there. Saved posts belong with Safety and Guidelines in Me's utility area.
- Check new screens and controls at narrow mobile widths as well as typical phone widths. Keep accessible names, touch targets, loading/error/empty states, and scrollable menus intact.

## Current implementation batch

The user is queuing additional changes before one combined build. Implement requested changes only. Do not run tests, type checks, previews, screenshots, exports, or APK builds until the user asks to validate/build the batch.
