const now = new Date().toISOString();
const state = new URLSearchParams(location.search).get('state');
let posts = [
  {post_id:'1',author_id:'jules',author_display_name:'Jules',author_handle:'jules.wav',body:'Unpopular opinion: the walk home after a concert is part of the concert.',created_at:now,like_count:24,reply_count:8,liked_by_me:false},
  {post_id:'2',author_id:'mika',author_display_name:'Mika',author_handle:'mikaonfilm',body:'Tell me a tiny thing that made today feel less ordinary. I’ll go first: someone left flowers on the tram.',created_at:now,like_count:17,reply_count:12,liked_by_me:true},
  {post_id:'3',author_id:'sam',author_display_name:'Sam',author_handle:'sundayperson',body:'Looking for people who take their coffee seriously and themselves less seriously.',created_at:now,like_count:9,reply_count:3,liked_by_me:false},
];
posts.push(
  { ...posts[0], post_id:'4',author_id:'leo',author_display_name:'Leo',author_handle:'almostawake',body:'Anyone else collect hobbies instead of getting good at one?',like_count:6,reply_count:2 },
  { ...posts[0], post_id:'5',author_id:'nia',author_display_name:'Nia',author_handle:'niaincolour',body:'My camera roll is 80% interesting shadows. No regrets.',like_count:12,reply_count:5 },
  { ...posts[0], post_id:'6',author_id:'eli',author_display_name:'Eli',author_handle:'elioutside',body:'Found a tiny bookshop with a resident cat. I live there now.',like_count:31,reply_count:9 }
);
let clubs = [
  {club_id:'1',name:'After Hours',description:'For thoughts that show up late.',topic:'Late-night talks',member_count:128,is_member:true,live_room_id:'room',live_room_title:'What keeps you up?',live_listener_count:12,live_participant_count:12},
  {club_id:'2',name:'Off the Record',description:'A good song deserves company.',topic:'Music',member_count:86,is_member:false},
  {club_id:'3',name:'Plot Twist',description:'One more chapter.',topic:'Books & films',member_count:64,is_member:false},
  {club_id:'4',name:'Side Quests',description:'For the endlessly curious.',topic:'Everyday adventures',member_count:42,is_member:true},
];
let conversations = [
  {conversation_id:'1',partner_id:'jules',partner_display_name:'Jules',partner_handle:'jules.wav',partner_is_online:true,last_message_body:'Okay, but send me that playlist.',last_message_at:now,unread_count:2},
  {conversation_id:'2',partner_id:'mika',partner_display_name:'Mika',partner_handle:'mikaonfilm',partner_is_online:false,last_message_body:'Same time, same rabbit hole tomorrow?',last_message_at:now,unread_count:0},
  {conversation_id:'3',partner_id:'sam',partner_display_name:'Sam',partner_handle:'sundayperson',partner_is_online:true,last_message_body:'I knew you’d get it.',last_message_at:now,unread_count:0},
];
conversations.push(
  {...conversations[0],conversation_id:'4',partner_id:'nia',partner_display_name:'Nia',partner_handle:'niaincolour',last_message_body:'Sending you the address now.',unread_count:0},
  {...conversations[1],conversation_id:'5',partner_id:'eli',partner_display_name:'Eli',partner_handle:'elioutside',last_message_body:'That is exactly what I meant.'},
  {...conversations[1],conversation_id:'6',partner_id:'leo',partner_display_name:'Leo',partner_handle:'almostawake',last_message_body:'We should absolutely try that.'}
);
let replies = [{reply_id:'r1',author_id:'review-other',author_display_name:'Jules',body:'Especially when you’re still singing the encore.',created_at:now}];
let messages = [
  {id:'1',sender_id:'review-other',body:'Important question: what’s your walking-home song?',created_at:now},
  {id:'2',sender_id:'review-me',body:'Depends. Main character walk or missed-the-last-train walk?',created_at:now},
  {id:'3',sender_id:'review-other',body:'Both. Definitely both.',created_at:now},
];
export function fixture(name,...args) {
  if (name === 'useDirectCallAudio' || name === 'useClubRoomAudio') return { isConfigured:true, status:state === 'audio-error' ? 'error' : 'connected', isMuted:false, isSpeaker:false, retry:()=>{}, toggleSpeaker:()=>{}, isConnected:state !== 'audio-error', isConnecting:false, error:state === 'audio-error' ? 'No audio is arriving. Check your connection, then tap Retry audio.' : null, toggleMute:async()=>{}, connect:async()=>{}, disconnect:async()=>{} };
  if (name.startsWith('subscribe')) return () => {};
  if (name === 'clubAvatarPublicUrl') return '/assets/conversation-night-print.png';
  if (name.toLowerCase().includes('avatarpublicurl')) return null;
  if (name === 'giftCheckoutEnabled') return false;
  if (name === 'formatUsd') return '$' + (args[0]/100).toFixed(2);
  if (state === 'loading' && name.startsWith('load')) return new Promise(()=>{});
  if (state === 'error' && ['loadFeed','loadDiscoverFeed'].includes(name)) return Promise.reject(new Error('Could not load the feed. Check your connection.'));
  const values = {
    loadDiscoverFeed:posts.map((post,i)=>({...post,ranking_score:10-i})),loadPost:posts[0],
    loadEngagementSummary:{activity_count:3,message_count:2,global_new:true,following_new:false,checked_at:now},
    loadActivity:[{activity_id:'a',actor_id:'jules',actor_display_name:'Jules',kind:'post_reply',post_id:'1',post_body:posts[0].body,created_at:now,read_at:null},{activity_id:'b',actor_id:'mika',actor_display_name:'Mika',kind:'follow',created_at:now,read_at:null}],
    listSavedPosts:posts.slice(0,2),isModerator:false,
    loadNotificationPreferences:{messages:true,replies:true,likes_follows:false,club_reminders:true,previews:false,quiet_start:null,quiet_end:null,timezone:'Europe/Berlin'},
    listClubSessions:[{session_id:'review-session',title:'Albums that changed your life',starts_at:new Date(Date.now()+86400000).toISOString(),weekly:true,host_id:'review-other',is_attending:false}],
    listModerationReports:[{report_id:'review-report',target_kind:'post',category:'spam',status:'open',details:'Reported post from its content menu',content_preview:'Example reported content'}],
    loadFeed:posts,loadFollowingFeed:posts.slice(0,1),loadClubs:clubs,listDirectConversations:conversations,
    loadTrendingMatchInterests:(state === 'topics' ? ['Football','Photography','Gaming','AI','Basketball','Cooking'] : ['Music','Cinema','Art','Deep talks','Travel','Books']).map(label=>({label})),
    loadQuickChatMatchingCount:12,listAvailableCallers:[],joinQuickChat:{match_status:'queued'},
    loadOwnSocialStats:{following:38,followers:124,posts:16},loadProfileGifts:[],loadEarningsWallet:null,
    loadGiftCatalog:['rose','coffee','heart','crown'].map((slug,i)=>({slug,name:['First bloom','Coffee on me','Big feelings','Your majesty'][i],price_usd_cents:[199,299,499,999][i],is_active:true,season:null})),
    loadConversationMessages:messages, loadPublicProfile:{id:'review-other',display_name:'Jules',handle:'jules.wav',languages:['English'],country_code:'DE',avatar_path:null},
    loadSafetySettings:{messagePermission:'everyone',blockedProfiles:[]},isHandleAvailable:true,
    loadDirectCall:{id:'review-call',status:'accepted',accepted_at:now,caller_id:'review-me',callee_id:'review-other'},heartbeatDirectCall:true,
    loadCallPartner:{id:'review-other',display_name:'Jules',handle:'jules.wav',country_code:'DE',languages:['English']},
    loadClubDetail:{...clubs[0],allow_member_rooms:true,member_role:'member',owner_display_name:'Jules',owner_handle:'jules.wav',owner_id:'review-other'},
    loadClubPosts:posts,loadClubMembers:[{user_id:'review-other',display_name:'Jules',handle:'jules.wav',role:'owner',country_code:'DE'}],
    loadClubRoom:{id:'room',club_id:'1',title:'What keeps you up?',status:'live',host_id:'review-other',clubs:{name:'After Hours',topic:'Late-night talks'}},
    loadRoomParticipants:[{user_id:'review-other',display_name:'Jules',role:'host',is_host:true},{user_id:'review-me',display_name:'Alex Morgan',role:'listener',is_host:false}],loadOwnClubRole:'member',
    loadSocialStats:{following:18,followers:96,posts:8},loadProfilePosts:posts,isFollowingProfile:false,loadPostReplies:replies,
  };
  if (name === 'createReply') { const parent=replies.find(r=>r.reply_id===args[3]); replies.push({reply_id:String(Date.now()),author_id:'review-me',author_display_name:'Alex',body:args[2],created_at:now,parent_reply_id:args[3],parent_author_name:parent?.author_display_name,parent_body_preview:parent?.body}); }
  if (name === 'searchMessageProfiles') return Promise.resolve(state === 'empty' ? [] : [{user_id:'review-other',display_name:'Jules',handle:'jules.wav',is_following:true,languages:['English']}]);
  if (name === 'getOrCreateDirectConversation') return Promise.resolve('review-chat');
  if (name === 'createPost') posts = [{...posts[0],post_id:String(Date.now()),author_display_name:'Alex Morgan',author_handle:'alexafterhours',body:args[1],like_count:0,reply_count:0},...posts];
  if (name === 'joinClub' || name === 'leaveClub') clubs = clubs.map(c=>c.club_id===args[0]?{...c,is_member:name==='joinClub'}:c);
  if (state === 'empty' && ['loadFeed','loadDiscoverFeed','loadActivity','listSavedPosts','loadClubs','listDirectConversations'].includes(name)) return Promise.resolve([]);
  return Promise.resolve(values[name] ?? []);
}
