# Yappie search visibility

Implemented on 23 November 2026. Spending for this work: EUR 0. Uses the
existing Cloudflare Worker and static asset hosting; no paid tools, advertising,
new billing products, or paid submissions were enabled.

## Search accounts and observed status

- Google Search Console: `https://yappie.site/` URL-prefix property, verified
  using the homepage HTML tag in the existing Dex account selected in the browser.
  The verification tag is present in both the active chat and closed-chat page.
  A backup HTML verification file is also included. Keep these ownership proofs.
- Google sitemap submission succeeded. Search Console showed **Success** and
  **7 discovered pages** on 23 November 2026.
- Before the homepage indexing request, Google's actual status was
  **Discovered - currently not indexed**; no last crawl was recorded.
- Google accepted **Request indexing** for `https://yappie.site/`. Its confirmation
  said the URL was added to a priority crawl queue. This confirms a request,
  not indexing or a ranking. Repeating the request does not improve queue priority.
- Bing Webmaster Tools: verified the same URL using the homepage `msvalidate.01`
  tag. The owner explicitly selected Dex (`sendmailtodex@gmail.com`) for Bing sign-in.
  Sitemap submitted; the portal showed **Processing**, one known sitemap,
  zero reported sitemap errors and zero reported sitemap warnings at submission.
- IndexNow: submitted the seven public URLs once. HTTP **202** means received
  with ownership validation pending. It does not establish indexing. IndexNow
  reaches participating engines; it does not replace Google Search Console.
- Google and Bing's new-property reports were still collecting data. No ranking,
  search impression, click, or conversion improvement has yet been demonstrated.

Open the reports:

- [Google Search Console](https://search.google.com/search-console?resource_id=https%3A%2F%2Fyappie.site%2F)
- [Google sitemaps](https://search.google.com/search-console/sitemaps?resource_id=https%3A%2F%2Fyappie.site%2F)
- [Bing Webmaster Tools](https://www.bing.com/webmasters?siteUrl=https%3A%2F%2Fyappie.site%2F)

## Published changes

- Kept matching as the initial experience, using the existing charcoal, chalk,
  vermilion, fonts, mouth logo, and SVG ink illustrations.
- Added an accurate title and description for free stranger text chat, social
  metadata, favicon, and a preload for the existing display font.
- Added WebSite, Organization, and WebApplication structured data. No invented
  ratings, reviews, user counts, or search results are included.
- Added visible, server-delivered how-to and FAQ content below the matching
  controls. The chat API and private messages are not used as indexable content.
  The explanatory section is hidden during conversations and in the Android embed.
- Added `/conversation-starters`, `/chat-safety`, and `/about` with useful,
  distinct content and internal links. Added Article metadata to the two guides.
- Added titles/descriptions/canonicals where missing on supporting pages and
  useful browser-chat help to Support. Removed the closed-page voice promotion.
- Consolidated `/chat`, `/chat/`, `/chat.html`, and `/index.html` to `/` with
  permanent redirects. Public canonical routes redirect HTTP to HTTPS.
- Expanded `sitemap.xml` to seven canonical public URLs with accurate change dates.
- Kept public crawling open while excluding API and email-action paths from
  robots.txt. Private app entry and auth responses retain their noindex headers.
- Added a proper 404 response page with noindex to avoid treating missing pages
  as valid landing pages.

## Deployment and evidence

The first SEO deployment was Cloudflare Worker version
`6feca19a-418f-4615-baf3-55af1c58fd7e`; final version
`f39ac452-4cbe-4ab8-baec-bf4b0de2ee62` adds HTTPS redirects.
The previous live version was `60a9f1c2-a3df-4650-9fb2-e5ab3c98eac2`.
The current production source map was read before publication: the app admission
and shared matching modules matched the local source, and the existing browser
JavaScript assets matched production. Only SEO changes were added to that web code.
Existing Android and other working-tree changes were left in place.

Live HTTP reads confirmed that the homepage and guides return 200, declare their
canonical URLs, and have no noindex directive; duplicate matching routes return
308; unknown pages return 404 with noindex; the private app entry denies an
unauthenticated request with 401 and noindex.
Final HTTP reads confirmed 308 redirects to HTTPS for the homepage, a guide,
and the sitemap, with the HTTPS homepage still serving the matching form and
both webmaster verification tags.

Per the queued-batch instruction, no test suites, TypeScript checks, local previews,
screenshots, exports, or Android builds were run. Mobile visual and interaction
validation remains part of the requested future batch validation. The web Worker
was published and the search portals confirmed the submissions described above.

## Updating the site without paid tooling

After publishing a meaningful content change, update the affected sitemap lastmod
date, then run from the repository root:

```powershell
node scripts/submit-yappie-indexnow.mjs
```

The script reads the live ownership file and sitemap before sending the listed
URLs to IndexNow. Its output distinguishes received requests from confirmed indexing.
The key file is an intentionally public ownership proof, not an account credential.
There is no scheduled job and no recurring submission loop.

Keep Google and Bing's sitemap registrations; they can read changes without a
manual resubmission on every deployment. Request indexing manually for an important
new or substantially changed page when appropriate; do not submit the same URL
repeatedly to try to boost rankings. Do not use Google's restricted Indexing API
for these ordinary chat pages or the retired sitemap ping endpoints.

## What still determines results

Indexing is a prerequisite, not a promise of the first result for “chat with
strangers”. Once reports populate, use actual impressions, queries, clicks,
index coverage, and average positions to decide the next content changes.
Check whether the homepage has been crawled before diagnosing a ranking problem.

The remaining acquisition work is ongoing: get real people to use Yappie, make
matching useful at quiet times, answer questions users actually ask, and earn
independent relevant mentions. No outreach, community posts, directory accounts,
or backlink purchases were made in this task. Do not manufacture user activity,
buy links, bulk-publish near-identical keyword pages, or repeat keywords unnaturally.
New content should help a visitor use or understand the service.

## Official references

- [Google SEO Starter Guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide)
- [Google ownership verification](https://support.google.com/webmasters/answer/9008080)
- [Google URL Inspection](https://support.google.com/webmasters/answer/9012289)
- [IndexNow protocol](https://www.indexnow.org/documentation)
- [Bing URL submission](https://www.bing.com/webmasters/help/url-submission-62f2860b)
