import { createClient } from 'npm:@supabase/supabase-js@2.112.3';

// Invoke from a server scheduler using a separate secret, never an app token.
Deno.serve(async request => {
  const secret = Deno.env.get('NOTIFICATION_WORKER_SECRET');
  if (!secret || request.headers.get('Authorization') !== `Bearer ${secret}`) return new Response('Unauthorized', {status:401});
  if (request.method !== 'POST') return new Response('Method not allowed',{status:405});
  const admin = createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const expoHeaders: Record<string,string> = {'Content-Type':'application/json'};
  const accessToken = Deno.env.get('EXPO_ACCESS_TOKEN');
  if (accessToken) expoHeaders.Authorization = `Bearer ${accessToken}`;
  const finish = async (id: string,outcome: string,ticket?: string) => {
    const {error} = await admin.rpc('finish_notification_job',{job_id:id,outcome,expo_ticket:ticket});
    if (error) throw error;
  };
  try {
    const {error:pruneError}=await admin.rpc('prune_engagement_data');
    if(pruneError) throw pruneError;
    const {error:reminderError}=await admin.rpc('enqueue_club_reminders');
    if(reminderError) throw reminderError;
    const {data:receipts,error:receiptError} = await admin.rpc('notification_receipts_due');
    if (receiptError) throw receiptError;
    if (receipts?.length) {
      const response = await fetch('https://exp.host/--/api/v2/push/getReceipts',{method:'POST',headers:expoHeaders,body:JSON.stringify({ids:receipts.map(r => r.ticket_id)}),signal:AbortSignal.timeout(15_000)});
      if (response.ok) {
        const {data} = await response.json();
        for (const receipt of receipts) {
          const result = data?.[receipt.ticket_id];
          if (result) await finish(receipt.job_id,result.status==='ok' ? 'delivered' : result.details?.error==='DeviceNotRegistered' ? 'invalid_token' : 'failed');
        }
      }
    }
    const {data:jobs,error} = await admin.rpc('claim_notification_jobs');
    if (error) throw error;
    if (!jobs?.length) return Response.json({sent:0});
    const descriptions: Record<string,string> = {message:'You have a new message.',post_reply:'Someone replied to your conversation.',post_like:'Your post has new likes.',follow:'You have a new follower.',club_reminder:'A club session is starting soon.'};
    const messages = jobs.map(job => ({to:job.push_token,title:'YAPPIE',body:job.preview || descriptions[job.kind] || 'You have new activity.',sound:'default',channelId:'conversations',
      data:{url:job.kind==='message' ? `/messages/${job.target_id}` : job.kind==='follow' ? `/people/${job.actor_id}` : job.kind==='club_reminder' ? `/clubs/${job.target_id}` : `/post/${job.target_id}`,jobId:job.job_id}}));
    let response: Response;
    try { response=await fetch('https://exp.host/--/api/v2/push/send',{method:'POST',headers:expoHeaders,body:JSON.stringify(messages),signal:AbortSignal.timeout(15_000)}); }
    catch { for (const job of jobs) await finish(job.job_id,'retry'); return Response.json({retry:jobs.length}, {status:503}); }
    if (!response.ok) {
      for (const job of jobs) await finish(job.job_id,response.status===429 || response.status>=500 ? 'retry' : 'failed');
      return Response.json({error:'Push provider unavailable'},{status:502});
    }
    const payload=await response.json();
    for (let index=0;index<jobs.length;index++) {
      const ticket=payload.data?.[index];
      await finish(jobs[index].job_id,ticket?.status==='ok' && ticket.id ? 'ticket' : ticket?.details?.error==='DeviceNotRegistered' ? 'invalid_token' : ticket?.details?.error==='MessageRateExceeded' || !ticket ? 'retry' : 'failed',ticket?.id);
    }
    return Response.json({processed:jobs.length});
  } catch {
    // No message bodies, device tokens, or credentials in logs/responses.
    return Response.json({error:'Notification delivery failed'},{status:500});
  }
});
