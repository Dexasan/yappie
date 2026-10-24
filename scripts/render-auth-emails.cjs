// Generate deployable email source, not a preview or delivery test.
// Palette follows src/theme/tokens.ts; artwork is the approved Yappie mouth.
const fs = require('node:fs');
const path = require('node:path');

const destination = path.resolve(__dirname, '../supabase/templates');
const logo = 'https://fzpehebwhsfrrgdugxpr.supabase.co/storage/v1/object/public/avatars/yappie-mark.png';
const definitions = [
  { key: 'confirmation', slug: 'confirm-sign-up', subject: 'Confirm your Yappie email', title: 'CONFIRM YOUR EMAIL',
    copy: 'Confirm your email address to finish creating your Yappie account.', action: 'CONFIRM EMAIL',
    safety: 'If you did not sign up for Yappie, you can ignore this email.' },
  { key: 'recovery', slug: 'reset-password', subject: 'Reset your Yappie password', title: 'RESET YOUR PASSWORD',
    copy: 'Use the link below to choose a new password for your Yappie account.', action: 'RESET PASSWORD',
    safety: 'If you did not request a password reset, ignore this email. Your password will stay the same.' },
  { key: 'email_change', slug: 'change-email-address', subject: 'Confirm your Yappie email change', title: 'CONFIRM EMAIL CHANGE',
    copy: 'Confirm this email address to complete the email change for your Yappie account.', action: 'CONFIRM EMAIL CHANGE',
    safety: 'If you did not request this change, do not confirm it. Open Yappie and review your account settings.' },
  { key: 'magic_link', slug: 'magic-link-or-otp', subject: 'Your Yappie sign-in link', title: 'SIGN IN TO YAPPIE',
    copy: 'Use this one-time link to sign in to your Yappie account.', action: 'SIGN IN',
    safety: 'If you did not request this sign-in link, you can ignore this email.' },
  { key: 'invite', slug: 'invite-user', subject: 'Your invitation to Yappie', title: 'JOIN YAPPIE',
    copy: 'You have been invited to create a Yappie account. Use the link below to accept.', action: 'ACCEPT INVITATION',
    safety: 'If you were not expecting this invitation, you can ignore this email.' },
  { key: 'reauthentication', slug: 'reauthentication', subject: 'Your Yappie verification code', title: 'VERIFY IT IS YOU',
    copy: 'Enter this code in Yappie to confirm your identity before continuing.', code: true,
    safety: 'Do not share this code. If you did not request it, you can ignore this email.' },
];

function email(item) {
  const action = item.code
    ? `<td bgcolor="#111110" style="background-color:#111110;padding-top:20px;padding-bottom:20px;padding-left:12px;padding-right:12px;text-align:center;"><p style="margin-top:0;margin-bottom:0;font-family:'Courier New',monospace;font-size:28px;line-height:38px;letter-spacing:3px;color:#F1EBDD;word-break:break-all;">{{ .Token }}</p></td>`
    : `<td bgcolor="#BF3826" style="background-color:#BF3826;text-align:center;"><a href="{{ .ConfirmationURL }}" style="display:block;padding-top:17px;padding-bottom:17px;padding-left:16px;padding-right:16px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;font-weight:bold;letter-spacing:1px;color:#FFF9ED;text-decoration:none;">${item.action}</a></td>`;
  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta http-equiv="X-UA-Compatible" content="IE=edge"><title>${item.subject}</title></head>
<body style="margin-top:0;margin-bottom:0;margin-left:0;margin-right:0;background-color:#111110;color:#F1EBDD;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#111110" style="background-color:#111110;"><tr><td align="center" style="padding-top:32px;padding-bottom:32px;padding-left:16px;padding-right:16px;">
<!--[if mso]><table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
<tr><td align="center" style="padding-bottom:24px;"><img src="${logo}" width="96" height="96" border="0" alt="Yappie" style="display:block;width:96px;height:96px;border-width:0;"><p style="margin-top:8px;margin-bottom:0;font-family:Impact,'Arial Narrow',Arial,sans-serif;font-size:28px;line-height:34px;letter-spacing:3px;font-weight:bold;color:#F1EBDD;">YAPPIE</p></td></tr>
<tr><td bgcolor="#F1EBDD" style="background-color:#F1EBDD;border-top-width:5px;border-top-style:solid;border-top-color:#BF3826;padding-top:30px;padding-bottom:30px;padding-left:24px;padding-right:24px;">
<h1 style="margin-top:0;margin-bottom:18px;font-family:Impact,'Arial Narrow',Arial,sans-serif;font-size:36px;line-height:40px;font-weight:bold;letter-spacing:0px;color:#111110;">${item.title}</h1>
<p style="margin-top:0;margin-bottom:26px;font-family:Georgia,'Times New Roman',serif;font-size:19px;line-height:29px;color:#30302B;">${item.copy}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${action}</tr></table>
<p style="margin-top:22px;margin-bottom:0;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:21px;color:#383832;">${item.code ? 'This code can only be used once.' : 'This link can only be used once. Open it on the device where you use Yappie.'}</p>
</td></tr>
<tr><td style="padding-top:22px;padding-left:8px;padding-right:8px;"><p style="margin-top:0;margin-bottom:12px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:21px;color:#BCB7AB;">${item.safety}</p><p style="margin-top:0;margin-bottom:0;font-family:Georgia,'Times New Roman',serif;font-size:14px;line-height:22px;font-style:italic;color:#9E9A8E;">Yappie account security</p></td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>
</body></html>
`;
}

fs.mkdirSync(destination, { recursive: true });
for (const item of definitions) fs.writeFileSync(path.join(destination, `${item.key}.html`), email(item));
fs.writeFileSync(path.join(destination, 'manifest.json'), JSON.stringify(definitions.map(({key,slug,subject}) => ({key,slug,subject,file:`${key}.html`})), null, 2) + '\n');
console.log('Wrote six Yappie authentication email source templates. No emails sent.');
