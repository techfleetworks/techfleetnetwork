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
      admin_promotions: {
        Row: {
          confirmed_at: string | null
          created_at: string
          id: string
          promoted_by: string
          token: string
          user_id: string
        }
        Insert: {
          confirmed_at?: string | null
          created_at?: string
          id?: string
          promoted_by: string
          token?: string
          user_id: string
        }
        Update: {
          confirmed_at?: string | null
          created_at?: string
          id?: string
          promoted_by?: string
          token?: string
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
      announcements: {
        Row: {
          body_html: string
          created_at: string
          created_by: string
          id: string
          title: string
          updated_at: string
          video_url: string | null
        }
        Insert: {
          body_html?: string
          created_at?: string
          created_by: string
          id?: string
          title: string
          updated_at?: string
          video_url?: string | null
        }
        Update: {
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
      clients: {
        Row: {
          created_at: string
          created_by: string
          id: string
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
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string
          country: string
          created_at: string
          discord_user_id: string
          discord_username: string
          display_name: string
          education_background: string[]
          email: string
          experience_areas: string[]
          first_name: string
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
          timezone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string
          country?: string
          created_at?: string
          discord_user_id?: string
          discord_username?: string
          display_name?: string
          education_background?: string[]
          email?: string
          experience_areas?: string[]
          first_name?: string
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
          timezone?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string
          country?: string
          created_at?: string
          discord_user_id?: string
          discord_username?: string
          display_name?: string
          education_background?: string[]
          email?: string
          experience_areas?: string[]
          first_name?: string
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
          timezone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      project_applications: {
        Row: {
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
      projects: {
        Row: {
          anticipated_end_date: string | null
          anticipated_start_date: string | null
          client_id: string
          client_intake_url: string
          created_at: string
          created_by: string
          current_phase_milestones: string[]
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
          created_at?: string
          created_by: string
          current_phase_milestones?: string[]
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
          created_at?: string
          created_by?: string
          current_phase_milestones?: string[]
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
      [_ in never]: never
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
      cleanup_rate_limits: { Args: never; Returns: number }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      get_member_country_distribution: { Args: never; Returns: Json }
      get_network_stats: { Args: never; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
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
      reset_rate_limit: {
        Args: { p_action: string; p_identifier: string }
        Returns: undefined
      }
      use_invitation: { Args: { p_token: string }; Returns: boolean }
      validate_invitation: {
        Args: { p_token: string }
        Returns: {
          email: string
          expires_at: string
          used_at: string
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
    },
  },
} as const
