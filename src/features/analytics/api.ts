import { supabase } from '@/lib/supabase';
type Event='session_start'|'match_started'|'match_found'|'match_cancelled'|'dm_sent'|'post_published'|'reply_sent'|'notification_opened'|'render_error'|'audio_failed';
type Surface='app'|'matching'|'feed'|'post'|'messages'|'clubs'|'notifications'|'calls';
export function trackEvent(event:Event,surface:Surface,durationMs?:number) {
  if(!supabase)return;
  void supabase.rpc('record_app_event',{event_name:event,surface,duration_ms:durationMs===undefined?undefined:Math.min(86400000,Math.max(0,Math.round(durationMs)))}).then(()=>{},()=>{});
}
