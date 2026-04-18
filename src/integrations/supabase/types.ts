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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      admin_banners: {
        Row: {
          body_html: string
          created_at: string
          created_by: string
          id: string
          reopen_after_dismiss: boolean
          status: Database["public"]["Enums"]["banner_status"]
          title: string
          updated_at: string
        }
        Insert: {
          body_html?: string
          created_at?: string
          created_by: string
          id?: string
          reopen_after_dismiss?: boolean
          status?: Database["public"]["Enums"]["banner_status"]
          title: string
          updated_at?: string
        }
        Update: {
          body_html?: string
          created_at?: string
          created_by?: string
          id?: string
          reopen_after_dismiss?: boolean
          status?: Database["public"]["Enums"]["banner_status"]
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      admin_promotions: {
        Row: {
          confirmed_at: string | null
          created_at: string
          id: string
          promoted_by: string
          token: string
          token_hash: string | null
          user_id: string
        }
        Insert: {
          confirmed_at?: string | null
          created_at?: string
          id?: string
          promoted_by: string
          token?: string
          token_hash?: string | null
          user_id: string
        }
        Update: {
          confirmed_at?: string | null
          created_at?: string
          id?: string
          promoted_by?: string
          token?: string
          token_hash?: string | null
          user_id?: string
        }
        Relationships: []
      }
      announcement_reads: {
        Row: {
          announcement_id: string
          id: string
          read_at: string
          user_id: string
        }
        Insert: {
          announcement_id: string
          id?: string
          read_at?: string
          user_id: string
        }
        Update: {
          announcement_id?: string
          id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcement_reads_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
        ]
      }
      announcement_views: {
        Row: {
          announcement_id: string
          id: string
          user_id: string
          viewed_at: string
        }
        Insert: {
          announcement_id: string
          id?: string
          user_id: string
          viewed_at?: string
        }
        Update: {
          announcement_id?: string
          id?: string
          user_id?: string
          viewed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcement_views_announcement_id_fkey"
            columns: ["announcement_id"]
            isOneToOne: false
            referencedRelation: "announcements"
            referencedColumns: ["id"]
          },
        ]
      }
      announcements: {
        Row: {
          audio_url: string | null
          body_html: string
          created_at: string
          created_by: string
          id: string
          title: string
          updated_at: string
          video_url: string | null
        }
        Insert: {
          audio_url?: string | null
          body_html?: string
          created_at?: string
          created_by: string
          id?: string
          title: string
          updated_at?: string
          video_url?: string | null
        }
        Update: {
          audio_url?: string | null
          body_html?: string
          created_at?: string
          created_by?: string
          id?: string
          title?: string
          updated_at?: string
          video_url?: string | null
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          changed_fields: string[] | null
          created_at: string
          error_message: string | null
          event_type: string
          id: string
          ip_address: string | null
          record_id: string | null
          table_name: string
          user_id: string | null
        }
        Insert: {
          changed_fields?: string[] | null
          created_at?: string
          error_message?: string | null
          event_type: string
          id?: string
          ip_address?: string | null
          record_id?: string | null
          table_name: string
          user_id?: string | null
        }
        Update: {
          changed_fields?: string[] | null
          created_at?: string
          error_message?: string | null
          event_type?: string
          id?: string
          ip_address?: string | null
          record_id?: string | null
          table_name?: string
          user_id?: string | null
        }
        Relationships: []
      }
      banner_dismissals: {
        Row: {
          banner_id: string
          dismissed_at: string
          id: string
          user_id: string
        }
        Insert: {
          banner_id: string
          dismissed_at?: string
          id?: string
          user_id: string
        }
        Update: {
          banner_id?: string
          dismissed_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "banner_dismissals_banner_id_fkey"
            columns: ["banner_id"]
            isOneToOne: false
            referencedRelation: "admin_banners"
            referencedColumns: ["id"]
          },
        ]
      }
      bdd_scenarios: {
        Row: {
          created_at: string
          feature_area: string
          feature_area_number: number
          gherkin: string
          id: string
          notes: string | null
          scenario_id: string
          status: Database["public"]["Enums"]["bdd_status"]
          test_file: string | null
          test_type: Database["public"]["Enums"]["bdd_test_type"]
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          feature_area: string
          feature_area_number: number
          gherkin: string
          id?: string
          notes?: string | null
          scenario_id: string
          status?: Database["public"]["Enums"]["bdd_status"]
          test_file?: string | null
          test_type?: Database["public"]["Enums"]["bdd_test_type"]
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          feature_area?: string
          feature_area_number?: number
          gherkin?: string
          id?: string
          notes?: string | null
          scenario_id?: string
          status?: Database["public"]["Enums"]["bdd_status"]
          test_file?: string | null
          test_type?: Database["public"]["Enums"]["bdd_test_type"]
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      chat_conversations: {
        Row: {
          created_at: string
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      chat_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          role: string
        }
        Insert: {
          content?: string
          conversation_id: string
          created_at?: string
          id?: string
          role: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "chat_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      class_certifications: {
        Row: {
          airtable_record_id: string
          created_at: string
          display_title: string
          email: string
          id: string
          raw_data: Json
          synced_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          airtable_record_id: string
          created_at?: string
          display_title?: string
          email?: string
          id?: string
          raw_data?: Json
          synced_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          airtable_record_id?: string
          created_at?: string
          display_title?: string
          email?: string
          id?: string
          raw_data?: Json
          synced_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      clients: {
        Row: {
          created_at: string
          created_by: string
          id: string
          logo_url: string
          mission: string
          name: string
          primary_contact: string
          project_summary: string
          status: Database["public"]["Enums"]["client_status"]
          updated_at: string
          website: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          logo_url?: string
          mission?: string
          name: string
          primary_contact?: string
          project_summary?: string
          status?: Database["public"]["Enums"]["client_status"]
          updated_at?: string
          website?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          logo_url?: string
          mission?: string
          name?: string
          primary_contact?: string
          project_summary?: string
          status?: Database["public"]["Enums"]["client_status"]
          updated_at?: string
          website?: string
        }
        Relationships: []
      }
      dashboard_preferences: {
        Row: {
          created_at: string
          id: string
          updated_at: string
          user_id: string
          visible_widgets: Json
          widget_order: Json
        }
        Insert: {
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
          visible_widgets?: Json
          widget_order?: Json
        }
        Update: {
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
          visible_widgets?: Json
          widget_order?: Json
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      exploration_cache: {
        Row: {
          created_at: string
          hit_count: number
          id: string
          query_normalized: string
          response_markdown: string
        }
        Insert: {
          created_at?: string
          hit_count?: number
          id?: string
          query_normalized: string
          response_markdown?: string
        }
        Update: {
          created_at?: string
          hit_count?: number
          id?: string
          query_normalized?: string
          response_markdown?: string
        }
        Relationships: []
      }
      exploration_queries: {
        Row: {
          created_at: string
          id: string
          query_text: string
          result_count: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          query_text: string
          result_count?: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          query_text?: string
          result_count?: number
          user_id?: string
        }
        Relationships: []
      }
      failed_login_attempts: {
        Row: {
          attempted_at: string
          email: string
          id: string
          ip_address: string | null
          user_agent: string | null
        }
        Insert: {
          attempted_at?: string
          email: string
          id?: string
          ip_address?: string | null
          user_agent?: string | null
        }
        Update: {
          attempted_at?: string
          email?: string
          id?: string
          ip_address?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      feedback: {
        Row: {
          created_at: string
          id: string
          message: string
          system_area: string
          user_email: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          message?: string
          system_area?: string
          user_email?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          system_area?: string
          user_email?: string
          user_id?: string
        }
        Relationships: []
      }
      general_applications: {
        Row: {
          about_yourself: string
          agile_philosophies: string
          agile_vs_waterfall: string
          collaboration_challenges: string
          completed_at: string | null
          created_at: string
          current_section: number
          email: string
          hours_commitment: string
          id: string
          linkedin_url: string
          portfolio_url: string
          previous_engagement: string
          previous_engagement_ways: string[]
          psychological_safety: string
          servant_leadership_actions: string
          servant_leadership_challenges: string
          servant_leadership_definition: string
          servant_leadership_situation: string
          status: string
          teammate_learnings: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          about_yourself?: string
          agile_philosophies?: string
          agile_vs_waterfall?: string
          collaboration_challenges?: string
          completed_at?: string | null
          created_at?: string
          current_section?: number
          email?: string
          hours_commitment?: string
          id?: string
          linkedin_url?: string
          portfolio_url?: string
          previous_engagement?: string
          previous_engagement_ways?: string[]
          psychological_safety?: string
          servant_leadership_actions?: string
          servant_leadership_challenges?: string
          servant_leadership_definition?: string
          servant_leadership_situation?: string
          status?: string
          teammate_learnings?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          about_yourself?: string
          agile_philosophies?: string
          agile_vs_waterfall?: string
          collaboration_challenges?: string
          completed_at?: string | null
          created_at?: string
          current_section?: number
          email?: string
          hours_commitment?: string
          id?: string
          linkedin_url?: string
          portfolio_url?: string
          previous_engagement?: string
          previous_engagement_ways?: string[]
          psychological_safety?: string
          servant_leadership_actions?: string
          servant_leadership_challenges?: string
          servant_leadership_definition?: string
          servant_leadership_situation?: string
          status?: string
          teammate_learnings?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      grid_view_states: {
        Row: {
          created_at: string
          grid_id: string
          id: string
          state: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          grid_id: string
          id?: string
          state?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          grid_id?: string
          id?: string
          state?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      handbooks: {
        Row: {
          category: string
          contents: string[]
          created_at: string
          description: string
          id: string
          link: string
          name: string
          target_audience: string
          updated_at: string
        }
        Insert: {
          category?: string
          contents?: string[]
          created_at?: string
          description?: string
          id?: string
          link?: string
          name: string
          target_audience?: string
          updated_at?: string
        }
        Update: {
          category?: string
          contents?: string[]
          created_at?: string
          description?: string
          id?: string
          link?: string
          name?: string
          target_audience?: string
          updated_at?: string
        }
        Relationships: []
      }
      invitations: {
        Row: {
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string | null
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          token?: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string | null
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      journey_progress: {
        Row: {
          completed: boolean
          completed_at: string | null
          created_at: string
          id: string
          phase: Database["public"]["Enums"]["journey_phase"]
          task_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          id?: string
          phase?: Database["public"]["Enums"]["journey_phase"]
          task_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          id?: string
          phase?: Database["public"]["Enums"]["journey_phase"]
          task_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      knowledge_base: {
        Row: {
          content: string
          created_at: string
          id: string
          scraped_at: string
          title: string
          url: string
        }
        Insert: {
          content?: string
          created_at?: string
          id?: string
          scraped_at?: string
          title?: string
          url: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          scraped_at?: string
          title?: string
          url?: string
        }
        Relationships: []
      }
      milestone_reference: {
        Row: {
          activities: string[]
          created_at: string
          deliverables: string[]
          id: string
          milestone_name: string
          skills: string[]
        }
        Insert: {
          activities?: string[]
          created_at?: string
          deliverables?: string[]
          id?: string
          milestone_name: string
          skills?: string[]
        }
        Update: {
          activities?: string[]
          created_at?: string
          deliverables?: string[]
          id?: string
          milestone_name?: string
          skills?: string[]
        }
        Relationships: []
      }
      notification_fanout_jobs: {
        Row: {
          attempts: number
          created_at: string
          finished_at: string | null
          id: string
          last_error: string | null
          next_offset: number
          payload: Json
          source: string
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          finished_at?: string | null
          id?: string
          last_error?: string | null
          next_offset?: number
          payload: Json
          source: string
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          finished_at?: string | null
          id?: string
          last_error?: string | null
          next_offset?: number
          payload?: Json
          source?: string
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body_html: string
          created_at: string
          id: string
          link_url: string
          notification_type: string
          read: boolean
          title: string
          user_id: string
        }
        Insert: {
          body_html?: string
          created_at?: string
          id?: string
          link_url?: string
          notification_type?: string
          read?: boolean
          title: string
          user_id: string
        }
        Update: {
          body_html?: string
          created_at?: string
          id?: string
          link_url?: string
          notification_type?: string
          read?: boolean
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      passkey_credentials: {
        Row: {
          counter: number
          created_at: string
          credential_id: string
          device_name: string
          id: string
          last_used_at: string | null
          public_key: string
          transports: string[]
          user_id: string
        }
        Insert: {
          counter?: number
          created_at?: string
          credential_id: string
          device_name?: string
          id?: string
          last_used_at?: string | null
          public_key: string
          transports?: string[]
          user_id: string
        }
        Update: {
          counter?: number
          created_at?: string
          credential_id?: string
          device_name?: string
          id?: string
          last_used_at?: string | null
          public_key?: string
          transports?: string[]
          user_id?: string
        }
        Relationships: []
      }
      passkey_login_challenges: {
        Row: {
          challenge: string
          created_at: string
          expires_at: string
          user_id: string
        }
        Insert: {
          challenge: string
          created_at?: string
          expires_at?: string
          user_id: string
        }
        Update: {
          challenge?: string
          created_at?: string
          expires_at?: string
          user_id?: string
        }
        Relationships: []
      }
      passkey_login_sessions: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          ip_address: string | null
          session_token_hash: string
          user_id: string
          verified_at: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          id?: string
          ip_address?: string | null
          session_token_hash: string
          user_id: string
          verified_at?: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          ip_address?: string | null
          session_token_hash?: string
          user_id?: string
          verified_at?: string
        }
        Relationships: []
      }
      passkey_recovery_tokens: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          ip_address: string | null
          token_hash: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          id?: string
          ip_address?: string | null
          token_hash: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          ip_address?: string | null
          token_hash?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string
          country: string
          created_at: string
          discord_invite_created_at: string | null
          discord_invite_url: string
          discord_user_id: string
          discord_username: string
          display_name: string
          education_background: string[]
          email: string
          experience_areas: string[]
          first_name: string
          has_discord_account: boolean
          id: string
          interests: string[]
          last_name: string
          linkedin_url: string
          membership_tier: Database["public"]["Enums"]["membership_tier"]
          notify_announcements: boolean
          notify_training_opportunities: boolean
          portfolio_url: string
          professional_background: string
          professional_goals: string
          profile_completed: boolean
          scheduling_url: string
          timezone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string
          country?: string
          created_at?: string
          discord_invite_created_at?: string | null
          discord_invite_url?: string
          discord_user_id?: string
          discord_username?: string
          display_name?: string
          education_background?: string[]
          email?: string
          experience_areas?: string[]
          first_name?: string
          has_discord_account?: boolean
          id?: string
          interests?: string[]
          last_name?: string
          linkedin_url?: string
          membership_tier?: Database["public"]["Enums"]["membership_tier"]
          notify_announcements?: boolean
          notify_training_opportunities?: boolean
          portfolio_url?: string
          professional_background?: string
          professional_goals?: string
          profile_completed?: boolean
          scheduling_url?: string
          timezone?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string
          country?: string
          created_at?: string
          discord_invite_created_at?: string | null
          discord_invite_url?: string
          discord_user_id?: string
          discord_username?: string
          display_name?: string
          education_background?: string[]
          email?: string
          experience_areas?: string[]
          first_name?: string
          has_discord_account?: boolean
          id?: string
          interests?: string[]
          last_name?: string
          linkedin_url?: string
          membership_tier?: Database["public"]["Enums"]["membership_tier"]
          notify_announcements?: boolean
          notify_training_opportunities?: boolean
          portfolio_url?: string
          professional_background?: string
          professional_goals?: string
          profile_completed?: boolean
          scheduling_url?: string
          timezone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      project_applications: {
        Row: {
          applicant_status: string
          client_project_knowledge: string
          completed_at: string | null
          created_at: string
          cross_functional_contribution: string
          current_step: number
          id: string
          participated_previous_phase: boolean
          passion_for_project: string
          previous_phase_help_teammates: string
          previous_phase_learnings: string
          previous_phase_position: string
          prior_engagement_preparation: string
          project_id: string
          project_success_contribution: string
          status: string
          team_hats_interest: string[]
          updated_at: string
          user_id: string
        }
        Insert: {
          applicant_status?: string
          client_project_knowledge?: string
          completed_at?: string | null
          created_at?: string
          cross_functional_contribution?: string
          current_step?: number
          id?: string
          participated_previous_phase?: boolean
          passion_for_project?: string
          previous_phase_help_teammates?: string
          previous_phase_learnings?: string
          previous_phase_position?: string
          prior_engagement_preparation?: string
          project_id: string
          project_success_contribution?: string
          status?: string
          team_hats_interest?: string[]
          updated_at?: string
          user_id: string
        }
        Update: {
          applicant_status?: string
          client_project_knowledge?: string
          completed_at?: string | null
          created_at?: string
          cross_functional_contribution?: string
          current_step?: number
          id?: string
          participated_previous_phase?: boolean
          passion_for_project?: string
          previous_phase_help_teammates?: string
          previous_phase_learnings?: string
          previous_phase_position?: string
          prior_engagement_preparation?: string
          project_id?: string
          project_success_contribution?: string
          status?: string
          team_hats_interest?: string[]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_applications_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_certifications: {
        Row: {
          airtable_record_id: string
          created_at: string
          display_title: string
          email: string
          id: string
          raw_data: Json
          synced_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          airtable_record_id: string
          created_at?: string
          display_title?: string
          email?: string
          id?: string
          raw_data?: Json
          synced_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          airtable_record_id?: string
          created_at?: string
          display_title?: string
          email?: string
          id?: string
          raw_data?: Json
          synced_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      project_roster: {
        Row: {
          airtable_record_id: string
          client_name: string
          created_at: string
          end_date: string | null
          hours_contributed: number | null
          id: string
          linked_project_ids: string[]
          member_email: string
          member_name: string
          member_role: string
          mentor: string
          performance_notes: string
          phase: string
          project_id: string | null
          project_name: string
          project_type: string
          raw_airtable_data: Json | null
          start_date: string | null
          status: string
          synced_at: string
          updated_at: string
        }
        Insert: {
          airtable_record_id: string
          client_name?: string
          created_at?: string
          end_date?: string | null
          hours_contributed?: number | null
          id?: string
          linked_project_ids?: string[]
          member_email?: string
          member_name?: string
          member_role?: string
          mentor?: string
          performance_notes?: string
          phase?: string
          project_id?: string | null
          project_name?: string
          project_type?: string
          raw_airtable_data?: Json | null
          start_date?: string | null
          status?: string
          synced_at?: string
          updated_at?: string
        }
        Update: {
          airtable_record_id?: string
          client_name?: string
          created_at?: string
          end_date?: string | null
          hours_contributed?: number | null
          id?: string
          linked_project_ids?: string[]
          member_email?: string
          member_name?: string
          member_role?: string
          mentor?: string
          performance_notes?: string
          phase?: string
          project_id?: string | null
          project_name?: string
          project_type?: string
          raw_airtable_data?: Json | null
          start_date?: string | null
          status?: string
          synced_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_roster_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          anticipated_end_date: string | null
          anticipated_start_date: string | null
          client_id: string
          client_intake_url: string
          coordinator_id: string | null
          created_at: string
          created_by: string
          current_phase_milestones: string[]
          description: string
          discord_role_id: string
          discord_role_name: string
          friendly_name: string
          id: string
          notion_repository_url: string
          phase: Database["public"]["Enums"]["project_phase"]
          project_status: Database["public"]["Enums"]["project_status_enum"]
          project_type: Database["public"]["Enums"]["project_type"]
          team_hats: string[]
          timezone_range: string
          updated_at: string
        }
        Insert: {
          anticipated_end_date?: string | null
          anticipated_start_date?: string | null
          client_id: string
          client_intake_url?: string
          coordinator_id?: string | null
          created_at?: string
          created_by: string
          current_phase_milestones?: string[]
          description?: string
          discord_role_id?: string
          discord_role_name?: string
          friendly_name?: string
          id?: string
          notion_repository_url?: string
          phase?: Database["public"]["Enums"]["project_phase"]
          project_status?: Database["public"]["Enums"]["project_status_enum"]
          project_type: Database["public"]["Enums"]["project_type"]
          team_hats?: string[]
          timezone_range?: string
          updated_at?: string
        }
        Update: {
          anticipated_end_date?: string | null
          anticipated_start_date?: string | null
          client_id?: string
          client_intake_url?: string
          coordinator_id?: string | null
          created_at?: string
          created_by?: string
          current_phase_milestones?: string[]
          description?: string
          discord_role_id?: string
          discord_role_name?: string
          friendly_name?: string
          id?: string
          notion_repository_url?: string
          phase?: Database["public"]["Enums"]["project_phase"]
          project_status?: Database["public"]["Enums"]["project_status_enum"]
          project_type?: Database["public"]["Enums"]["project_type"]
          team_hats?: string[]
          timezone_range?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          updated_at: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          updated_at?: string
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      quest_path_steps: {
        Row: {
          created_at: string
          description: string
          id: string
          linked_filter: Json | null
          linked_phase: string | null
          linked_table: string | null
          path_id: string
          sort_order: number
          step_type: Database["public"]["Enums"]["quest_step_type"]
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          linked_filter?: Json | null
          linked_phase?: string | null
          linked_table?: string | null
          path_id: string
          sort_order?: number
          step_type?: Database["public"]["Enums"]["quest_step_type"]
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          linked_filter?: Json | null
          linked_phase?: string | null
          linked_table?: string | null
          path_id?: string
          sort_order?: number
          step_type?: Database["public"]["Enums"]["quest_step_type"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quest_path_steps_path_id_fkey"
            columns: ["path_id"]
            isOneToOne: false
            referencedRelation: "quest_paths"
            referencedColumns: ["id"]
          },
        ]
      }
      quest_paths: {
        Row: {
          created_at: string
          description: string
          duration_phases: Json
          estimated_duration: string
          icon: string
          id: string
          level: string
          prerequisites: string[]
          slug: string
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string
          duration_phases?: Json
          estimated_duration?: string
          icon?: string
          id?: string
          level?: string
          prerequisites?: string[]
          slug: string
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          duration_phases?: Json
          estimated_duration?: string
          icon?: string
          id?: string
          level?: string
          prerequisites?: string[]
          slug?: string
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          action: string
          attempt_count: number
          blocked_until: string | null
          created_at: string
          id: string
          identifier: string
          window_start: string
        }
        Insert: {
          action: string
          attempt_count?: number
          blocked_until?: string | null
          created_at?: string
          id?: string
          identifier: string
          window_start?: string
        }
        Update: {
          action?: string
          attempt_count?: number
          blocked_until?: string | null
          created_at?: string
          id?: string
          identifier?: string
          window_start?: string
        }
        Relationships: []
      }
      revoked_sessions: {
        Row: {
          created_at: string
          id: string
          ip_address: string | null
          reason: string
          revoked_at: string
          revoked_by: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          ip_address?: string | null
          reason?: string
          revoked_at?: string
          revoked_by?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          ip_address?: string | null
          reason?: string
          revoked_at?: string
          revoked_by?: string | null
          user_id?: string
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      user_quest_selections: {
        Row: {
          completed_at: string | null
          created_at: string
          id: string
          last_nudged_at: string | null
          path_id: string
          started_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          id?: string
          last_nudged_at?: string | null
          path_id: string
          started_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          id?: string
          last_nudged_at?: string | null
          path_id?: string
          started_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_quest_selections_path_id_fkey"
            columns: ["path_id"]
            isOneToOne: false
            referencedRelation: "quest_paths"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      workshops: {
        Row: {
          accountable_function: string
          category: string
          company_types: string[]
          created_at: string
          deliverables: string
          description: string
          figma_link: string
          functions_involved: string[]
          id: string
          led_by: string
          milestones: string
          name: string
          project_types: string[]
          skills: string[]
          stakeholders: string[]
          timing: string
          updated_at: string
        }
        Insert: {
          accountable_function?: string
          category?: string
          company_types?: string[]
          created_at?: string
          deliverables?: string
          description?: string
          figma_link?: string
          functions_involved?: string[]
          id?: string
          led_by?: string
          milestones?: string
          name: string
          project_types?: string[]
          skills?: string[]
          stakeholders?: string[]
          timing?: string
          updated_at?: string
        }
        Update: {
          accountable_function?: string
          category?: string
          company_types?: string[]
          created_at?: string
          deliverables?: string
          description?: string
          figma_link?: string
          functions_involved?: string[]
          id?: string
          led_by?: string
          milestones?: string
          name?: string
          project_types?: string[]
          skills?: string[]
          stakeholders?: string[]
          timing?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      project_roster_member_view: {
        Row: {
          airtable_record_id: string | null
          client_name: string | null
          created_at: string | null
          end_date: string | null
          id: string | null
          linked_project_ids: string[] | null
          member_email: string | null
          member_name: string | null
          member_role: string | null
          phase: string | null
          project_id: string | null
          project_name: string | null
          project_type: string | null
          start_date: string | null
          status: string | null
          synced_at: string | null
          updated_at: string | null
        }
        Insert: {
          airtable_record_id?: string | null
          client_name?: string | null
          created_at?: string | null
          end_date?: string | null
          id?: string | null
          linked_project_ids?: string[] | null
          member_email?: string | null
          member_name?: string | null
          member_role?: string | null
          phase?: string | null
          project_id?: string | null
          project_name?: string | null
          project_type?: string | null
          start_date?: string | null
          status?: string | null
          synced_at?: string | null
          updated_at?: string | null
        }
        Update: {
          airtable_record_id?: string | null
          client_name?: string | null
          created_at?: string | null
          end_date?: string | null
          id?: string | null
          linked_project_ids?: string[] | null
          member_email?: string | null
          member_name?: string | null
          member_role?: string | null
          phase?: string | null
          project_id?: string | null
          project_name?: string | null
          project_type?: string | null
          start_date?: string | null
          status?: string | null
          synced_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_roster_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      check_rate_limit: {
        Args: {
          p_action: string
          p_block_minutes?: number
          p_identifier: string
          p_max_attempts?: number
          p_window_minutes?: number
        }
        Returns: Json
      }
      cleanup_passkey_login_artifacts: { Args: never; Returns: number }
      cleanup_rate_limits: { Args: never; Returns: number }
      cleanup_stuck_email_queue: { Args: never; Returns: number }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      export_my_data: { Args: never; Returns: Json }
      get_announcement_view_counts: {
        Args: never
        Returns: {
          announcement_id: string
          total_views: number
          unique_views: number
        }[]
      }
      get_dashboard_overview: { Args: { p_user_id: string }; Returns: Json }
      get_member_country_distribution: { Args: never; Returns: Json }
      get_network_stats: { Args: never; Returns: Json }
      get_own_promotions: {
        Args: { p_user_id: string }
        Returns: {
          confirmed_at: string
          created_at: string
          id: string
          promoted_by: string
          user_id: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_passkey_login_verified: {
        Args: { _session_hash: string }
        Returns: boolean
      }
      is_session_revoked: {
        Args: { _issued_at: string; _user_id: string }
        Returns: boolean
      }
      list_pending_fanout_jobs: {
        Args: { p_limit?: number }
        Returns: {
          attempts: number
          created_at: string
          id: string
          source: string
        }[]
      }
      log_pii_access: {
        Args: { p_access_reason?: string; p_accessed_user_id: string }
        Returns: undefined
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      process_notification_fanout_chunk: {
        Args: { p_chunk_size?: number; p_job_id: string }
        Returns: Json
      }
      purge_old_audit_logs: {
        Args: { retention_days?: number }
        Returns: number
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      record_failed_login: {
        Args: { _email: string; _ip?: string; _user_agent?: string }
        Returns: Json
      }
      reset_rate_limit: {
        Args: { p_action: string; p_identifier: string }
        Returns: undefined
      }
      sanitize_user_html: { Args: { input: string }; Returns: string }
      use_invitation: { Args: { p_token: string }; Returns: boolean }
      validate_invitation: {
        Args: { p_token: string }
        Returns: {
          email: string
          expires_at: string
          used_at: string
        }[]
      }
      verify_admin_promotion_token: {
        Args: { p_token: string }
        Returns: {
          confirmed_at: string
          id: string
          user_id: string
        }[]
      }
      write_audit_log:
        | {
            Args: {
              p_changed_fields?: string[]
              p_event_type: string
              p_record_id: string
              p_table_name: string
              p_user_id: string
            }
            Returns: undefined
          }
        | {
            Args: {
              p_changed_fields?: string[]
              p_error_message?: string
              p_event_type: string
              p_record_id: string
              p_table_name: string
              p_user_id: string
            }
            Returns: undefined
          }
    }
    Enums: {
      app_role: "admin" | "member"
      banner_status: "draft" | "published" | "archived"
      bdd_status: "implemented" | "partial" | "not_built"
      bdd_test_type: "unit" | "e2e" | "both" | "none" | "manual"
      client_status: "active" | "inactive"
      journey_phase:
        | "first_steps"
        | "second_steps"
        | "third_steps"
        | "observer"
        | "projects"
        | "project_training"
        | "volunteer"
        | "discord_learning"
      membership_tier: "free" | "paid"
      project_phase: "phase_1" | "phase_2" | "phase_3" | "phase_4"
      project_status_enum:
        | "coming_soon"
        | "apply_now"
        | "recruiting"
        | "team_onboarding"
        | "project_in_progress"
        | "project_complete"
      project_type:
        | "website_design"
        | "service_design"
        | "application_design"
        | "strategy"
        | "discovery"
      quest_step_type:
        | "course"
        | "self_report"
        | "system_verified"
        | "application"
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
    Enums: {
      app_role: ["admin", "member"],
      banner_status: ["draft", "published", "archived"],
      bdd_status: ["implemented", "partial", "not_built"],
      bdd_test_type: ["unit", "e2e", "both", "none", "manual"],
      client_status: ["active", "inactive"],
      journey_phase: [
        "first_steps",
        "second_steps",
        "third_steps",
        "observer",
        "projects",
        "project_training",
        "volunteer",
        "discord_learning",
      ],
      membership_tier: ["free", "paid"],
      project_phase: ["phase_1", "phase_2", "phase_3", "phase_4"],
      project_status_enum: [
        "coming_soon",
        "apply_now",
        "recruiting",
        "team_onboarding",
        "project_in_progress",
        "project_complete",
      ],
      project_type: [
        "website_design",
        "service_design",
        "application_design",
        "strategy",
        "discovery",
      ],
      quest_step_type: [
        "course",
        "self_report",
        "system_verified",
        "application",
      ],
    },
  },
} as const
