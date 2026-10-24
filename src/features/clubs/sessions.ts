import { supabase } from '@/lib/supabase';
export async function listClubSessions(clubId:string) {
  if(!supabase)throw new Error('Supabase is not configured.');
  const {data,error}=await supabase.rpc('list_club_sessions',{target_club_id:clubId});if(error)throw error;return data;
}
export async function scheduleClubSession(clubId:string,title:string,startsAt:string,weekly:boolean) {
  if(!supabase)throw new Error('Supabase is not configured.');
  const {error}=await supabase.rpc('schedule_club_session',{target_club_id:clubId,session_title:title,start_time:startsAt,repeat_weekly:weekly,session_timezone:Intl.DateTimeFormat().resolvedOptions().timeZone});if(error)throw error;
}
export async function rsvpClubSession(id:string,attending:boolean) {
  if(!supabase)throw new Error('Supabase is not configured.');
  const {error}=await supabase.rpc('set_club_session_rsvp',{target_session_id:id,attending});if(error)throw error;
}
export async function startScheduledSession(id:string) {
  if(!supabase)throw new Error('Supabase is not configured.');
  const {data,error}=await supabase.rpc('start_scheduled_club_session',{target_session_id:id});if(error)throw error;return data;
}
export async function cancelClubSession(id:string) {
  if(!supabase)throw new Error('Supabase is not configured.');
  const {error}=await supabase.rpc('cancel_club_session',{target_session_id:id});if(error)throw error;
}
