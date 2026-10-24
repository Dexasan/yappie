# Approved Yappie mouth logo

The user-approved mark is the vermilion-and-chalk talking-mouth artwork with a
screen-print texture on a charcoal background. Approval records the design
choice; the preceding similarity search did not establish trademark clearance.

## Sources and derived assets

- yappie-logo-source.png: the approved original, unchanged charcoal-backed image.
- yappie-master-transparent.png: background-extracted production artwork.
- yappie-mark.png: transparent in-app and splash artwork.
- yappie-mark.svg: a portable SVG wrapper embedding the transparent raster artwork;
  this is not an editable vector tracing.
- yappie-icon.png: opaque Android/iOS app icon from the approved original.
- yappie-adaptive-foreground.png: transparent Android foreground inside a central
  440px square, entirely within the circular safe area.
- yappie-monochrome.png: alpha-based themed Android icon.
- yappie-logo-transparent.png: compatibility alias for the in-app mark.

Run node scripts/render-brand.cjs with the path to a sharp module as its argument
to prepare the assets. The renderer consumes the approved PNG masters, so it
cannot regenerate a rejected monogram. Keep the original sources in this folder.

The existing BrandMark and app.json paths consume these assets across the app.
Launcher and splash updates will reach devices in the final combined native
build. Asset preparation is implementation only; no tests, app previews,
exports, or APK builds were run for this adoption.
