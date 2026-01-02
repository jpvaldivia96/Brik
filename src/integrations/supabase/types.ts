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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      access_logs: {
        Row: {
          ci_snapshot: string | null
          contractor_snapshot: string | null
          created_at: string | null
          entry_at: string
          entry_by_user_id: string | null
          exit_at: string | null
          exit_by_user_id: string | null
          id: string
          name_snapshot: string | null
          observations: string | null
          person_id: string | null
          site_id: string | null
          type_snapshot: Database["public"]["Enums"]["person_type"] | null
          void_reason: string | null
          voided_at: string | null
          voided_by_user_id: string | null
        }
        Insert: {
          ci_snapshot?: string | null
          contractor_snapshot?: string | null
          created_at?: string | null
          entry_at: string
          entry_by_user_id?: string | null
          exit_at?: string | null
          exit_by_user_id?: string | null
          id?: string
          name_snapshot?: string | null
          observations?: string | null
          person_id?: string | null
          site_id?: string | null
          type_snapshot?: Database["public"]["Enums"]["person_type"] | null
          void_reason?: string | null
          voided_at?: string | null
          voided_by_user_id?: string | null
        }
        Update: {
          ci_snapshot?: string | null
          contractor_snapshot?: string | null
          created_at?: string | null
          entry_at?: string
          entry_by_user_id?: string | null
          exit_at?: string | null
          exit_by_user_id?: string | null
          id?: string
          name_snapshot?: string | null
          observations?: string | null
          person_id?: string | null
          site_id?: string | null
          type_snapshot?: Database["public"]["Enums"]["person_type"] | null
          void_reason?: string | null
          voided_at?: string | null
          voided_by_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "access_logs_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_logs_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_events: {
        Row: {
          action: string
          after: Json | null
          before: Json | null
          created_at: string | null
          entity_id: string | null
          entity_type: string | null
          id: string
          note: string | null
          role_snapshot: Database["public"]["Enums"]["role_enum"] | null
          site_id: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          after?: Json | null
          before?: Json | null
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          note?: string | null
          role_snapshot?: Database["public"]["Enums"]["role_enum"] | null
          site_id?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          after?: Json | null
          before?: Json | null
          created_at?: string | null
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          note?: string | null
          role_snapshot?: Database["public"]["Enums"]["role_enum"] | null
          site_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      favorites: {
        Row: {
          id: string
          person_id: string | null
          site_id: string | null
          updated_at: string | null
        }
        Insert: {
          id?: string
          person_id?: string | null
          site_id?: string | null
          updated_at?: string | null
        }
        Update: {
          id?: string
          person_id?: string | null
          site_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "favorites_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "favorites_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      people: {
        Row: {
          ci: string
          contractor: string | null
          created_at: string | null
          full_name: string
          id: string
          photo_url: string | null
          site_id: string | null
          type: Database["public"]["Enums"]["person_type"]
          updated_at: string | null
        }
        Insert: {
          ci: string
          contractor?: string | null
          created_at?: string | null
          full_name: string
          id?: string
          photo_url?: string | null
          site_id?: string | null
          type: Database["public"]["Enums"]["person_type"]
          updated_at?: string | null
        }
        Update: {
          ci?: string
          contractor?: string | null
          created_at?: string | null
          full_name?: string
          id?: string
          photo_url?: string | null
          site_id?: string | null
          type?: Database["public"]["Enums"]["person_type"]
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "people_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      site_memberships: {
        Row: {
          created_at: string | null
          role: Database["public"]["Enums"]["role_enum"]
          site_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          role: Database["public"]["Enums"]["role_enum"]
          site_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          role?: Database["public"]["Enums"]["role_enum"]
          site_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_memberships_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      site_settings: {
        Row: {
          crit_hours: number
          seguro_warn_days: number
          site_id: string
          updated_at: string | null
          warn_hours: number
        }
        Insert: {
          crit_hours?: number
          seguro_warn_days?: number
          site_id: string
          updated_at?: string | null
          warn_hours?: number
        }
        Update: {
          crit_hours?: number
          seguro_warn_days?: number
          site_id?: string
          updated_at?: string | null
          warn_hours?: number
        }
        Relationships: [
          {
            foreignKeyName: "site_settings_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: true
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      sites: {
        Row: {
          created_at: string | null
          id: string
          name: string
          timezone: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          timezone?: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          timezone?: string
        }
        Relationships: []
      }
      visitors_profile: {
        Row: {
          company: string | null
          person_id: string
        }
        Insert: {
          company?: string | null
          person_id: string
        }
        Update: {
          company?: string | null
          person_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "visitors_profile_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: true
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
      workers_profile: {
        Row: {
          blood_type: string | null
          emergency_contact: string | null
          insurance_expiry: string | null
          insurance_number: string | null
          person_id: string
          phone: string | null
        }
        Insert: {
          blood_type?: string | null
          emergency_contact?: string | null
          insurance_expiry?: string | null
          insurance_number?: string | null
          person_id: string
          phone?: string | null
        }
        Update: {
          blood_type?: string | null
          emergency_contact?: string | null
          insurance_expiry?: string | null
          insurance_number?: string | null
          person_id?: string
          phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "workers_profile_person_id_fkey"
            columns: ["person_id"]
            isOneToOne: true
            referencedRelation: "people"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      is_member: { Args: { p_site_id: string }; Returns: boolean }
      is_supervisor: { Args: { p_site_id: string }; Returns: boolean }
      member_role: {
        Args: { p_site_id: string }
        Returns: Database["public"]["Enums"]["role_enum"]
      }
    }
    Enums: {
      person_type: "worker" | "visitor"
      role_enum: "guard" | "supervisor"
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
      person_type: ["worker", "visitor"],
      role_enum: ["guard", "supervisor"],
    },
  },
} as const
