const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

function imageSizeType(type) {
  const reactNativeMetro = require.resolve('@react-native/metro-config/package.json');
  const metro = require.resolve('metro/package.json', { paths: [path.dirname(reactNativeMetro)] });
  const imageSizePackage = require.resolve('image-size/package.json', { paths: [path.dirname(metro)] });
  return require(path.join(path.dirname(imageSizePackage), 'dist', 'types', `${type}.js`));
}

if (process.argv[2] === '--jxl-fixture') {
  const input = Buffer.alloc(16);
  input.writeUInt32BE(0, 0);
  input.write('jxlp', 4, 'ascii');
  assert.throws(() => imageSizeType('jxl').JXL.calculate(input));
  process.exit(0);
}

if (process.argv[2] === '--icns-fixture') {
  const input = Buffer.alloc(24);
  input.write('icns', 0, 'ascii');
  input.writeUInt32BE(input.length, 4);
  input.write('ICON', 8, 'ascii');
  input.writeUInt32BE(0, 12);
  assert.throws(() => imageSizeType('icns').ICNS.calculate(input), /Invalid ICNS entry length/);
  process.exit(0);
}

for (const fixture of ['--jxl-fixture', '--icns-fixture']) {
  const result = spawnSync(process.execPath, [__filename, fixture], {
    encoding: 'utf8',
    timeout: 1500,
  });
  assert.equal(result.error?.code, undefined, `${fixture} timed out; the parser can loop forever.`);
  assert.equal(result.status, 0, result.stderr || `${fixture} failed.`);
}

console.log('Patched image parser rejected zero-length ICNS and ISO BMFF boxes.');
