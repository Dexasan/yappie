-- Run through the linked database CLI. All fixtures and writes roll back.
begin;
do $$
declare a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid := gen_random_uuid(); bot uuid := gen_random_uuid();
  p uuid := gen_random_uuid(); other_post uuid := gen_random_uuid(); parent uuid := gen_random_uuid();
begin
  insert into auth.users (id,email,raw_user_meta_data,raw_app_meta_data) values
    (a,a||'@qa.local','{"display_name":"QA Alice"}','{}'),
    (b,b||'@qa.local','{"display_name":"QA Brother"}','{}'),
    (c,c||'@qa.local','{"display_name":"QA Stranger"}','{}'),
    (bot,bot||'@example.com','{"display_name":"QA Robot"}','{"is_bot":true}');
  update public.user_settings set date_of_birth='1990-01-01',age_verified_at=now(),terms_accepted_at=now(),community_guidelines_accepted_at=now(),onboarding_completed_at=now()
    where id in (a,b,c,bot);
  insert into public.posts(id,author_id,body) values(p,a,'A test thread'),(other_post,c,'Another test thread');
  insert into public.replies(id,post_id,author_id,body) values(parent,p,b,'A comment from my brother');
  insert into public.follows(follower_id,followed_id) values(a,b),(a,bot);
  perform set_config('request.jwt.claim.sub',a::text,true);
  perform set_config('yappie.qa_alice',a::text,true);
  perform set_config('yappie.qa_brother',b::text,true);
  perform set_config('yappie.qa_parent',parent::text,true);
  perform set_config('yappie.qa_post',p::text,true);
  perform set_config('yappie.qa_other_post',other_post::text,true);
  assert (select count(*)=1 from public.search_message_profiles(null)), 'Blank picker must only include the followed real account';
  assert (select count(*)=0 from public.search_message_profiles('Q')), 'One-letter query must not enumerate accounts';
  assert (select count(*)=0 from public.search_message_profiles('%%')), 'Wildcards must be literal';
  assert (select count(*)=0 from public.search_message_profiles('Robot')), 'Bots must never appear in search';
  assert (select count(*)=1 from public.search_message_profiles('Stranger')), 'Deliberate name search must work';
  update public.user_settings set message_permission='following' where id=c;
  assert (select count(*)=0 from public.search_message_profiles('Stranger')), 'Message privacy must be enforced';
  insert into public.blocks(blocker_id,blocked_id) values(b,a);
  assert (select count(*)=0 from public.search_message_profiles('Brother')), 'Blocks must be enforced';
  delete from public.blocks where blocker_id=b and blocked_id=a;
end $$;

set local role authenticated;
do $$
declare a uuid := current_setting('yappie.qa_alice')::uuid; b uuid := current_setting('yappie.qa_brother')::uuid;
  p uuid := current_setting('yappie.qa_post')::uuid; parent uuid := current_setting('yappie.qa_parent')::uuid;
  child uuid; rejected boolean := false;
begin
  insert into public.replies(post_id,author_id,body,parent_reply_id) values(p,a,'Replying to your comment',parent) returning id into child;
  assert (select parent_reply_id=parent and parent_author_name='QA Brother' from public.get_post_replies_v2(p) where reply_id=child), 'Reply context must round-trip';
  assert (select count(*)=2 from public.get_post_replies(p)), 'Old APK reply RPC must still work';
  begin
    insert into public.replies(post_id,author_id,body,parent_reply_id) values(current_setting('yappie.qa_other_post')::uuid,a,'Wrong thread',parent);
  exception when check_violation then rejected := true;
  end;
  assert rejected, 'Cross-post reply must be rejected';
  perform set_config('request.jwt.claim.sub',b::text,true);
  assert (select count(*)=1 from public.activity_events where recipient_id=b and source_id=child), 'Parent author must receive exactly one notification';
  perform set_config('yappie.qa_child',child::text,true);
end $$;
reset role;
update public.replies set deleted_at=now() where id=current_setting('yappie.qa_parent')::uuid;
set local role authenticated;
do $$
declare a uuid := current_setting('yappie.qa_alice')::uuid; p uuid := current_setting('yappie.qa_post')::uuid;
  parent uuid := current_setting('yappie.qa_parent')::uuid; child uuid := current_setting('yappie.qa_child')::uuid; rejected boolean := false;
begin
  perform set_config('request.jwt.claim.sub',a::text,true);
  assert (select parent_body_preview is null from public.get_post_replies_v2(p) where reply_id=child), 'Deleted parent text must not leak';
  rejected := false;
  begin
    insert into public.replies(post_id,author_id,body,parent_reply_id) values(p,a,'Deleted target',parent);
  exception when check_violation then rejected := true;
  end;
  assert rejected, 'Reply to deleted comment must be rejected';
end $$;
reset role;
rollback;
