export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string | null;
          display_name: string | null;
          avatar_url: string | null;
          bio: string | null;
          role: "user" | "admin";
          credits: number;
          created_at: string;
        };
        Insert: {
          id: string;
          email?: string | null;
          display_name?: string | null;
          avatar_url?: string | null;
          bio?: string | null;
          role?: "user" | "admin";
          credits?: number;
          created_at?: string;
        };
        Update: {
          email?: string | null;
          display_name?: string | null;
          avatar_url?: string | null;
          bio?: string | null;
          role?: "user" | "admin";
          credits?: number;
        };
        Relationships: [];
      };
      credit_ledger: {
        Row: {
          id: string;
          user_id: string;
          delta: number;
          reason: string;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          delta: number;
          reason: string;
          created_by?: string | null;
          created_at?: string;
        };
        Update: never;
        Relationships: [];
      };
      image_providers: {
        Row: {
          id: string;
          label: string;
          base_url: string;
          api_key: string;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          label: string;
          base_url: string;
          api_key: string;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          label?: string;
          base_url?: string;
          api_key?: string;
          is_active?: boolean;
        };
        Relationships: [];
      };
      image_models: {
        Row: {
          id: string;
          provider_id: string;
          name: string;
          display_name: string;
          credit_cost: number;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          provider_id: string;
          name: string;
          display_name: string;
          credit_cost: number;
          is_active?: boolean;
          created_at?: string;
        };
        Update: {
          provider_id?: string;
          name?: string;
          display_name?: string;
          credit_cost?: number;
          is_active?: boolean;
        };
        Relationships: [];
      };
      generated_images: {
        Row: {
          id: string;
          user_id: string;
          model_id: string | null;
          title: string;
          prompt: string;
          description: string | null;
          reference_images: Json;
          image_url: string;
          width: number;
          height: number;
          is_public: boolean;
          is_featured: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          model_id?: string | null;
          title: string;
          prompt: string;
          description?: string | null;
          reference_images?: Json;
          image_url: string;
          width?: number;
          height?: number;
          is_public?: boolean;
          is_featured?: boolean;
          created_at?: string;
        };
        Update: {
          title?: string;
          description?: string | null;
          reference_images?: Json;
          is_public?: boolean;
          is_featured?: boolean;
        };
        Relationships: [];
      };
      generation_tasks: {
        Row: {
          id: string;
          user_id: string;
          model_id: string;
          prompt: string;
          size: string;
          status: "queued" | "running" | "succeeded" | "failed";
          credits_charged: number;
          image_id: string | null;
          error_message: string | null;
          created_at: string;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          model_id: string;
          prompt: string;
          size: string;
          status?: "queued" | "running" | "succeeded" | "failed";
          credits_charged?: number;
          image_id?: string | null;
          error_message?: string | null;
          created_at?: string;
          completed_at?: string | null;
        };
        Update: {
          status?: "queued" | "running" | "succeeded" | "failed";
          credits_charged?: number;
          image_id?: string | null;
          error_message?: string | null;
          completed_at?: string | null;
        };
        Relationships: [];
      };
      gallery_comments: {
        Row: {
          id: string;
          image_id: string;
          user_id: string | null;
          body: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          image_id: string;
          user_id?: string | null;
          body: string;
          created_at?: string;
        };
        Update: {
          body?: string;
        };
        Relationships: [
          {
            foreignKeyName: "gallery_comments_image_id_fkey";
            columns: ["image_id"];
            isOneToOne: false;
            referencedRelation: "generated_images";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "gallery_comments_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
    };
    Views: {
      gallery_images: {
        Row: {
          id: string;
          title: string;
          prompt: string;
          description: string | null;
          reference_images: Json;
          image_url: string;
          width: number;
          height: number;
          model_name: string;
          owner_name: string;
          owner_avatar_url: string | null;
          owner_bio: string | null;
          created_at: string;
          is_featured: boolean;
          is_public: boolean;
        };
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Functions: {
      grant_credits: {
        Args: {
          target_user: string;
          credit_delta: number;
          ledger_reason: string;
          actor: string;
        };
        Returns: undefined;
      };
      charge_credits: {
        Args: {
          target_user: string;
          credit_delta: number;
          ledger_reason: string;
        };
        Returns: undefined;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
