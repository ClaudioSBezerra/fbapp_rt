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
      aliquotas: {
        Row: {
          ano: number
          cbs: number
          created_at: string
          ibs_estadual: number
          ibs_municipal: number
          id: string
          is_active: boolean | null
          reduc_icms: number
          reduc_piscofins: number
          updated_at: string
        }
        Insert: {
          ano: number
          cbs?: number
          created_at?: string
          ibs_estadual?: number
          ibs_municipal?: number
          id?: string
          is_active?: boolean | null
          reduc_icms?: number
          reduc_piscofins?: number
          updated_at?: string
        }
        Update: {
          ano?: number
          cbs?: number
          created_at?: string
          ibs_estadual?: number
          ibs_municipal?: number
          id?: string
          is_active?: boolean | null
          reduc_icms?: number
          reduc_piscofins?: number
          updated_at?: string
        }
        Relationships: []
      }
      empresas: {
        Row: {
          created_at: string
          grupo_id: string
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          grupo_id: string
          id?: string
          nome: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          grupo_id?: string
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "empresas_grupo_id_fkey"
            columns: ["grupo_id"]
            isOneToOne: false
            referencedRelation: "grupos_empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      energia_agua: {
        Row: {
          cnpj_fornecedor: string | null
          cofins: number
          created_at: string
          descricao: string | null
          filial_id: string
          icms: number
          id: string
          mes_ano: string
          pis: number
          tipo_operacao: string
          tipo_servico: string
          updated_at: string
          valor: number
        }
        Insert: {
          cnpj_fornecedor?: string | null
          cofins?: number
          created_at?: string
          descricao?: string | null
          filial_id: string
          icms?: number
          id?: string
          mes_ano: string
          pis?: number
          tipo_operacao: string
          tipo_servico: string
          updated_at?: string
          valor?: number
        }
        Update: {
          cnpj_fornecedor?: string | null
          cofins?: number
          created_at?: string
          descricao?: string | null
          filial_id?: string
          icms?: number
          id?: string
          mes_ano?: string
          pis?: number
          tipo_operacao?: string
          tipo_servico?: string
          updated_at?: string
          valor?: number
        }
        Relationships: []
      }
      filiais: {
        Row: {
          cnpj: string
          created_at: string
          empresa_id: string
          id: string
          nome_fantasia: string | null
          razao_social: string
          updated_at: string
        }
        Insert: {
          cnpj: string
          created_at?: string
          empresa_id: string
          id?: string
          nome_fantasia?: string | null
          razao_social: string
          updated_at?: string
        }
        Update: {
          cnpj?: string
          created_at?: string
          empresa_id?: string
          id?: string
          nome_fantasia?: string | null
          razao_social?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "filiais_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      fretes: {
        Row: {
          cnpj_transportadora: string | null
          cofins: number
          created_at: string
          descricao: string | null
          filial_id: string
          icms: number
          id: string
          mes_ano: string
          ncm: string | null
          pis: number
          tipo: string
          updated_at: string
          valor: number
        }
        Insert: {
          cnpj_transportadora?: string | null
          cofins?: number
          created_at?: string
          descricao?: string | null
          filial_id: string
          icms?: number
          id?: string
          mes_ano: string
          ncm?: string | null
          pis?: number
          tipo: string
          updated_at?: string
          valor?: number
        }
        Update: {
          cnpj_transportadora?: string | null
          cofins?: number
          created_at?: string
          descricao?: string | null
          filial_id?: string
          icms?: number
          id?: string
          mes_ano?: string
          ncm?: string | null
          pis?: number
          tipo?: string
          updated_at?: string
          valor?: number
        }
        Relationships: []
      }
      grupos_empresas: {
        Row: {
          created_at: string
          id: string
          nome: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          nome: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          nome?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "grupos_empresas_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      import_jobs: {
        Row: {
          bytes_processed: number | null
          chunk_number: number | null
          completed_at: string | null
          counts: Json
          created_at: string
          empresa_id: string
          error_message: string | null
          file_name: string
          file_path: string
          file_size: number
          filial_id: string | null
          id: string
          import_scope: string
          progress: number
          record_limit: number | null
          started_at: string | null
          status: string
          total_lines: number
          updated_at: string
          user_id: string
        }
        Insert: {
          bytes_processed?: number | null
          chunk_number?: number | null
          completed_at?: string | null
          counts?: Json
          created_at?: string
          empresa_id: string
          error_message?: string | null
          file_name: string
          file_path: string
          file_size?: number
          filial_id?: string | null
          id?: string
          import_scope?: string
          progress?: number
          record_limit?: number | null
          started_at?: string | null
          status?: string
          total_lines?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          bytes_processed?: number | null
          chunk_number?: number | null
          completed_at?: string | null
          counts?: Json
          created_at?: string
          empresa_id?: string
          error_message?: string | null
          file_name?: string
          file_path?: string
          file_size?: number
          filial_id?: string | null
          id?: string
          import_scope?: string
          progress?: number
          record_limit?: number | null
          started_at?: string | null
          status?: string
          total_lines?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "import_jobs_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "import_jobs_filial_id_fkey"
            columns: ["filial_id"]
            isOneToOne: false
            referencedRelation: "filiais"
            referencedColumns: ["id"]
          },
        ]
      }
      mercadorias: {
        Row: {
          cofins: number
          created_at: string
          descricao: string | null
          filial_id: string
          icms: number | null
          id: string
          ipi: number | null
          mes_ano: string
          ncm: string | null
          pis: number
          tipo: string
          updated_at: string
          valor: number
        }
        Insert: {
          cofins?: number
          created_at?: string
          descricao?: string | null
          filial_id: string
          icms?: number | null
          id?: string
          ipi?: number | null
          mes_ano: string
          ncm?: string | null
          pis?: number
          tipo: string
          updated_at?: string
          valor?: number
        }
        Update: {
          cofins?: number
          created_at?: string
          descricao?: string | null
          filial_id?: string
          icms?: number | null
          id?: string
          ipi?: number | null
          mes_ano?: string
          ncm?: string | null
          pis?: number
          tipo?: string
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "mercadorias_filial_id_fkey"
            columns: ["filial_id"]
            isOneToOne: false
            referencedRelation: "filiais"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      tenants: {
        Row: {
          created_at: string
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          nome?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_tenants: {
        Row: {
          created_at: string
          id: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_tenants_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      delete_energia_agua_batch: {
        Args: { _batch_size?: number; _filial_ids: string[] }
        Returns: number
      }
      delete_fretes_batch: {
        Args: { _batch_size?: number; _filial_ids: string[] }
        Returns: number
      }
      delete_mercadorias_batch: {
        Args: { _batch_size?: number; _filial_ids: string[] }
        Returns: number
      }
      get_mercadorias_aggregated: {
        Args: never
        Returns: {
          cofins: number
          filial_id: string
          filial_nome: string
          icms: number
          mes_ano: string
          pis: number
          tipo: string
          valor: number
        }[]
      }
      get_mv_dashboard_stats: {
        Args: { _mes_ano?: string }
        Returns: {
          categoria: string
          cofins: number
          icms: number
          mes_ano: string
          pis: number
          subtipo: string
          valor: number
        }[]
      }
      get_mv_energia_agua_aggregated: {
        Args: never
        Returns: {
          cofins: number
          filial_id: string
          filial_nome: string
          icms: number
          mes_ano: string
          pis: number
          tipo_operacao: string
          tipo_servico: string
          valor: number
        }[]
      }
      get_mv_fretes_aggregated: {
        Args: never
        Returns: {
          cofins: number
          filial_id: string
          filial_nome: string
          icms: number
          mes_ano: string
          pis: number
          tipo: string
          valor: number
        }[]
      }
      get_mv_mercadorias_aggregated: {
        Args: never
        Returns: {
          cofins: number
          filial_id: string
          filial_nome: string
          icms: number
          mes_ano: string
          pis: number
          tipo: string
          valor: number
        }[]
      }
      has_filial_access: {
        Args: { _filial_id: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      has_tenant_access: {
        Args: { _tenant_id: string; _user_id: string }
        Returns: boolean
      }
      refresh_materialized_views: { Args: never; Returns: undefined }
    }
    Enums: {
      app_role: "admin" | "user" | "viewer"
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
      app_role: ["admin", "user", "viewer"],
    },
  },
} as const
