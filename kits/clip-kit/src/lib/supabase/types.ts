// Generated-shape Database type for the Clip Kit schema (supabase/migrations).
// Regenerate with `supabase gen types typescript` after schema changes.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  __InternalSupabase: { PostgrestVersion: "14.15" };
  public: {
    Tables: {
      clips: {
        Row: {
          created_at: string;
          end_sec: number;
          error_message: string | null;
          hook: string;
          id: string;
          index: number;
          reasoning: string;
          start_sec: number;
          status: Database["public"]["Enums"]["clip_status"];
          storage_path: string | null;
          title: string;
          updated_at: string;
          user_id: string;
          video_id: string;
          virality_score: number;
        };
        Insert: {
          created_at?: string;
          end_sec: number;
          error_message?: string | null;
          hook: string;
          id?: string;
          index: number;
          reasoning: string;
          start_sec: number;
          status?: Database["public"]["Enums"]["clip_status"];
          storage_path?: string | null;
          title: string;
          updated_at?: string;
          user_id: string;
          video_id: string;
          virality_score: number;
        };
        Update: {
          created_at?: string;
          end_sec?: number;
          error_message?: string | null;
          hook?: string;
          id?: string;
          index?: number;
          reasoning?: string;
          start_sec?: number;
          status?: Database["public"]["Enums"]["clip_status"];
          storage_path?: string | null;
          title?: string;
          updated_at?: string;
          user_id?: string;
          video_id?: string;
          virality_score?: number;
        };
        Relationships: [
          {
            foreignKeyName: "clips_video_id_fkey";
            columns: ["video_id"];
            isOneToOne: false;
            referencedRelation: "videos";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          created_at: string;
          current_period_end: string | null;
          email: string | null;
          id: string;
          plan: Database["public"]["Enums"]["plan_tier"];
          stripe_customer_id: string | null;
          stripe_subscription_id: string | null;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          current_period_end?: string | null;
          email?: string | null;
          id: string;
          plan?: Database["public"]["Enums"]["plan_tier"];
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          current_period_end?: string | null;
          email?: string | null;
          id?: string;
          plan?: Database["public"]["Enums"]["plan_tier"];
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      videos: {
        Row: {
          created_at: string;
          duration_sec: number | null;
          error_message: string | null;
          id: string;
          mime_type: string;
          original_filename: string;
          status: Database["public"]["Enums"]["video_status"];
          storage_path: string | null;
          title: string;
          transcript_text: string | null;
          transcript_words: Json | null;
          updated_at: string;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          duration_sec?: number | null;
          error_message?: string | null;
          id?: string;
          mime_type: string;
          original_filename: string;
          status?: Database["public"]["Enums"]["video_status"];
          storage_path?: string | null;
          title: string;
          transcript_text?: string | null;
          transcript_words?: Json | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          duration_sec?: number | null;
          error_message?: string | null;
          id?: string;
          mime_type?: string;
          original_filename?: string;
          status?: Database["public"]["Enums"]["video_status"];
          storage_path?: string | null;
          title?: string;
          transcript_text?: string | null;
          transcript_words?: Json | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: {
      clip_status: "PENDING" | "RENDERING" | "DONE" | "FAILED";
      plan_tier: "free" | "creator" | "studio";
      video_status:
        | "UPLOADING"
        | "UPLOADED"
        | "EXTRACTING_AUDIO"
        | "TRANSCRIBING"
        | "SELECTING_CLIPS"
        | "RENDERING"
        | "DONE"
        | "FAILED";
    };
    CompositeTypes: { [_ in never]: never };
  };
};

export type PlanTier = Database["public"]["Enums"]["plan_tier"];
export type VideoStatus = Database["public"]["Enums"]["video_status"];
export type ClipStatus = Database["public"]["Enums"]["clip_status"];
export type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];
export type VideoRow = Database["public"]["Tables"]["videos"]["Row"];
export type ClipRow = Database["public"]["Tables"]["clips"]["Row"];
