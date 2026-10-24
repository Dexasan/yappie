// Operator-only deployment helper. Never writes a secret into tracked files or logs.
const {execFileSync} = require('node:child_process');
const {randomBytes} = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cli = path.resolve('node_modules/.pnpm/supabase@2.114.0/node_modules/supabase/dist/supabase.js');
function run(args) {
  try { return execFileSync(process.execPath,[cli,...args],{encoding:'utf8',stdio:['ignore','pipe','pipe']}); }
  catch { throw new Error(`Supabase ${args[0]} ${args[1]} failed; inspect the project dashboard. Output omitted to protect credentials.`); }
}
const temp = fs.mkdtempSync(path.join(os.tmpdir(),'yappie-worker-'));
if(path.dirname(path.resolve(temp))!==path.resolve(os.tmpdir()) || !path.basename(temp).startsWith('yappie-worker-')) throw new Error('Unexpected temporary directory.');
function query(sql) {
  const file=path.join(temp,'setup.sql');fs.writeFileSync(file,sql,{mode:0o600});
  return JSON.parse(run(['db','query','--linked','--file',file])).rows;
}
async function main() {
  const project=fs.readFileSync('supabase/.temp/project-ref','utf8').trim();
  const name='yappie_notification_worker';
  const existing=query(`select decrypted_secret from vault.decrypted_secrets where name='${name}';`);
  const secret=existing[0]?.decrypted_secret || randomBytes(32).toString('hex');
  const envFile=path.join(temp,'worker.env');fs.writeFileSync(envFile,`NOTIFICATION_WORKER_SECRET=${secret}\n`,{mode:0o600});
  run(['secrets','set','--env-file',envFile]);
  if(!existing.length) query(`select vault.create_secret('${secret}','${name}','Yappie notification scheduler bearer secret') is not null as configured;`);
  query(`create extension if not exists pg_net with schema extensions;
    select cron.schedule('yappie-deliver-notifications','* * * * *', $job$
      select net.http_post(
        url := 'https://${project}.supabase.co/functions/v1/deliver-notifications',
        headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' ||
          (select decrypted_secret from vault.decrypted_secrets where name='${name}')),
        body := '{}'::jsonb, timeout_milliseconds := 60000);
    $job$) is not null as scheduled;`);
  const url=`https://${project}.supabase.co/functions/v1/deliver-notifications`;
  const denied=await fetch(url,{method:'POST',signal:AbortSignal.timeout(20000)});
  if(denied.status!==401) throw new Error(`Worker access guard returned ${denied.status}, expected 401.`);
  const response=await fetch(url,{method:'POST',headers:{Authorization:`Bearer ${secret}`},signal:AbortSignal.timeout(60000)});
  if(!response.ok) throw new Error(`Authenticated worker returned ${response.status}.`);
  console.log(`Worker secret stored in Vault and Edge secrets; every-minute cron enabled; unauthorized=401, authenticated=${response.status}.`);
}
main().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(()=>fs.rmSync(temp,{recursive:true,force:true}));
