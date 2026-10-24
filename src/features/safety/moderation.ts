import { supabase } from '@/lib/supabase';
export async function isModerator() {if(!supabase)return false;const {data,error}=await supabase.rpc('is_moderator');if(error)throw error;return data;}
export async function listModerationReports(){if(!supabase)throw new Error('Supabase is not configured.');const {data,error}=await supabase.rpc('list_moderation_reports');if(error)throw error;return data;}
export async function reviewModerationReport(id:string,resolution:'reviewing'|'resolved'|'dismissed',removeContent=false){if(!supabase)throw new Error('Supabase is not configured.');const {error}=await supabase.rpc('review_moderation_report',{target_report_id:id,resolution,remove_content:removeContent});if(error)throw error;}
