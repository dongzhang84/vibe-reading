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
  vr: {
    Tables: {
      books: {
        Row: {
          author: string | null
          created_at: string | null
          id: string
          overview: string | null
          owner_id: string | null
          page_count: number | null
          session_id: string | null
          storage_path: string
          suggested_questions: Json | null
          title: string
          toc: Json | null
        }
        Insert: {
          author?: string | null
          created_at?: string | null
          id?: string
          overview?: string | null
          owner_id?: string | null
          page_count?: number | null
          session_id?: string | null
          storage_path: string
          suggested_questions?: Json | null
          title: string
          toc?: Json | null
        }
        Update: {
          author?: string | null
          created_at?: string | null
          id?: string
          overview?: string | null
          owner_id?: string | null
          page_count?: number | null
          session_id?: string | null
          storage_path?: string
          suggested_questions?: Json | null
          title?: string
          toc?: Json | null
        }
        Relationships: []
      }
      briefs: {
        Row: {
          chapter_id: string
          created_at: string | null
          example: string
          id: string
          key_claims: Json
          not_addressed: string
          one_sentence: string
        }
        Insert: {
          chapter_id: string
          created_at?: string | null
          example: string
          id?: string
          key_claims: Json
          not_addressed: string
          one_sentence: string
        }
        Update: {
          chapter_id?: string
          created_at?: string | null
          example?: string
          id?: string
          key_claims?: Json
          not_addressed?: string
          one_sentence?: string
        }
        Relationships: [
          {
            foreignKeyName: "briefs_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: true
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
        ]
      }
      chapters: {
        Row: {
          book_id: string
          content: string
          id: string
          level: number | null
          page_end: number | null
          page_start: number | null
          seq: number
          title: string
        }
        Insert: {
          book_id: string
          content: string
          id?: string
          level?: number | null
          page_end?: number | null
          page_start?: number | null
          seq: number
          title: string
        }
        Update: {
          book_id?: string
          content?: string
          id?: string
          level?: number | null
          page_end?: number | null
          page_start?: number | null
          seq?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "chapters_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
        ]
      }
      question_chapters: {
        Row: {
          chapter_id: string | null
          created_at: string | null
          id: string
          question_id: string
          rank: number
          reason: string
        }
        Insert: {
          chapter_id?: string | null
          created_at?: string | null
          id?: string
          question_id: string
          rank: number
          reason: string
        }
        Update: {
          chapter_id?: string | null
          created_at?: string | null
          id?: string
          question_id?: string
          rank?: number
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "question_chapters_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "question_chapters_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "questions"
            referencedColumns: ["id"]
          },
        ]
      }
      questions: {
        Row: {
          book_id: string
          created_at: string | null
          id: string
          text: string
          user_id: string
        }
        Insert: {
          book_id: string
          created_at?: string | null
          id?: string
          text: string
          user_id: string
        }
        Update: {
          book_id?: string
          created_at?: string | null
          id?: string
          text?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "questions_book_id_fkey"
            columns: ["book_id"]
            isOneToOne: false
            referencedRelation: "books"
            referencedColumns: ["id"]
          },
        ]
      }
      restatements: {
        Row: {
          chapter_id: string
          created_at: string | null
          follow_up: string | null
          got_right: Json
          id: string
          missed: Json
          text: string
          user_id: string
        }
        Insert: {
          chapter_id: string
          created_at?: string | null
          follow_up?: string | null
          got_right: Json
          id?: string
          missed: Json
          text: string
          user_id: string
        }
        Update: {
          chapter_id?: string
          created_at?: string | null
          follow_up?: string | null
          got_right?: Json
          id?: string
          missed?: Json
          text?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "restatements_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
  vr: {
    Enums: {},
  },
} as const
