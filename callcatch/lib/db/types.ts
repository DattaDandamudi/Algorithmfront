/**
 * Database types for CallCatch.
 *
 * HAND-WRITTEN to mirror `supabase/migrations/20260914000000_init.sql` in the exact
 * shape `supabase gen types typescript` produces, so the file can later be replaced by
 *   supabase gen types typescript --project-id <ref> --schema public > lib/db/types.ts
 * without changing any consumer. Keep it in sync with the migrations (see supabase/README.md).
 *
 * Conventions (same as the generator): timestamptz/date/time/uuid/char -> string,
 * int/bigint/numeric -> number, jsonb -> Json, text[] -> string[], nullable -> `| null`.
 * Text columns constrained by CHECK are typed `string` (as generated); the literal unions
 * for those enums are exported at the bottom of this file for app code.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5";
  };
  public: {
    Tables: {
      account_members: {
        Row: {
          account_id: string;
          created_at: string;
          role: string;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          account_id: string;
          created_at?: string;
          role?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          account_id?: string;
          created_at?: string;
          role?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "account_members_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      accounts: {
        Row: {
          address_line1: string | null;
          ai_profile: Json;
          alert_email: string | null;
          alert_phone: string | null;
          alert_phone_verified: boolean;
          avg_ticket_usd: number;
          booking_url: string | null;
          business_phone: string | null;
          city: string | null;
          created_at: string;
          dba: string | null;
          ein: string | null;
          emergency_service: boolean;
          hours: Json;
          id: string;
          is_sole_prop: boolean;
          legal_name: string | null;
          on_call_phone: string | null;
          owner_user_id: string;
          plan: string | null;
          quiet_end: string;
          quiet_start: string;
          referral_code: string;
          referred_by_account_id: string | null;
          service_area: Json;
          state: string | null;
          status: string;
          stripe_customer_id: string | null;
          timezone: string | null;
          tone: string | null;
          trade: string | null;
          updated_at: string;
          website: string | null;
          zip: string | null;
        };
        Insert: {
          address_line1?: string | null;
          ai_profile?: Json;
          alert_email?: string | null;
          alert_phone?: string | null;
          alert_phone_verified?: boolean;
          avg_ticket_usd?: number;
          booking_url?: string | null;
          business_phone?: string | null;
          city?: string | null;
          created_at?: string;
          dba?: string | null;
          ein?: string | null;
          emergency_service?: boolean;
          hours?: Json;
          id?: string;
          is_sole_prop?: boolean;
          legal_name?: string | null;
          on_call_phone?: string | null;
          owner_user_id: string;
          plan?: string | null;
          quiet_end?: string;
          quiet_start?: string;
          referral_code: string;
          referred_by_account_id?: string | null;
          service_area?: Json;
          state?: string | null;
          status?: string;
          stripe_customer_id?: string | null;
          timezone?: string | null;
          tone?: string | null;
          trade?: string | null;
          updated_at?: string;
          website?: string | null;
          zip?: string | null;
        };
        Update: {
          address_line1?: string | null;
          ai_profile?: Json;
          alert_email?: string | null;
          alert_phone?: string | null;
          alert_phone_verified?: boolean;
          avg_ticket_usd?: number;
          booking_url?: string | null;
          business_phone?: string | null;
          city?: string | null;
          created_at?: string;
          dba?: string | null;
          ein?: string | null;
          emergency_service?: boolean;
          hours?: Json;
          id?: string;
          is_sole_prop?: boolean;
          legal_name?: string | null;
          on_call_phone?: string | null;
          owner_user_id?: string;
          plan?: string | null;
          quiet_end?: string;
          quiet_start?: string;
          referral_code?: string;
          referred_by_account_id?: string | null;
          service_area?: Json;
          state?: string | null;
          status?: string;
          stripe_customer_id?: string | null;
          timezone?: string | null;
          tone?: string | null;
          trade?: string | null;
          updated_at?: string;
          website?: string | null;
          zip?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "accounts_referred_by_account_id_fkey";
            columns: ["referred_by_account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      admin_notes: {
        Row: {
          account_id: string;
          author_user_id: string | null;
          created_at: string;
          id: string;
          note: string;
          updated_at: string;
        };
        Insert: {
          account_id: string;
          author_user_id?: string | null;
          created_at?: string;
          id?: string;
          note: string;
          updated_at?: string;
        };
        Update: {
          account_id?: string;
          author_user_id?: string | null;
          created_at?: string;
          id?: string;
          note?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "admin_notes_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      alerts: {
        Row: {
          account_id: string;
          call_id: string | null;
          channel: string;
          created_at: string;
          id: string;
          lead_id: string | null;
          sent_at: string | null;
          status: string;
          twilio_sid: string | null;
          updated_at: string;
        };
        Insert: {
          account_id: string;
          call_id?: string | null;
          channel: string;
          created_at?: string;
          id?: string;
          lead_id?: string | null;
          sent_at?: string | null;
          status?: string;
          twilio_sid?: string | null;
          updated_at?: string;
        };
        Update: {
          account_id?: string;
          call_id?: string | null;
          channel?: string;
          created_at?: string;
          id?: string;
          lead_id?: string | null;
          sent_at?: string | null;
          status?: string;
          twilio_sid?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "alerts_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "alerts_call_id_fkey";
            columns: ["call_id"];
            isOneToOne: false;
            referencedRelation: "calls";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "alerts_lead_id_fkey";
            columns: ["lead_id"];
            isOneToOne: false;
            referencedRelation: "leads";
            referencedColumns: ["id"];
          },
        ];
      };
      calls: {
        Row: {
          account_id: string;
          contact_id: string | null;
          created_at: string;
          forwarded_from: string | null;
          from_phone: string;
          id: string;
          is_emergency: boolean;
          number_id: string | null;
          recording_duration: number | null;
          recording_url: string | null;
          started_at: string;
          status: string;
          summary: string | null;
          to_phone: string;
          transcript: string | null;
          twilio_call_sid: string;
          updated_at: string;
        };
        Insert: {
          account_id: string;
          contact_id?: string | null;
          created_at?: string;
          forwarded_from?: string | null;
          from_phone: string;
          id?: string;
          is_emergency?: boolean;
          number_id?: string | null;
          recording_duration?: number | null;
          recording_url?: string | null;
          started_at?: string;
          status?: string;
          summary?: string | null;
          to_phone: string;
          transcript?: string | null;
          twilio_call_sid: string;
          updated_at?: string;
        };
        Update: {
          account_id?: string;
          contact_id?: string | null;
          created_at?: string;
          forwarded_from?: string | null;
          from_phone?: string;
          id?: string;
          is_emergency?: boolean;
          number_id?: string | null;
          recording_duration?: number | null;
          recording_url?: string | null;
          started_at?: string;
          status?: string;
          summary?: string | null;
          to_phone?: string;
          transcript?: string | null;
          twilio_call_sid?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "calls_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "calls_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "calls_number_id_fkey";
            columns: ["number_id"];
            isOneToOne: false;
            referencedRelation: "numbers";
            referencedColumns: ["id"];
          },
        ];
      };
      contacts: {
        Row: {
          account_id: string;
          address: string | null;
          consent_evidence: Json;
          consent_source: string | null;
          created_at: string;
          email: string | null;
          id: string;
          name: string | null;
          opted_out: boolean;
          opted_out_at: string | null;
          phone: string;
          updated_at: string;
        };
        Insert: {
          account_id: string;
          address?: string | null;
          consent_evidence?: Json;
          consent_source?: string | null;
          created_at?: string;
          email?: string | null;
          id?: string;
          name?: string | null;
          opted_out?: boolean;
          opted_out_at?: string | null;
          phone: string;
          updated_at?: string;
        };
        Update: {
          account_id?: string;
          address?: string | null;
          consent_evidence?: Json;
          consent_source?: string | null;
          created_at?: string;
          email?: string | null;
          id?: string;
          name?: string | null;
          opted_out?: boolean;
          opted_out_at?: string | null;
          phone?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "contacts_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      conversations: {
        Row: {
          account_id: string;
          ai_paused: boolean;
          channel: string;
          contact_id: string;
          counted_for_usage: boolean;
          created_at: string;
          id: string;
          last_message_at: string | null;
          number_id: string | null;
          paused_by_user_id: string | null;
          source: string;
          status: string;
          turn_count: number;
          updated_at: string;
        };
        Insert: {
          account_id: string;
          ai_paused?: boolean;
          channel?: string;
          contact_id: string;
          counted_for_usage?: boolean;
          created_at?: string;
          id?: string;
          last_message_at?: string | null;
          number_id?: string | null;
          paused_by_user_id?: string | null;
          source: string;
          status?: string;
          turn_count?: number;
          updated_at?: string;
        };
        Update: {
          account_id?: string;
          ai_paused?: boolean;
          channel?: string;
          contact_id?: string;
          counted_for_usage?: boolean;
          created_at?: string;
          id?: string;
          last_message_at?: string | null;
          number_id?: string | null;
          paused_by_user_id?: string | null;
          source?: string;
          status?: string;
          turn_count?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "conversations_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversations_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversations_number_id_fkey";
            columns: ["number_id"];
            isOneToOne: false;
            referencedRelation: "numbers";
            referencedColumns: ["id"];
          },
        ];
      };
      events: {
        Row: {
          account_id: string | null;
          created_at: string;
          id: number;
          name: string;
          occurred_at: string;
          props: Json;
          user_id: string | null;
        };
        Insert: {
          account_id?: string | null;
          created_at?: string;
          id?: number;
          name: string;
          occurred_at?: string;
          props?: Json;
          user_id?: string | null;
        };
        Update: {
          account_id?: string | null;
          created_at?: string;
          id?: number;
          name?: string;
          occurred_at?: string;
          props?: Json;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "events_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      lead_sources: {
        Row: {
          account_id: string;
          created_at: string;
          enabled: boolean;
          id: string;
          inbound_email: string | null;
          meta_form_ids: string[] | null;
          meta_page_id: string | null;
          type: string;
          updated_at: string;
          webhook_secret: string | null;
        };
        Insert: {
          account_id: string;
          created_at?: string;
          enabled?: boolean;
          id?: string;
          inbound_email?: string | null;
          meta_form_ids?: string[] | null;
          meta_page_id?: string | null;
          type: string;
          updated_at?: string;
          webhook_secret?: string | null;
        };
        Update: {
          account_id?: string;
          created_at?: string;
          enabled?: boolean;
          id?: string;
          inbound_email?: string | null;
          meta_form_ids?: string[] | null;
          meta_page_id?: string | null;
          type?: string;
          updated_at?: string;
          webhook_secret?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "lead_sources_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      leads: {
        Row: {
          account_id: string;
          address: string | null;
          booked_at: string | null;
          contact_id: string;
          conversation_id: string | null;
          created_at: string;
          est_value_usd: number | null;
          external_ref: string | null;
          id: string;
          issue: string | null;
          lost_reason: string | null;
          name: string | null;
          phone: string;
          preferred_window: string | null;
          raw: Json;
          source: string;
          status: string;
          updated_at: string;
          urgency: string | null;
          zip: string | null;
        };
        Insert: {
          account_id: string;
          address?: string | null;
          booked_at?: string | null;
          contact_id: string;
          conversation_id?: string | null;
          created_at?: string;
          est_value_usd?: number | null;
          external_ref?: string | null;
          id?: string;
          issue?: string | null;
          lost_reason?: string | null;
          name?: string | null;
          phone: string;
          preferred_window?: string | null;
          raw?: Json;
          source?: string;
          status?: string;
          updated_at?: string;
          urgency?: string | null;
          zip?: string | null;
        };
        Update: {
          account_id?: string;
          address?: string | null;
          booked_at?: string | null;
          contact_id?: string;
          conversation_id?: string | null;
          created_at?: string;
          est_value_usd?: number | null;
          external_ref?: string | null;
          id?: string;
          issue?: string | null;
          lost_reason?: string | null;
          name?: string | null;
          phone?: string;
          preferred_window?: string | null;
          raw?: Json;
          source?: string;
          status?: string;
          updated_at?: string;
          urgency?: string | null;
          zip?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "leads_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "leads_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "leads_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
        ];
      };
      messages: {
        Row: {
          account_id: string;
          author: string;
          body: string;
          conversation_id: string;
          cost_usd: number;
          created_at: string;
          direction: string;
          error_code: string | null;
          id: string;
          model: string | null;
          segments: number;
          send_after: string | null;
          status: string;
          tokens_in: number;
          tokens_out: number;
          twilio_sid: string | null;
          updated_at: string;
        };
        Insert: {
          account_id: string;
          author: string;
          body: string;
          conversation_id: string;
          cost_usd?: number;
          created_at?: string;
          direction: string;
          error_code?: string | null;
          id?: string;
          model?: string | null;
          segments?: number;
          send_after?: string | null;
          status?: string;
          tokens_in?: number;
          tokens_out?: number;
          twilio_sid?: string | null;
          updated_at?: string;
        };
        Update: {
          account_id?: string;
          author?: string;
          body?: string;
          conversation_id?: string;
          cost_usd?: number;
          created_at?: string;
          direction?: string;
          error_code?: string | null;
          id?: string;
          model?: string | null;
          segments?: number;
          send_after?: string | null;
          status?: string;
          tokens_in?: number;
          tokens_out?: number;
          twilio_sid?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "messages_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "messages_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
        ];
      };
      numbers: {
        Row: {
          account_id: string;
          created_at: string;
          id: string;
          phone_number: string;
          purpose: string;
          rejection_reason: string | null;
          sms_enabled: boolean;
          tendlc_brand_sid: string | null;
          tendlc_campaign_sid: string | null;
          twilio_sid: string | null;
          type: string;
          updated_at: string;
          verification_sid: string | null;
          verification_status: string;
          verification_submitted_at: string | null;
          verified_at: string | null;
          voice_enabled: boolean;
        };
        Insert: {
          account_id: string;
          created_at?: string;
          id?: string;
          phone_number: string;
          purpose?: string;
          rejection_reason?: string | null;
          sms_enabled?: boolean;
          tendlc_brand_sid?: string | null;
          tendlc_campaign_sid?: string | null;
          twilio_sid?: string | null;
          type?: string;
          updated_at?: string;
          verification_sid?: string | null;
          verification_status?: string;
          verification_submitted_at?: string | null;
          verified_at?: string | null;
          voice_enabled?: boolean;
        };
        Update: {
          account_id?: string;
          created_at?: string;
          id?: string;
          phone_number?: string;
          purpose?: string;
          rejection_reason?: string | null;
          sms_enabled?: boolean;
          tendlc_brand_sid?: string | null;
          tendlc_campaign_sid?: string | null;
          twilio_sid?: string | null;
          type?: string;
          updated_at?: string;
          verification_sid?: string | null;
          verification_status?: string;
          verification_submitted_at?: string | null;
          verified_at?: string | null;
          voice_enabled?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "numbers_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      referrals: {
        Row: {
          created_at: string;
          id: string;
          referred_account_id: string;
          referrer_account_id: string;
          status: string;
          stripe_coupon_id: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          referred_account_id: string;
          referrer_account_id: string;
          status?: string;
          stripe_coupon_id?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          referred_account_id?: string;
          referrer_account_id?: string;
          status?: string;
          stripe_coupon_id?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "referrals_referred_account_id_fkey";
            columns: ["referred_account_id"];
            isOneToOne: true;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "referrals_referrer_account_id_fkey";
            columns: ["referrer_account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      subscriptions: {
        Row: {
          account_id: string;
          cancel_at_period_end: boolean;
          created_at: string;
          current_period_end: string | null;
          id: string;
          interval: string | null;
          paid_now: boolean;
          pause_until: string | null;
          plan: string | null;
          setup_fee_paid: boolean;
          status: string;
          stripe_price_id: string | null;
          stripe_subscription_id: string;
          trial_end: string | null;
          updated_at: string;
        };
        Insert: {
          account_id: string;
          cancel_at_period_end?: boolean;
          created_at?: string;
          current_period_end?: string | null;
          id?: string;
          interval?: string | null;
          paid_now?: boolean;
          pause_until?: string | null;
          plan?: string | null;
          setup_fee_paid?: boolean;
          status?: string;
          stripe_price_id?: string | null;
          stripe_subscription_id: string;
          trial_end?: string | null;
          updated_at?: string;
        };
        Update: {
          account_id?: string;
          cancel_at_period_end?: boolean;
          created_at?: string;
          current_period_end?: string | null;
          id?: string;
          interval?: string | null;
          paid_now?: boolean;
          pause_until?: string | null;
          plan?: string | null;
          setup_fee_paid?: boolean;
          status?: string;
          stripe_price_id?: string | null;
          stripe_subscription_id?: string;
          trial_end?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "subscriptions_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: true;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      usage_monthly: {
        Row: {
          account_id: string;
          ai_cost_usd: number;
          conversations: number;
          created_at: string;
          overage_reported: boolean;
          period: string;
          sms_segments_in: number;
          sms_segments_out: number;
          updated_at: string;
          voice_minutes: number;
        };
        Insert: {
          account_id: string;
          ai_cost_usd?: number;
          conversations?: number;
          created_at?: string;
          overage_reported?: boolean;
          period: string;
          sms_segments_in?: number;
          sms_segments_out?: number;
          updated_at?: string;
          voice_minutes?: number;
        };
        Update: {
          account_id?: string;
          ai_cost_usd?: number;
          conversations?: number;
          created_at?: string;
          overage_reported?: boolean;
          period?: string;
          sms_segments_in?: number;
          sms_segments_out?: number;
          updated_at?: string;
          voice_minutes?: number;
        };
        Relationships: [
          {
            foreignKeyName: "usage_monthly_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
        ];
      };
      verification_events: {
        Row: {
          account_id: string;
          created_at: string;
          id: string;
          number_id: string;
          payload: Json;
          received_at: string;
          status: string;
          updated_at: string;
        };
        Insert: {
          account_id: string;
          created_at?: string;
          id?: string;
          number_id: string;
          payload?: Json;
          received_at?: string;
          status: string;
          updated_at?: string;
        };
        Update: {
          account_id?: string;
          created_at?: string;
          id?: string;
          number_id?: string;
          payload?: Json;
          received_at?: string;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "verification_events_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "verification_events_number_id_fkey";
            columns: ["number_id"];
            isOneToOne: false;
            referencedRelation: "numbers";
            referencedColumns: ["id"];
          },
        ];
      };
      weekly_reports: {
        Row: {
          account_id: string;
          created_at: string;
          id: string;
          sent_at: string | null;
          stats: Json;
          updated_at: string;
          week_start: string;
        };
        Insert: {
          account_id: string;
          created_at?: string;
          id?: string;
          sent_at?: string | null;
          stats?: Json;
          updated_at?: string;
          week_start: string;
        };
        Update: {
          account_id?: string;
          created_at?: string;
          id?: string;
          sent_at?: string | null;
          stats?: Json;
          updated_at?: string;
          week_start?: string;
        };
        Relationships: [
          {
            foreignKeyName: "weekly_reports_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "accounts";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      generate_referral_code: {
        Args: { len?: number };
        Returns: string;
      };
      is_account_member: {
        Args: { account: string };
        Returns: boolean;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

export const Constants = {
  public: {
    Enums: {},
  },
} as const;

// -----------------------------------------------------------------------------
// Convenience aliases (not part of the generator output; keep below this line
// when regenerating so they survive a `supabase gen types` overwrite + re-append).
// -----------------------------------------------------------------------------

export type Tables<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Row"];
export type TablesInsert<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof Database["public"]["Tables"]> = Database["public"]["Tables"][T]["Update"];

export type AccountRow = Tables<"accounts">;
export type AccountMemberRow = Tables<"account_members">;
export type NumberRow = Tables<"numbers">;
export type ContactRow = Tables<"contacts">;
export type ConversationRow = Tables<"conversations">;
export type MessageRow = Tables<"messages">;
export type CallRow = Tables<"calls">;
export type LeadRow = Tables<"leads">;
export type AlertRow = Tables<"alerts">;
export type SubscriptionRow = Tables<"subscriptions">;
export type UsageMonthlyRow = Tables<"usage_monthly">;
export type VerificationEventRow = Tables<"verification_events">;
export type LeadSourceRow = Tables<"lead_sources">;
export type EventRow = Tables<"events">;
export type WeeklyReportRow = Tables<"weekly_reports">;
export type ReferralRow = Tables<"referrals">;
export type AdminNoteRow = Tables<"admin_notes">;

/**
 * Literal unions for the text columns that the migration constrains with CHECK.
 * The generated Row types keep them as `string`; narrow with these in app code.
 */
export type AccountStatus = "onboarding" | "pending_verification" | "live" | "paused" | "cancelled";
export type AccountTrade = "hvac" | "plumbing" | "electrical" | "other";
export type AccountPlan = "starter" | "pro";
export type MemberRole = "owner" | "staff";
export type NumberType = "tollfree" | "local";
export type NumberPurpose = "customer" | "notification" | "demo";
export type VerificationStatus = "not_submitted" | "pending" | "in_review" | "verified" | "rejected";
export type ConsentSource = "inbound_call" | "lead_form" | "web_form" | "inbound_sms" | "manual";
export type ConversationChannel = "sms" | "email";
export type ConversationSource = "missed_call" | "lead_form" | "web_form" | "inbound_sms" | "manual";
export type ConversationStatus = "open" | "qualified" | "booked" | "lost" | "closed";
export type MessageDirection = "in" | "out";
export type MessageAuthor = "ai" | "owner" | "contact" | "system";
export type MessageStatus = "queued" | "sent" | "delivered" | "failed" | "received";
export type CallStatus = "missed" | "voicemail" | "answered_by_greeting" | "test";
export type LeadUrgency = "emergency" | "today" | "this_week" | "flexible";
export type LeadStatus = "new" | "qualified" | "booked" | "lost";
export type AlertChannel = "sms" | "email" | "voice";
export type AlertStatus = "queued" | "sent" | "delivered" | "failed";
export type SubscriptionInterval = "month" | "year";
export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "paused"
  | "canceled"
  | "incomplete"
  | "incomplete_expired"
  | "unpaid";
export type LeadSourceType = "resend_inbox" | "webhook" | "zapier" | "meta_page";
export type ReferralStatus = "pending" | "rewarded";
