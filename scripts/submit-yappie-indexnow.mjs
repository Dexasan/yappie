// Notify IndexNow only after the matching public pages have been deployed.
// This ownership key is deliberately public, not an account credential.
const origin = 'https://yappie.site';
const key = '3f0dbecb087142f39bd4547dddf637e5';
const keyLocation = `${origin}/${key}.txt`;
const timeout = () => AbortSignal.timeout(20000);
const keyResponse = await fetch(keyLocation, { signal: timeout(), redirect: 'error' });
if (!keyResponse.ok || (await keyResponse.text()).trim() !== key) {
  throw new Error('Publish the IndexNow ownership file before submitting URLs.');
}
const sitemap = await fetch(`${origin}/sitemap.xml`, { signal: timeout(), redirect: 'error' });
if (!sitemap.ok) throw new Error(`Sitemap unavailable: HTTP ${sitemap.status}`);
const urlList = [...(await sitemap.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
if (!urlList.length || urlList.some(value => new URL(value).origin !== origin)) {
  throw new Error('Sitemap must contain public Yappie URLs only.');
}
const response = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ host: 'yappie.site', key, keyLocation, urlList }),
  signal: timeout(),
});
if (![200, 202].includes(response.status)) {
  throw new Error(`IndexNow rejected the submission: HTTP ${response.status} ${(await response.text()).slice(0, 500)}`);
}
console.log(JSON.stringify({ status: response.status, submittedUrls: urlList, meaning: response.status === 202 ? 'Received; ownership validation pending. This does not confirm indexing.' : 'Received. This does not confirm indexing or ranking.' }, null, 2));
