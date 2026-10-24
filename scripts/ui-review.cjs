/** Local-only visual review of real screens. All services are replaced at build time. */
const esbuild = require('esbuild');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const root = path.resolve(__dirname, '..');
const out = path.join(root, 'dist/ui-review');
fs.mkdirSync(path.join(out, 'assets'), { recursive: true });
fs.copyFileSync(path.join(root, 'assets/art/conversation-night-print.png'), path.join(out, 'assets/conversation-night-print.png'));
const fontFiles = [
  ['DMSans_400Regular', '@expo-google-fonts/dm-sans/400Regular/DM Sans_400Regular.ttf'],
  ['DMSans_500Medium', '@expo-google-fonts/dm-sans/500Medium/DM Sans_500Medium.ttf'],
  ['DMSans_700Bold', '@expo-google-fonts/dm-sans/700Bold/DM Sans_700Bold.ttf'],
  ['BarlowCondensed_700Bold', '@expo-google-fonts/barlow-condensed/700Bold/BarlowCondensed_700Bold.ttf'],
  ['InstrumentSerif_400Regular', '@expo-google-fonts/instrument-serif/400Regular/InstrumentSerif_400Regular.ttf'],
  ['InstrumentSerif_400Regular_Italic', '@expo-google-fonts/instrument-serif/400Regular_Italic/InstrumentSerif_400Regular_Italic.ttf'],
];
const css = fontFiles.map(([name, file]) => {
  const pkg = file.split('/').slice(0, 2).join('/');
  const dir = path.dirname(require.resolve(pkg + '/package.json'));
  const ttf = fs.readdirSync(path.join(dir, file.split('/')[2])).find(n => n.endsWith('.ttf'));
  fs.copyFileSync(path.join(dir, file.split('/')[2], ttf), path.join(out, 'assets', name + '.ttf'));
  return `@font-face{font-family:${name};src:url('/assets/${name}.ttf')}`;
}).join('\n');
fs.writeFileSync(path.join(out, 'index.html'), `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Yappie — UI review</title><style>${css}
*{box-sizing:border-box}html,body,#root{margin:0;width:100%;height:100%;background:#111110}button{cursor:pointer}#review-tools{position:fixed;top:0;left:0;bottom:0;width:240px;padding:32px 24px;background:#191917;color:#FFFCF5;font:14px DMSans_400Regular;overflow:auto}#review-tools h1{font:38px BarlowCondensed_700Bold;margin:0 0 8px}#review-tools a{display:block;padding:10px 0;color:inherit;text-decoration:none;border-bottom:1px solid #444}#phone{position:absolute;top:24px;left:calc(50% - 75px);width:390px;height:844px;max-height:calc(100vh - 48px);overflow:hidden;border:1px solid #383832;box-shadow:0 20px 70px #0002}#app{height:100%;display:flex;flex-direction:column}@media(max-width:700px){#review-tools{display:none}#phone{top:0;left:0;width:100%;height:100%;max-height:none;border:0;box-shadow:none}}</style></head><body><div id="review-tools"><h1>YAPPIE.</h1><p>Editorial UI review<br>Local sample data</p>${['quick-chat','feed','clubs','messages','profile','auth','chat','wallet','onboarding','settings','safety','guidelines','club-create','profile-edit'].map(s=>`<a href="/?screen=${s}">${s}</a>`).join('')}<p>States</p><a href="/?screen=messages&state=empty">Empty inbox</a><a href="/?screen=clubs&state=empty">Empty clubs</a><a href="/?screen=feed&state=error">Feed error</a><a href="/?screen=feed&state=loading">Feed loading</a></div><div id="phone"><div id="app"></div></div><script src="/review.js"></script></body></html>`);

const mockedModule = `import { fixture } from '${path.join(root, 'scripts/ui-review/fixtures.jsx').replaceAll('\\','/')}';`;
const plugin = {
  name: 'isolated-ui-review',
  setup(build) {
    build.onResolve({ filter: /^react-native$/ }, () => ({ path: require.resolve('react-native-web') }));
    build.onResolve({ filter: /^expo-router$/ }, () => ({ path: path.join(root, 'scripts/ui-review/router.jsx') }));
    build.onResolve({ filter: /^expo-constants$/ }, () => ({ path: 'constants', namespace: 'review-config' }));
    build.onLoad({ filter: /.*/, namespace: 'review-config' }, () => ({ contents: `export default { expoConfig: ${JSON.stringify(JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8')).expo)} };`, loader: 'js' }));
    build.onResolve({ filter: /^@\/context\/(SessionContext|CallContext|ActivityContext)$/ }, () => ({ path: path.join(root, 'scripts/ui-review/context.jsx') }));
    build.onResolve({ filter: /^@\/lib\/supabase$/ }, () => ({ path: 'supabase', namespace: 'mock' }));
    build.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: 'export const isSupabaseConfigured = true; export const supabase = null;', loader: 'js' }));
    build.onResolve({ filter: /^@\/features\/.+\/(api|avatar|audio|preferences|sessions|moderation)$/ }, args => ({ path: path.join(root, 'src', args.path.slice(2) + '.ts'), namespace: 'fixture' }));
    build.onResolve({ filter: /^@\/features\/notifications\/device$/ }, () => ({path:path.join(root,'src/features/notifications/device.web.ts')}));
    build.onLoad({ filter: /.*/, namespace: 'fixture' }, args => {
      const source = fs.readFileSync(args.path, 'utf8');
      const names = [...source.matchAll(/export\s+(?:async\s+)?(?:function|const)\s+(\w+)/g)].map(m => m[1]);
      return { contents: mockedModule + names.map(n => `export const ${n} = (...args) => fixture('${n}', ...args);`).join('\n'), loader: 'js', resolveDir: root };
    });
    build.onLoad({ filter: /\.png$/ }, args => {
      const name = path.basename(args.path);
      const png = fs.readFileSync(args.path);
      fs.copyFileSync(args.path, path.join(out, 'assets', name));
      return { contents: `module.exports = { uri: '/assets/${name}', width: ${png.readUInt32BE(16)}, height: ${png.readUInt32BE(20)} };`, loader: 'js' };
    });
  },
};
(async () => {
  await esbuild.build({ entryPoints: [path.join(root, 'scripts/ui-review/index.jsx')], outfile: path.join(out, 'review.js'), bundle: true, platform: 'browser', resolveExtensions: ['.web.tsx','.tsx','.web.ts','.ts','.web.js','.js','.jsx','.json'], jsx: 'automatic', plugins: [plugin], define: { 'process.env.NODE_ENV': '"development"', __DEV__: 'true' }, loader: { '.ttf': 'file' }, logLevel: 'warning' });
  if (process.argv.includes('--build')) return;
  http.createServer((req, res) => {
    const requestPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const target = path.resolve(out, '.' + (requestPath === '/' ? '/index.html' : requestPath));
    if (!target.startsWith(out + path.sep) || !fs.existsSync(target)) { res.writeHead(404); res.end(); return; }
    const mime = { '.html':'text/html', '.js':'text/javascript', '.ttf':'font/ttf', '.png':'image/png' }[path.extname(target)];
    res.setHeader('Content-Type', mime || 'application/octet-stream');
    fs.createReadStream(target).pipe(res);
  }).listen(4173, '127.0.0.1', () => console.log('UI review: http://localhost:4173 (sample data; no backend connection)'));
})();
