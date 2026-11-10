const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '../..');
const publicDir = path.join(__dirname, 'public');
const artwork = require('../../src/components/topic-artwork.json');

esbuild.buildSync({
  stdin: {
    contents: `export { matchInterestCatalog } from './src/features/quick-chat/interests';
      export { getTopicIconName } from './src/features/quick-chat/topic-icons';`,
    resolveDir: root,
  },
  bundle: true,
  format: 'esm',
  outfile: path.join(publicDir, 'chat-interest-catalog.js'),
  banner: { js: '// Generated from the mobile interest catalog by sync-chat-interests.cjs.' },
});

const symbols = Object.entries(artwork).map(([name, paths]) => [
  `  <symbol id="${name}" viewBox="-2 -2 28 28">`,
  '    <g fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">',
  ...paths.map((geometry) => `      <path d="${geometry}"/>`),
  '    </g>',
  '  </symbol>',
].join('\n'));
fs.writeFileSync(path.join(publicDir, 'assets/chat-topic-icons.svg'), [
  '<svg xmlns="http://www.w3.org/2000/svg">',
  '  <!-- Generated from the mobile topic artwork by sync-chat-interests.cjs. -->',
  ...symbols,
  '</svg>\n',
].join('\n'));
fs.copyFileSync(path.join(root, 'assets/topic-icons/LUCIDE-LAB-LICENSE.txt'), path.join(publicDir, 'assets/LUCIDE-LAB-LICENSE.txt'));
