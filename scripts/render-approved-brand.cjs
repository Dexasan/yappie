/** Production asset preparation for the approved raster logo; no app build or validation. */
const fs = require('node:fs');
const path = require('node:path');
const sharp = require(process.argv[2] || 'sharp');
const directory = path.resolve(__dirname, '../assets/brand');
const master = fs.readFileSync(path.join(directory, 'yappie-master-transparent.png'));
const image = `data:image/png;base64,${master.toString('base64')}`;
const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">${body}</svg>`;
const render = (name, body) => sharp(Buffer.from(svg(body))).png().toFile(path.join(directory, name));

async function main() {
  // A portable SVG wrapper preserves the approved raster artwork without tracing/redrawing.
  fs.writeFileSync(path.join(directory, 'yappie-mark.svg'), svg(`<image href="${image}" width="1024" height="1024"/>`));
  await sharp(master).resize(1024, 1024).png().toFile(path.join(directory, 'yappie-mark.png'));
  await sharp(path.join(directory, 'yappie-logo-source.png')).resize(1024, 1024).flatten({background:'#111110'}).png().toFile(path.join(directory, 'yappie-icon.png'));
  // A central 440px square fits entirely within Android's 66/108 circular safe area.
  const foreground = `<image href="${image}" x="292" y="292" width="440" height="440"/>`;
  await render('yappie-adaptive-foreground.png', foreground);
  await render('yappie-monochrome.png', `<defs><mask id="logo" style="mask-type:alpha" maskUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024">${foreground}</mask></defs><rect width="1024" height="1024" fill="white" mask="url(#logo)"/>`);
  fs.copyFileSync(path.join(directory, 'yappie-mark.png'), path.join(directory, 'yappie-logo-transparent.png'));
  console.log('Prepared the approved mouth logo, splash mark, and platform icon assets.');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
