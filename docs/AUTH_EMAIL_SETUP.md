# Yappie account email setup

## Current status

Resend is connected through OAuth. The sending domain `auth.yappie.site` was
created on 2026-10-24 in `eu-west-1`, with sending enabled, receiving disabled,
and open/click tracking disabled. The domain and all four provider DNS records
are now `verified` in Resend.

Domain dashboard:
https://resend.com/domains/3e7ede3e-c9c1-4623-b8f5-1a121bff8110

The five DNS records below have been saved in Cloudflare through the signed-in
Brave session. The operator saved the restricted sending credential into the
live Supabase SMTP configuration; the dashboard now confirms that a password is
stored. The sender is Yappie at `verify@auth.yappie.site` through Resend on port
465. No delivery tests, previews, screenshots, or app builds have been run.

Six branded authentication templates have been applied in Supabase Auth:
confirmation, recovery, email change, magic link, invitation, and reauthentication.
Their deployable HTML is in `supabase/templates/`, with subjects and dashboard
slugs in `manifest.json`. Regenerate the source with
`node scripts/render-auth-emails.cjs`; this does not deploy or send email.

The approved logo was uploaded as `avatars/yappie-mark.png` in the existing
public image bucket. The templates reference its public storage URL. Bucket
permissions were not changed.

## Cloudflare DNS

These records were added manually in the `yappie.site` Cloudflare zone. The
automatic setup option was not present in this account. Names below are
relative to that zone; TTL is Auto.

| Type | Name | Content | Priority |
| --- | --- | --- | --- |
| TXT | `resend._domainkey.auth` | Public DKIM key below | — |
| MX | `send.auth` | `feedback-smtp.eu-west-1.amazonses.com` | 10 |
| TXT | `send.auth` | `v=spf1 include:amazonses.com ~all` | — |
| CNAME | `rsend.auth` | `send.forge.rmta.net` | — |
| TXT | `_dmarc.auth` | `v=DMARC1; p=none;` | — |

Keep the CNAME DNS only, with Cloudflare proxying disabled.

Public DKIM key (not a secret):

```text
p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQCs0Vkfq7eDIydlDJf4ZNBE+rEqJV4IDyyDhoY7nAnIiR0XLwTvL7l6M08ZNTMvLx5c9X3bw+Fp/WMt+WneokbLb7/tIZgrbEiaLLRmRNPH5zh5CwUYeEAHFQCFbTblcnF9Xpb9h3KMMRdLtTL4gO99ZJ7FkC5fw3vy3ucJ8zeTTQIDAQAB
```

An initial DMARC TXT record `v=DMARC1; p=none;` was added at
`_dmarc.auth.yappie.site`. No reporting mailbox is specified because no receiving
mailbox has been configured. Tighten the policy only after the deferred delivery
checks pass.

## Saved Supabase SMTP configuration

| Setting | Value |
| --- | --- |
| Sender name | `Yappie` |
| Sender address | `verify@auth.yappie.site` |
| SMTP host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | Sending-only Resend API key restricted to `auth.yappie.site` |

Store the sending key only in Supabase's SMTP settings or operator secret
storage. Never put it in Expo public environment variables, app code, tracked
files, or chat. Do not create a key until it can be saved to its destination.
Keep email confirmation enabled.

The existing app uses confirmation and password-reset links. Moving to in-app
codes requires corresponding app UI and auth handling before changing live
templates to code-only emails. A Resend template ID is not used by Supabase's
SMTP transport: configure those templates in Supabase Auth itself.

## Remaining work

1. Sender and email design now use Yappie branding. The current app still uses
   confirmation/password-reset links, so their underlying destination is the
   Supabase auth domain. Removing that visible browser URL requires the matching
   in-app verification-code flow or a branded authentication endpoint; neither
   has been implemented by this SMTP setup. Do not replace links with code-only
   templates while the installed app still requires links.
2. When the user authorizes final validation, check real signup and password
   recovery delivery, authentication, expiry, resend behavior, and narrow-width
   UI before the combined app build.

References:
- https://resend.com/setup.md
- https://resend.com/docs/guides/dns/cloudflare
- https://resend.com/docs/send-with-supabase-smtp
- https://resend.com/docs/dashboard/domains/dmarc
