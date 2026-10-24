// Operator-only integration check; creates and removes its own test accounts.
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {randomUUID}=require('node:crypto');
const path=require('node:path');
const fs=require('node:fs');
const {createClient}=require('@supabase/supabase-js');
const cli=path.resolve('node_modules/.pnpm/supabase@2.114.0/node_modules/supabase/dist/supabase.js');
async function main(){
  const project=fs.readFileSync('supabase/.temp/project-ref','utf8').trim();
  const keys=JSON.parse(execFileSync(process.execPath,[cli,'projects','api-keys','--project-ref',project],{encoding:'utf8',stdio:['ignore','pipe','pipe']})).keys;
  const url=`https://${project}.supabase.co`;
  const anon=keys.find(k=>k.name==='anon').api_key;
  const admin=createClient(url,keys.find(k=>k.name==='service_role').api_key,{auth:{persistSession:false,autoRefreshToken:false}});
  const ids=[];let postId,clubId,conversationId;
  const ok=async promise=>{const {data,error}=await promise;if(error)throw new Error(error.message);return data;};
  const rpc=(client,name,args)=>ok(client.rpc(name,args));
  try{
    const accounts=[];
    for(const label of ['reader','author']){
      const suffix=randomUUID();const email=`engagement-${label}-${suffix}@example.com`;const password=`Test-${suffix}!8`;
      const created=await ok(admin.auth.admin.createUser({email,password,email_confirm:true}));ids.push(created.user.id);
      await ok(admin.from('profiles').update({display_name:'Engagement test',handle:`test_${suffix.replaceAll('-','').slice(0,12)}`,country_code:'DE',languages:['English']}).eq('id',created.user.id));
      await ok(admin.from('user_settings').update({date_of_birth:'1990-01-01',age_verified_at:new Date().toISOString(),terms_accepted_at:new Date().toISOString(),community_guidelines_accepted_at:new Date().toISOString(),onboarding_completed_at:new Date().toISOString()}).eq('id',created.user.id));
      const client=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}});
      await ok(client.auth.signInWithPassword({email,password}));accounts.push(client);
    }
    const [reader,author]=accounts;
    const post=await ok(admin.from('posts').insert({author_id:ids[1],body:'Temporary deployment check: music conversations',topic:'music'}).select('id').single());postId=post.id;
    let summary=(await rpc(reader,'get_engagement_summary'))[0];assert.equal(summary.global_new,true);
    const feed=await rpc(reader,'get_discover_feed',{feed_limit:100,snapshot_time:summary.checked_at});assert(feed.some(p=>p.post_id===postId));
    await rpc(reader,'acknowledge_feed',{feed_mode:'global',through_time:summary.checked_at});
    summary=(await rpc(reader,'get_engagement_summary'))[0];assert.equal(summary.global_new,false);
    await rpc(reader,'set_post_preference',{target_post_id:postId,preference_kind:'saved',enabled:true});
    assert((await rpc(reader,'list_saved_posts')).some(p=>p.post_id===postId));
    await rpc(reader,'set_post_preference',{target_post_id:postId,preference_kind:'hidden',enabled:true});
    assert(!(await rpc(reader,'get_discover_feed',{feed_limit:100})).some(p=>p.post_id===postId));
    assert((await reader.rpc('delete_own_content',{content_kind:'post',target_id:postId})).error);
    await ok(reader.from('post_likes').insert({post_id:postId,user_id:ids[0]}));
    assert((await rpc(author,'list_activity_events')).some(e=>e.actor_id===ids[0]));
    const prefs=await rpc(reader,'get_notification_preferences');assert.equal(prefs.previews,false);
    await rpc(reader,'set_notification_preferences',{preferences:{...prefs,quiet_start:22,quiet_end:8,timezone:'Europe/Berlin'}});
    assert.equal((await rpc(reader,'get_notification_preferences')).quiet_start,22);
    assert.equal(await rpc(reader,'is_moderator'),false);
    assert((await reader.rpc('list_moderation_reports')).error);
    assert((await reader.rpc('claim_notification_jobs')).error);
    await rpc(reader,'search_clubs',{club_query:'deployment-check-no-match',club_offset:0,only_joined:false});
    await rpc(reader,'record_app_event',{event_name:'session_start',surface:'app'});
    clubId=await rpc(author,'create_club',{club_name:'Temporary deployment check',club_description:'Temporary test club, removed after verification.',club_topic:'Music',member_rooms:true});
    const session=await rpc(author,'schedule_club_session',{target_club_id:clubId,session_title:'Deployment check',start_time:new Date(Date.now()+86400000).toISOString(),repeat_weekly:true,session_timezone:'Europe/Berlin'});
    assert((await reader.rpc('set_club_session_rsvp',{target_session_id:session,attending:true})).error);
    await rpc(author,'set_club_session_rsvp',{target_session_id:session,attending:true});
    assert((await rpc(author,'list_club_sessions',{target_club_id:clubId})).some(s=>s.session_id===session&&s.is_attending));
    await rpc(author,'cancel_club_session',{target_session_id:session});
    await ok(admin.from('follows').insert([{follower_id:ids[0],followed_id:ids[1]},{follower_id:ids[1],followed_id:ids[0]}]));
    conversationId=await rpc(reader,'get_or_create_direct_conversation',{other_user_id:ids[1]});
    assert.equal((await rpc(reader,'get_direct_conversation_partner',{target_conversation_id:conversationId}))[0].user_id,ids[1]);
    const message=await ok(author.from('messages').insert({conversation_id:conversationId,sender_id:ids[1],body:'Temporary deployment message'}).select('created_at').single());
    assert(Number((await rpc(reader,'get_engagement_summary'))[0].message_count)>0);
    await rpc(reader,'acknowledge_conversation',{target_conversation_id:conversationId,through_time:message.created_at});
    assert.equal(Number((await rpc(reader,'get_engagement_summary'))[0].message_count),0);
    await rpc(author,'delete_own_content',{content_kind:'post',target_id:postId});
    console.log('PASS: live authenticated badges, Discover, feed/DM read cursors, saved/hidden content, Activity, notification preferences, search, club scheduling/RSVP, analytics, and owner/moderator/worker authorization.');
  } finally {
    if(postId)await ok(admin.from('posts').delete().eq('id',postId));
    if(clubId)await ok(admin.from('clubs').delete().eq('id',clubId));
    if(conversationId)await ok(admin.from('conversations').delete().eq('id',conversationId));
    for(const id of ids)await ok(admin.auth.admin.deleteUser(id));
  }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});
