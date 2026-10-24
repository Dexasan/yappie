# Yap topic artwork

The 500 catalog topics have explicit entries in
`src/features/quick-chat/topic-icons.ts`, referencing 161 local vector glyphs in
`src/components/topic-artwork.json`. Related subtopics share a relevant object;
no catalog topic uses a generic star fallback. Custom subjects use recognized
aliases or a letter stamp. Football uses a soccer ball; American/flag football
uses the oval ball. Photography takes priority in compound custom topics.

Sources reviewed on 9 September 2026:

- [Sketchyicons](https://sketchyicons.com/): selected for its irregular ink paths
  and broad topic coverage. Geometry derives from Lucide/Feather; full notices
  are retained in `SKETCHYICONS-NOTICE.txt`.
- [Lucide Lab](https://github.com/lucide-icons/lucide-lab): selected sports
  geometry, converted to equivalent paths on the same 24-unit grid and rendered
  with YAPPIE's ink color and rounded strokes. ISC notice retained.
- [Doodle Icons by Khushmeen](https://khushmeen.com/icons.html): reviewed as a
  CC0 alternative, but not included because it covered fewer of these topics.
- Skateboard artwork is original to YAPPIE.

`sources.json` pins the exact source commits and lists every imported icon.
Only static path data is bundled; icons make no network requests and add no
runtime package. `notices.json` embeds the complete notices in the native app's
Artwork Credits screen, accessible from the legal pages.

The same artwork is used in quick picks, autocomplete, and selected tags.
`node scripts/verify-topic-icons.cjs` checks catalog coverage, meaningful aliases,
and overlapping subjects. TypeScript also requires an entry for every new
catalog topic. `?screen=quick-chat&state=topics` in the local UI review shows
football, photography, gaming, AI, basketball, and cooking together.

These changes require a new APK to reach installed Android copies.
