const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');
const root = path.resolve(__dirname, '..');
const outfile = path.join(root, 'dist/topic-icons/verify-bundle.cjs');
fs.mkdirSync(path.dirname(outfile), { recursive: true });
esbuild.buildSync({ stdin: { contents: `export * from './src/features/quick-chat/topic-icons'; export * from './src/features/quick-chat/interests';`, resolveDir: root }, outfile, bundle: true, platform: 'node', format: 'cjs' });
const { getTopicIconName, topicIconMap, matchInterestCatalog } = require(outfile);
const glyphs = require('../src/components/topic-artwork.json');
assert.deepEqual(Object.keys(topicIconMap).sort(), [...matchInterestCatalog].sort(), 'Every catalog label must have deliberate artwork');
for (const label of matchInterestCatalog) {
  const icon = getTopicIconName(label);
  assert.ok(icon && glyphs[icon]?.length, `Missing artwork for ${label}`);
  assert.doesNotMatch(icon, /^(star|spark|sparkle|sparkles)$/, `Generic star assigned to ${label}`);
}
for (const [label, expected] of Object.entries({
  Football: 'lab-soccer-ball', Soccer: 'lab-soccer-ball', 'American football': 'lab-football',
  Photography: 'camera', 'Film photography': 'camera', 'Fashion photography': 'camera',
  'Rock climbing': 'mountain', Rock: 'guitar', 'Hip-hop': 'headphones',
  'K-POP': 'headphones', AI: 'bot', Art: 'palette', '  photography  ': 'camera',
  'Deep talks': 'messages-square', 'Knitting tiny hats': 'spool',
  'Street photography at night': 'camera', 'Weekend football': 'lab-soccer-ball',
})) assert.equal(getTopicIconName(label), expected, label);
assert.notEqual(getTopicIconName('Football'), getTopicIconName('Basketball'));
assert.notEqual(getTopicIconName('Photography'), getTopicIconName('Movies'));
assert.equal(getTopicIconName('Quantum tea dragons'), null, 'Unknown custom labels use the personalized stamp');
assert.equal(getTopicIconName(''), null);
console.log(`${matchInterestCatalog.length} topics covered; ${Object.keys(glyphs).length} distinct glyphs; aliases and semantic overlaps verified.`);
