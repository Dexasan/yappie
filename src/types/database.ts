export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      activity_events: {
        Row: {
          actor_id: string
          created_at: string
          id: string
          kind: string
          metadata: Json
          post_id: string | null
          read_at: string | null
          recipient_id: string
          source_id: string
        }
        Insert: {
          actor_id: string
          created_at?: string
          id?: string
          kind: string
          metadata?: Json
          post_id?: string | null
          read_at?: string | null
          recipient_id: string
          source_id: string
        }
        Update: {
          actor_id?: string
          created_at?: string
          id?: string
          kind?: string
          metadata?: Json
          post_id?: string | null
          read_at?: string | null
          recipient_id?: string
          source_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_events_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
        }
        Relationships: []
      }
      call_availability: {
        Row: {
          created_at: string
          last_seen_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          last_seen_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          last_seen_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "call_availability_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      app_presence: {
        Row: {
          last_seen_at: string
          user_id: string
        }
        Insert: {
          last_seen_at?: string
          user_id: string
        }
        Update: {
          last_seen_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_presence_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      club_memberships: {
        Row: {
          club_id: string
          joined_at: string
          role: string
          status: string
          user_id: string
        }
        Insert: {
          club_id: string
          joined_at?: string
          role?: string
          status?: string
          user_id: string
        }
        Update: {
          club_id?: string
          joined_at?: string
          role?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_memberships_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      club_rooms: {
        Row: {
          audio_provider_room: string | null
          club_id: string
          created_at: string
          ended_at: string | null
          host_id: string
          id: string
          scheduled_for: string | null
          started_at: string | null
          status: string
          title: string
        }
        Insert: {
          audio_provider_room?: string | null
          club_id: string
          created_at?: string
          ended_at?: string | null
          host_id: string
          id?: string
          scheduled_for?: string | null
          started_at?: string | null
          status?: string
          title: string
        }
        Update: {
          audio_provider_room?: string | null
          club_id?: string
          created_at?: string
          ended_at?: string | null
          host_id?: string
          id?: string
          scheduled_for?: string | null
          started_at?: string | null
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_rooms_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "club_rooms_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      clubs: {
        Row: {
          allow_member_rooms: boolean
          avatar_path: string | null
          created_at: string
          created_by: string | null
          description: string
          id: string
          name: string
          slug: string
          topic: string
        }
        Insert: {
          allow_member_rooms?: boolean
          avatar_path?: string | null
          created_at?: string
          created_by?: string | null
          description: string
          id?: string
          name: string
          slug: string
          topic: string
        }
        Update: {
          allow_member_rooms?: boolean
          avatar_path?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          name?: string
          slug?: string
          topic?: string
        }
        Relationships: [
          {
            foreignKeyName: "clubs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_members: {
        Row: {
          conversation_id: string
          joined_at: string
          last_read_at: string | null
          left_at: string | null
          user_id: string
        }
        Insert: {
          conversation_id: string
          joined_at?: string
          last_read_at?: string | null
          left_at?: string | null
          user_id: string
        }
        Update: {
          conversation_id?: string
          joined_at?: string
          last_read_at?: string | null
          left_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_members_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          created_by: string
          id: string
          kind: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          kind: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          kind?: string
        }
        Relationships: []
      }
      direct_conversations: {
        Row: {
          conversation_id: string
          created_at: string
          user_high_id: string
          user_low_id: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          user_high_id: string
          user_low_id: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          user_high_id?: string
          user_low_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "direct_conversations_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: true
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "direct_conversations_user_high_id_fkey"
            columns: ["user_high_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "direct_conversations_user_low_id_fkey"
            columns: ["user_low_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      direct_calls: {
        Row: {
          accepted_at: string | null
          callee_last_seen_at: string | null
          callee_id: string
          caller_last_seen_at: string | null
          caller_id: string
          created_at: string
          end_reason: string | null
          ended_at: string | null
          ended_by: string | null
          id: string
          status: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          callee_last_seen_at?: string | null
          callee_id: string
          caller_last_seen_at?: string | null
          caller_id: string
          created_at?: string
          end_reason?: string | null
          ended_at?: string | null
          ended_by?: string | null
          id?: string
          status?: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          callee_last_seen_at?: string | null
          callee_id?: string
          caller_last_seen_at?: string | null
          caller_id?: string
          created_at?: string
          end_reason?: string | null
          ended_at?: string | null
          ended_by?: string | null
          id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "direct_calls_callee_id_fkey"
            columns: ["callee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "direct_calls_caller_id_fkey"
            columns: ["caller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "direct_calls_ended_by_fkey"
            columns: ["ended_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      follows: {
        Row: {
          created_at: string
          followed_id: string
          follower_id: string
        }
        Insert: {
          created_at?: string
          followed_id: string
          follower_id: string
        }
        Update: {
          created_at?: string
          followed_id?: string
          follower_id?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          body: string
          client_nonce: string
          conversation_id: string
          created_at: string
          deleted_at: string | null
          id: string
          sender_id: string
        }
        Insert: {
          body: string
          client_nonce?: string
          conversation_id: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          sender_id: string
        }
        Update: {
          body?: string
          client_nonce?: string
          conversation_id?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      post_likes: {
        Row: {
          created_at: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          author_id: string
          body: string
          club_id: string | null
          created_at: string
          deleted_at: string | null
          id: string
          topic: string | null
          updated_at: string
        }
        Insert: {
          author_id: string
          body: string
          club_id?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          topic?: string | null
          updated_at?: string
        }
        Update: {
          author_id?: string
          body?: string
          club_id?: string | null
          created_at?: string
          deleted_at?: string | null
          id?: string
          topic?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_path: string | null
          bio: string
          country_code: string | null
          created_at: string
          display_name: string | null
          handle: string | null
          id: string
          languages: string[]
          updated_at: string
        }
        Insert: {
          avatar_path?: string | null
          bio?: string
          country_code?: string | null
          created_at?: string
          display_name?: string | null
          handle?: string | null
          id: string
          languages?: string[]
          updated_at?: string
        }
        Update: {
          avatar_path?: string | null
          bio?: string
          country_code?: string | null
          created_at?: string
          display_name?: string | null
          handle?: string | null
          id?: string
          languages?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      quick_chat_queue: {
        Row: {
          expires_at: string
          interests: string[]
          languages: string[]
          queued_at: string
          topic: string | null
          user_id: string
        }
        Insert: {
          expires_at: string
          interests?: string[]
          languages: string[]
          queued_at?: string
          topic?: string | null
          user_id: string
        }
        Update: {
          expires_at?: string
          interests?: string[]
          languages?: string[]
          queued_at?: string
          topic?: string | null
          user_id?: string
        }
        Relationships: []
      }
      quick_chat_sessions: {
        Row: {
          conversation_id: string
          end_reason: string | null
          ended_at: string | null
          ended_by: string | null
          id: string
          matched_interests: string[]
          started_at: string
          status: string
          user_a_id: string
          user_b_id: string
        }
        Insert: {
          conversation_id: string
          end_reason?: string | null
          ended_at?: string | null
          ended_by?: string | null
          id?: string
          matched_interests?: string[]
          started_at?: string
          status?: string
          user_a_id: string
          user_b_id: string
        }
        Update: {
          conversation_id?: string
          end_reason?: string | null
          ended_at?: string | null
          ended_by?: string | null
          id?: string
          matched_interests?: string[]
          started_at?: string
          status?: string
          user_a_id?: string
          user_b_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quick_chat_sessions_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: true
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      replies: {
        Row: {
          author_id: string
          body: string
          created_at: string
          deleted_at: string | null
          id: string
          post_id: string
          parent_reply_id: string | null
          updated_at: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          post_id: string
          parent_reply_id?: string | null
          updated_at?: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          post_id?: string
          parent_reply_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "replies_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "replies_parent_reply_id_fkey"
            columns: ["parent_reply_id"]
            isOneToOne: false
            referencedRelation: "replies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "replies_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          category: string
          created_at: string
          details: string
          id: string
          reporter_id: string
          resolved_at: string | null
          status: string
          target_id: string | null
          target_kind: string
          target_user_id: string | null
        }
        Insert: {
          category: string
          created_at?: string
          details?: string
          id?: string
          reporter_id: string
          resolved_at?: string | null
          status?: string
          target_id?: string | null
          target_kind: string
          target_user_id?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          details?: string
          id?: string
          reporter_id?: string
          resolved_at?: string | null
          status?: string
          target_id?: string | null
          target_kind?: string
          target_user_id?: string | null
        }
        Relationships: []
      }
      room_audio_sessions: {
        Row: {
          call_id: string | null
          created_at: string
          id: string
          provider: string
          provider_session_id: string
          provider_track_mid: string | null
          published_track_name: string | null
          room_id: string | null
          session_kind: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          call_id?: string | null
          created_at?: string
          id?: string
          provider?: string
          provider_session_id: string
          provider_track_mid?: string | null
          published_track_name?: string | null
          room_id?: string | null
          session_kind: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          call_id?: string | null
          created_at?: string
          id?: string
          provider?: string
          provider_session_id?: string
          provider_track_mid?: string | null
          published_track_name?: string | null
          room_id?: string | null
          session_kind?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_audio_sessions_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "direct_calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_audio_sessions_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "club_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_audio_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      room_participants: {
        Row: {
          hand_raised_at: string | null
          joined_at: string
          last_seen_at: string
          left_at: string | null
          muted_by_moderator: boolean
          role: string
          room_id: string
          state: string
          user_id: string
        }
        Insert: {
          hand_raised_at?: string | null
          joined_at?: string
          last_seen_at?: string
          left_at?: string | null
          muted_by_moderator?: boolean
          role?: string
          room_id: string
          state?: string
          user_id: string
        }
        Update: {
          hand_raised_at?: string | null
          joined_at?: string
          last_seen_at?: string
          left_at?: string | null
          muted_by_moderator?: boolean
          role?: string
          room_id?: string
          state?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_participants_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "club_rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_settings: {
        Row: {
          age_verified_at: string | null
          community_guidelines_accepted_at: string | null
          created_at: string
          date_of_birth: string | null
          id: string
          message_permission: string
          onboarding_completed_at: string | null
          terms_accepted_at: string | null
          updated_at: string
        }
        Insert: {
          age_verified_at?: string | null
          community_guidelines_accepted_at?: string | null
          created_at?: string
          date_of_birth?: string | null
          id: string
          message_permission?: string
          onboarding_completed_at?: string | null
          terms_accepted_at?: string | null
          updated_at?: string
        }
        Update: {
          age_verified_at?: string | null
          community_guidelines_accepted_at?: string | null
          created_at?: string
          date_of_birth?: string | null
          id?: string
          message_permission?: string
          onboarding_completed_at?: string | null
          terms_accepted_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_handle_available: {
        Args: { candidate_handle: string }
        Returns: boolean
      }
      can_send_message: {
        Args: { target_conversation_id: string; target_user_id: string }
        Returns: boolean
      }
      cancel_quick_chat_search: { Args: never; Returns: undefined }
      create_club: {
        Args: {
          club_description: string
          club_name: string
          club_topic: string
          member_rooms?: boolean
        }
        Returns: string
      }
      create_club_post: {
        Args: { post_body: string; target_club_id: string }
        Returns: string
      }
      complete_onboarding: {
        Args: {
          onboarding_birth_date: string
          onboarding_country_code: string
          onboarding_display_name: string
          onboarding_handle: string
          onboarding_languages: string[]
        }
        Returns: {
          avatar_path: string | null
          bio: string
          country_code: string | null
          created_at: string
          display_name: string | null
          handle: string | null
          id: string
          languages: string[]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      end_club_room: { Args: { target_room_id: string }; Returns: undefined }
      end_direct_call: {
        Args: { reason?: string; target_call_id: string }
        Returns: string
      }
      get_activity_unread_count: { Args: never; Returns: number }
      get_engagement_summary: { Args: never; Returns: { activity_count: number; message_count: number; global_new: boolean; following_new: boolean; checked_at: string }[] }
      acknowledge_feed: { Args: { feed_mode: string; through_time: string }; Returns: undefined }
      acknowledge_conversation: { Args:{target_conversation_id:string;through_time:string}; Returns:undefined }
      get_direct_conversation_partner: { Args:{target_conversation_id:string}; Returns:{user_id:string;display_name:string|null;handle:string|null;avatar_path:string|null}[] }
      join_quick_chat_v3: { Args:{match_interests:string[]}; Returns:{match_status:string;session_id:string|null;conversation_id:string|null;matched_profile_id:string|null;matched_interests:string[]}[] }
      search_clubs: { Args:{club_query?:string;club_offset?:number;only_joined?:boolean}; Returns:{club_id:string;slug:string;name:string;description:string;topic:string;member_count:number;is_member:boolean;live_room_id:string|null;live_room_title:string|null;live_listener_count:number}[] }
      record_app_event: { Args:{event_name:string;surface:string;duration_ms?:number}; Returns:undefined }
      is_moderator: { Args:never; Returns:boolean }
      list_moderation_reports: { Args:never; Returns:{report_id:string;target_kind:string;target_id:string|null;category:string;details:string;status:string;created_at:string;content_preview:string|null}[] }
      review_moderation_report: { Args:{target_report_id:string;resolution:string;remove_content?:boolean}; Returns:undefined }
      list_club_sessions: { Args:{target_club_id:string}; Returns:{session_id:string;title:string;starts_at:string;weekly:boolean;host_id:string;is_attending:boolean}[] }
      schedule_club_session: { Args:{target_club_id:string;session_title:string;start_time:string;repeat_weekly?:boolean;session_timezone?:string}; Returns:string }
      set_club_session_rsvp: { Args:{target_session_id:string;attending:boolean}; Returns:undefined }
      start_scheduled_club_session: { Args:{target_session_id:string}; Returns:string }
      cancel_club_session: { Args:{target_session_id:string}; Returns:undefined }
      get_notification_preferences: { Args: never; Returns: Json }
      set_notification_preferences: { Args: {preferences: Json}; Returns: undefined }
      register_push_device: { Args: {push_token:string}; Returns: undefined }
      unregister_push_device: { Args: {push_token:string}; Returns: undefined }
      set_notification_attention: { Args: {target_conversation_id?:string}; Returns: undefined }
      set_post_preference: { Args: { target_post_id: string; preference_kind: string; enabled: boolean }; Returns: undefined }
      list_saved_posts: { Args: never; Returns: { post_id: string; body: string; created_at: string }[] }
      delete_own_content: { Args: { content_kind: string; target_id: string }; Returns: undefined }
      get_discover_feed: { Args: { feed_limit?: number; snapshot_time?: string; before_score?: number; before_id?: string }; Returns: { post_id: string; author_id: string; author_display_name: string | null; author_handle: string | null; author_country_code: string | null; body: string; topic: string | null; created_at: string; like_count: number; reply_count: number; liked_by_me: boolean; ranking_score: number }[] }
      heartbeat_direct_call: {
        Args: { target_call_id: string }
        Returns: boolean
      }
      heartbeat_club_room: {
        Args: { target_room_id: string }
        Returns: undefined
      }
      get_coin_wallet: {
        Args: never
        Returns: {
          balance: number
          lifetime_earned: number
          lifetime_spent: number
        }[]
      }
      get_earnings_wallet: {
        Args: never
        Returns: {
          available_cents: number
          lifetime_earned_cents: number
          lifetime_paid_cents: number
          payout_status: string
          pending_cents: number
          premium_until: string | null
          withdrawal_minimum_cents: number
        }[]
      }
      get_club_detail: {
        Args: { target_club_id: string }
        Returns: {
          allow_member_rooms: boolean
          club_id: string
          created_at: string
          description: string
          is_member: boolean
          live_listener_count: number
          live_room_id: string | null
          live_room_title: string | null
          member_count: number
          member_role: string | null
          name: string
          owner_display_name: string | null
          owner_handle: string | null
          owner_id: string | null
          slug: string
          topic: string
        }[]
      }
      get_club_posts: {
        Args: {
          before_created_at?: string
          post_limit?: number
          target_club_id: string
        }
        Returns: {
          author_country_code: string | null
          author_display_name: string | null
          author_handle: string | null
          author_id: string
          body: string
          created_at: string
          like_count: number
          liked_by_me: boolean
          post_id: string
          reply_count: number
          topic: string | null
        }[]
      }
      get_feed: {
        Args: { before_created_at?: string; feed_limit?: number }
        Returns: {
          author_country_code: string
          author_display_name: string
          author_handle: string
          author_id: string
          body: string
          created_at: string
          like_count: number
          liked_by_me: boolean
          post_id: string
          reply_count: number
          topic: string
        }[]
      }
      get_or_create_direct_conversation: {
        Args: { other_user_id: string }
        Returns: string
      }
      get_following_feed: {
        Args: { before_created_at?: string; feed_limit?: number }
        Returns: {
          author_country_code: string | null
          author_display_name: string | null
          author_handle: string | null
          author_id: string
          body: string
          created_at: string
          like_count: number
          liked_by_me: boolean
          post_id: string
          reply_count: number
          topic: string | null
        }[]
      }
      get_privacy_settings: {
        Args: never
        Returns: { message_permission: string }[]
      }
      get_post_replies_v2: {
        Args: { target_post_id: string }
        Returns: {
          author_display_name: string | null
          author_handle: string | null
          author_id: string
          body: string
          created_at: string
          reply_id: string
          parent_reply_id: string | null
          parent_author_name: string | null
          parent_body_preview: string | null
        }[]
      }
      get_post_replies: {
        Args: { target_post_id: string }
        Returns: {
          author_display_name: string
          author_handle: string
          author_id: string
          body: string
          created_at: string
          reply_id: string
        }[]
      }
      list_activity_events: {
        Args: { activity_limit?: number; before_created_at?: string }
        Returns: {
          activity_id: string
          actor_country_code: string | null
          actor_display_name: string | null
          actor_handle: string | null
          actor_id: string
          created_at: string
          kind: string
          metadata: Json
          post_author_id: string | null
          post_author_name: string | null
          post_body: string | null
          post_id: string | null
          read_at: string | null
          source_id: string
        }[]
      }
      is_blocked_between: {
        Args: { first_user: string; second_user: string }
        Returns: boolean
      }
      is_conversation_member: {
        Args: { target_conversation_id: string; target_user_id: string }
        Returns: boolean
      }
      get_quick_chat_waiting_count: {
        Args: { match_languages: string[]; match_topic: string }
        Returns: number
      }
      get_quick_chat_matching_count: { Args: never; Returns: number }
      heartbeat_quick_chat: {
        Args: { target_session_id: string }
        Returns: boolean
      }
      join_club: { Args: { target_club_id: string }; Returns: undefined }
      join_club_room: { Args: { target_room_id: string }; Returns: undefined }
      join_quick_chat: {
        Args: { match_languages: string[]; match_topic?: string }
        Returns: {
          conversation_id: string
          match_status: string
          matched_profile_id: string
          session_id: string
        }[]
      }
      join_quick_chat_v2: {
        Args: { match_interests: string[] }
        Returns: {
          conversation_id: string | null
          match_status: string
          matched_interests: string[]
          matched_profile_id: string | null
          session_id: string | null
        }[]
      }
      leave_club: { Args: { target_club_id: string }; Returns: undefined }
      leave_club_room: { Args: { target_room_id: string }; Returns: undefined }
      leave_quick_chat: {
        Args: { leave_reason?: string; target_session_id: string }
        Returns: boolean
      }
      list_clubs: {
        Args: never
        Returns: {
          club_id: string
          description: string
          is_member: boolean
          live_listener_count: number
          live_room_id: string
          live_room_title: string
          member_count: number
          name: string
          slug: string
          topic: string
        }[]
      }
      list_direct_conversations: {
        Args: never
        Returns: {
          conversation_id: string
          last_message_at: string
          last_message_body: string
          partner_country_code: string
          partner_display_name: string
          partner_handle: string
          partner_id: string
          unread_count: number
        }[]
      }
      list_online_profiles: {
        Args: { target_user_ids: string[] }
        Returns: { user_id: string }[]
      }
      list_trending_match_interests: {
        Args: { limit_count?: number }
        Returns: {
          glyph: string
          label: string
          score: number
          source: string
        }[]
      }
      list_club_members: {
        Args: { member_limit?: number; target_club_id: string }
        Returns: {
          country_code: string | null
          display_name: string | null
          handle: string | null
          joined_at: string
          role: string
          user_id: string
        }[]
      }
      list_gift_catalog: {
        Args: never
        Returns: {
          coin_cost: number
          emoji: string
          name: string
          slug: string
        }[]
      }
      list_paid_gift_catalog: {
        Args: never
        Returns: {
          android_product_id: string
          animation_key: string
          emoji: string
          grants_premium_days: number
          includes_gift_pack: boolean
          ios_product_id: string
          name: string
          price_usd_cents: number
          recipient_share_cents: number
          season_key: string
          slug: string
        }[]
      }
      list_blocked_profiles: {
        Args: never
        Returns: {
          blocked_at: string
          country_code: string | null
          display_name: string | null
          handle: string | null
          user_id: string
        }[]
      }
      list_available_call_profiles: {
        Args: never
        Returns: {
          avatar_path: string | null
          country_code: string | null
          display_name: string | null
          handle: string | null
          languages: string[]
          last_seen_at: string
          user_id: string
        }[]
      }
      list_profile_gifts: {
        Args: { gift_limit?: number; target_user_id: string }
        Returns: {
          coin_cost: number
          created_at: string
          gift_emoji: string
          gift_id: string
          gift_name: string
          gift_slug: string
          price_paid_cents: number | null
          recipient_earnings_cents: number | null
          sender_display_name: string | null
          sender_handle: string | null
          sender_id: string
        }[]
      }
      list_room_participants: {
        Args: { target_room_id: string }
        Returns: {
          display_name: string
          hand_raised_at: string
          handle: string
          is_host: boolean
          role: string
          user_id: string
        }[]
      }
      moderate_room_participant: {
        Args: {
          moderation_action: string
          target_room_id: string
          target_user_id: string
        }
        Returns: undefined
      }
      set_room_hand_raised: {
        Args: { raised: boolean; target_room_id: string }
        Returns: undefined
      }
      request_direct_call: {
        Args: { target_user_id: string }
        Returns: string
      }
      set_app_presence: { Args: { target_active: boolean }; Returns: boolean }
      respond_direct_call: {
        Args: { accept_call: boolean; target_call_id: string }
        Returns: string
      }
      set_call_availability: {
        Args: { target_available: boolean }
        Returns: boolean
      }
      set_club_avatar: {
        Args: { target_avatar_path: string; target_club_id: string }
        Returns: string
      }
      mark_conversation_read: {
        Args: { target_conversation_id: string }
        Returns: undefined
      }
      mark_activity_read: {
        Args: { target_activity_id?: string }
        Returns: number
      }
      manage_club_member: {
        Args: {
          management_action: string
          target_club_id: string
          target_user_id: string
        }
        Returns: undefined
      }
      set_message_permission: {
        Args: { new_permission: string }
        Returns: string
      }
      set_profile_avatar: {
        Args: { target_avatar_path?: string | null }
        Returns: string | null
      }
      create_gift_purchase_intent: {
        Args: {
          gift_context_id?: string
          gift_context_kind?: string
          target_gift_slug: string
          target_user_id: string
        }
        Returns: {
          android_product_id: string
          ios_product_id: string
          price_usd_cents: number
          purchase_intent_id: string
          recipient_share_cents: number
        }[]
      }
      send_virtual_gift: {
        Args: {
          gift_context_id?: string
          gift_context_kind?: string
          target_gift_slug: string
          target_user_id: string
        }
        Returns: {
          balance: number
          coin_cost: number
          gift_id: string
        }[]
      }
      search_message_profiles: {
        Args: { profile_limit?: number; profile_query?: string }
        Returns: {
          bio: string | null
          country_code: string | null
          display_name: string | null
          follows_me: boolean
          handle: string | null
          is_following: boolean
          languages: string[]
          user_id: string
        }[]
      }
      start_club_room: {
        Args: { room_title: string; target_club_id: string }
        Returns: string
      }
      unblock_profile: {
        Args: { target_user_id: string }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
