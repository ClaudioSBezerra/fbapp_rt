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
      audit_logs: {
        Row: {
          action: string
          created_at: string | null
          details: Json | null
          id: string
          record_count: number | null
          table_name: string | null
          tenant_id: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string | null
          details?: Json | null
          id?: string
          record_count?: number | null
          table_name?: string | null
          tenant_id: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string | null
          details?: Json | null
          id?: string
          record_count?: number | null
          table_name?: string | null
          tenant_id?: string
          user_id?: string
        }
        Relationships: []
      }
      efd_raw_a100: {
        Row: {
          cofins: number
          created_at: string | null
          filial_id: string
          id: string
          import_job_id: string
          iss: number | null
          mes_ano: string
          pis: number
          tipo: string
          valor: number
        }
        Insert: {
          cofins?: number
          created_at?: string | null
          filial_id: string
          id?: string
          import_job_id: string
          iss?: number | null
          mes_ano: string
          pis?: number
          tipo: string
          valor?: number
        }
        Update: {
          cofins?: number
          created_at?: string | null
          filial_id?: string
          id?: string
          import_job_id?: string
          iss?: number | null
          mes_ano?: string
          pis?: number
          tipo?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "efd_raw_a100_filial_id_fkey"
            columns: ["filial_id"]
            isOneToOne: false
            referencedRelation: "filiais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efd_raw_a100_import_job_id_fkey"
            columns: ["import_job_id"]
            isOneToOne: false
            referencedRelation: "import_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      efd_raw_c100: {
        Row: {
          cod_part: string | null
          cofins: number
          created_at: string | null
          filial_id: string
          icms: number | null
          id: string
          import_job_id: string
          ipi: number | null
          mes_ano: string
          pis: number
          tipo: string
          valor: number
        }
        Insert: {
          cod_part?: string | null
          cofins?: number
          created_at?: string | null
          filial_id: string
          icms?: number | null
          id?: string
          import_job_id: string
          ipi?: number | null
          mes_ano: string
          pis?: number
          tipo: string
          valor?: number
        }
        Update: {
          cod_part?: string | null
          cofins?: number
          created_at?: string | null
          filial_id?: string
          icms?: number | null
          id?: string
          import_job_id?: string
          ipi?: number | null
          mes_ano?: string
          pis?: number
          tipo?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "efd_raw_c100_filial_id_fkey"
            columns: ["filial_id"]
            isOneToOne: false
            referencedRelation: "filiais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efd_raw_c100_import_job_id_fkey"
            columns: ["import_job_id"]
            isOneToOne: false
            referencedRelation: "import_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      efd_raw_c500: {
        Row: {
          cnpj_fornecedor: string | null
          cofins: number
          created_at: string | null
          filial_id: string
          icms: number | null
          id: string
          import_job_id: string
          mes_ano: string
          pis: number
          tipo_operacao: string
          tipo_servico: string
          valor: number
        }
        Insert: {
          cnpj_fornecedor?: string | null
          cofins?: number
          created_at?: string | null
          filial_id: string
          icms?: number | null
          id?: string
          import_job_id: string
          mes_ano: string
          pis?: number
          tipo_operacao: string
          tipo_servico: string
          valor?: number
        }
        Update: {
          cnpj_fornecedor?: string | null
          cofins?: number
          created_at?: string | null
          filial_id?: string
          icms?: number | null
          id?: string
          import_job_id?: string
          mes_ano?: string
          pis?: number
          tipo_operacao?: string
          tipo_servico?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "efd_raw_c500_filial_id_fkey"
            columns: ["filial_id"]
            isOneToOne: false
            referencedRelation: "filiais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efd_raw_c500_import_job_id_fkey"
            columns: ["import_job_id"]
            isOneToOne: false
            referencedRelation: "import_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      efd_raw_fretes: {
        Row: {
          cnpj_transportadora: string | null
          cofins: number
          created_at: string | null
          filial_id: string
          icms: number | null
          id: string
          import_job_id: string
          mes_ano: string
          pis: number
          tipo: string
          valor: number
        }
        Insert: {
          cnpj_transportadora?: string | null
          cofins?: number
          created_at?: string | null
          filial_id: string
          icms?: number | null
          id?: string
          import_job_id: string
          mes_ano: string
          pis?: number
          tipo: string
          valor?: number
        }
        Update: {
          cnpj_transportadora?: string | null
          cofins?: number
          created_at?: string | null
          filial_id?: string
          icms?: number | null
          id?: string
          import_job_id?: string
          mes_ano?: string
          pis?: number
          tipo?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "efd_raw_fretes_filial_id_fkey"
            columns: ["filial_id"]
            isOneToOne: false
            referencedRelation: "filiais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "efd_raw_fretes_import_job_id_fkey"
            columns: ["import_job_id"]
            isOneToOne: false
            referencedRelation: "import_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      empresas: {
        Row: {
          created_at: string
          demo_owner_id: string | null
          grupo_id: string
          id: string
          is_demo: boolean
          nome: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          demo_owner_id?: string | null
          grupo_id: string
          id?: string
          is_demo?: boolean
          nome: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          demo_owner_id?: string | null
          grupo_id?: string
          id?: string
          is_demo?: boolean
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
          cod_est: string | null
          created_at: string
          empresa_id: string
          id: string
          nome_fantasia: string | null
          razao_social: string
          updated_at: string
        }
        Insert: {
          cnpj: string
          cod_est?: string | null
          created_at?: string
          empresa_id: string
          id?: string
          nome_fantasia?: string | null
          razao_social: string
          updated_at?: string
        }
        Update: {
          cnpj?: string
          cod_est?: string | null
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
          mes_ano: string | null
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
          mes_ano?: string | null
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
          mes_ano?: string | null
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
          cod_part: string | null
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
          cod_part?: string | null
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
          cod_part?: string | null
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
      participantes: {
        Row: {
          cnpj: string | null
          cnpj_normalizado: string | null
          cod_mun: string | null
          cod_part: string
          cpf: string | null
          created_at: string
          filial_id: string
          id: string
          ie: string | null
          nome: string
          updated_at: string
        }
        Insert: {
          cnpj?: string | null
          cnpj_normalizado?: string | null
          cod_mun?: string | null
          cod_part: string
          cpf?: string | null
          created_at?: string
          filial_id: string
          id?: string
          ie?: string | null
          nome: string
          updated_at?: string
        }
        Update: {
          cnpj?: string | null
          cnpj_normalizado?: string | null
          cod_mun?: string | null
          cod_part?: string
          cpf?: string | null
          created_at?: string
          filial_id?: string
          id?: string
          ie?: string | null
          nome?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_participantes_filial"
            columns: ["filial_id"]
            isOneToOne: false
            referencedRelation: "filiais"
            referencedColumns: ["id"]
          },
        ]
      }
      password_reset_tokens: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          token: string
          used: boolean | null
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          token: string
          used?: boolean | null
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          token?: string
          used?: boolean | null
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          account_type: Database["public"]["Enums"]["account_type"]
          created_at: string
          demo_trial_ends_at: string | null
          email: string
          full_name: string | null
          id: string
          phone_number: string | null
          security_keyword_hash: string | null
          updated_at: string
        }
        Insert: {
          account_type?: Database["public"]["Enums"]["account_type"]
          created_at?: string
          demo_trial_ends_at?: string | null
          email: string
          full_name?: string | null
          id: string
          phone_number?: string | null
          security_keyword_hash?: string | null
          updated_at?: string
        }
        Update: {
          account_type?: Database["public"]["Enums"]["account_type"]
          created_at?: string
          demo_trial_ends_at?: string | null
          email?: string
          full_name?: string | null
          id?: string
          phone_number?: string | null
          security_keyword_hash?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      servicos: {
        Row: {
          cofins: number
          created_at: string
          descricao: string | null
          filial_id: string
          id: string
          iss: number
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
          id?: string
          iss?: number
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
          id?: string
          iss?: number
          mes_ano?: string
          ncm?: string | null
          pis?: number
          tipo?: string
          updated_at?: string
          valor?: number
        }
        Relationships: []
      }
      simples_nacional: {
        Row: {
          cnpj: string
          created_at: string
          id: string
          is_simples: boolean
          tenant_id: string
          updated_at: string
        }
        Insert: {
          cnpj: string
          created_at?: string
          id?: string
          is_simples?: boolean
          tenant_id: string
          updated_at?: string
        }
        Update: {
          cnpj?: string
          created_at?: string
          id?: string
          is_simples?: boolean
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "simples_nacional_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_plans: {
        Row: {
          created_at: string
          features: Json
          id: string
          is_active: boolean
          name: string
          price_monthly: number
          stripe_price_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          features?: Json
          id?: string
          is_active?: boolean
          name: string
          price_monthly?: number
          stripe_price_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          features?: Json
          id?: string
          is_active?: boolean
          name?: string
          price_monthly?: number
          stripe_price_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      tenants: {
        Row: {
          created_at: string
          id: string
          nome: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_status:
            | Database["public"]["Enums"]["subscription_status"]
            | null
          trial_ends_at: string | null
          trial_started_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          nome?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?:
            | Database["public"]["Enums"]["subscription_status"]
            | null
          trial_ends_at?: string | null
          trial_started_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          nome?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_status?:
            | Database["public"]["Enums"]["subscription_status"]
            | null
          trial_ends_at?: string | null
          trial_started_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_empresas: {
        Row: {
          created_at: string
          empresa_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          empresa_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          empresa_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_empresas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
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
      uso_consumo_imobilizado: {
        Row: {
          cfop: string
          cod_part: string | null
          created_at: string
          filial_id: string
          id: string
          mes_ano: string
          num_doc: string | null
          tenant_id: string
          tipo_operacao: string
          valor: number
          valor_cofins: number
          valor_icms: number
          valor_pis: number
        }
        Insert: {
          cfop: string
          cod_part?: string | null
          created_at?: string
          filial_id: string
          id?: string
          mes_ano: string
          num_doc?: string | null
          tenant_id: string
          tipo_operacao: string
          valor?: number
          valor_cofins?: number
          valor_icms?: number
          valor_pis?: number
        }
        Update: {
          cfop?: string
          cod_part?: string | null
          created_at?: string
          filial_id?: string
          id?: string
          mes_ano?: string
          num_doc?: string | null
          tenant_id?: string
          tipo_operacao?: string
          valor?: number
          valor_cofins?: number
          valor_icms?: number
          valor_pis?: number
        }
        Relationships: [
          {
            foreignKeyName: "uso_consumo_imobilizado_filial_id_fkey"
            columns: ["filial_id"]
            isOneToOne: false
            referencedRelation: "filiais"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_demo_import_limits: {
        Args: { _empresa_id: string; _file_type: string; _mes_ano: string }
        Returns: Json
      }
      cleanup_orphaned_raw_data: { Args: never; Returns: undefined }
      consolidar_energia_agua: { Args: { p_job_id: string }; Returns: Json }
      consolidar_fretes: { Args: { p_job_id: string }; Returns: Json }
      consolidar_import_job: { Args: { p_job_id: string }; Returns: Json }
      consolidar_mercadorias: { Args: { p_job_id: string }; Returns: Json }
      consolidar_mercadorias_batch: {
        Args: { p_batch_size?: number; p_job_id: string }
        Returns: Json
      }
      consolidar_servicos: { Args: { p_job_id: string }; Returns: Json }
      delete_energia_agua_batch: {
        Args: { _batch_size?: number; _filial_ids: string[]; _user_id: string }
        Returns: number
      }
      delete_fretes_batch: {
        Args: { _batch_size?: number; _filial_ids: string[]; _user_id: string }
        Returns: number
      }
      delete_mercadorias_batch: {
        Args: { _batch_size?: number; _filial_ids: string[]; _user_id: string }
        Returns: number
      }
      delete_participantes_batch: {
        Args: { _batch_size?: number; _filial_ids: string[]; _user_id: string }
        Returns: number
      }
      delete_servicos_batch: {
        Args: { _batch_size?: number; _filial_ids: string[]; _user_id: string }
        Returns: number
      }
      delete_uso_consumo_batch: {
        Args: { _batch_size?: number; _filial_ids: string[]; _user_id: string }
        Returns: number
      }
      exec_sql: { Args: { sql: string }; Returns: undefined }
      get_cnpjs_mercadorias_pendentes: {
        Args: { p_tenant_id: string }
        Returns: {
          cnpj: string
          nome: string
          quantidade_docs: number
          valor_total: number
        }[]
      }
      get_cnpjs_uso_consumo_pendentes: {
        Args: { p_tenant_id: string }
        Returns: {
          cnpj: string
          nome: string
          quantidade_docs: number
          valor_total: number
        }[]
      }
      get_demo_status: { Args: { _user_id: string }; Returns: Json }
      get_mercadorias_participante_lista: {
        Args: never
        Returns: {
          cnpj: string
          cod_part: string
          nome: string
        }[]
      }
      get_mercadorias_participante_meses: {
        Args: never
        Returns: {
          mes_ano: string
        }[]
      }
      get_mercadorias_participante_page:
        | {
            Args: {
              p_limit?: number
              p_mes_ano?: string
              p_offset?: number
              p_participante?: string
              p_tipo?: string
            }
            Returns: {
              cod_part: string
              cofins: number
              filial_cnpj: string
              filial_cod_est: string
              filial_id: string
              icms: number
              mes_ano: string
              participante_cnpj: string
              participante_nome: string
              pis: number
              tipo: string
              valor: number
            }[]
          }
        | {
            Args: {
              p_is_simples?: boolean
              p_limit?: number
              p_mes_ano?: string
              p_offset?: number
              p_participante?: string
              p_tipo?: string
            }
            Returns: {
              cod_part: string
              cofins: number
              filial_cnpj: string
              filial_cod_est: string
              filial_id: string
              icms: number
              is_simples: boolean
              mes_ano: string
              participante_cnpj: string
              participante_nome: string
              pis: number
              tipo: string
              valor: number
            }[]
          }
      get_mercadorias_participante_totals: {
        Args: { p_mes_ano?: string; p_participante?: string }
        Returns: {
          total_entradas_cofins: number
          total_entradas_icms: number
          total_entradas_pis: number
          total_entradas_valor: number
          total_registros: number
          total_saidas_cofins: number
          total_saidas_icms: number
          total_saidas_pis: number
          total_saidas_valor: number
          total_valor: number
        }[]
      }
      get_mv_dashboard_stats: {
        Args: { _filial_id?: string; _mes_ano?: string }
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
          filial_cnpj: string
          filial_cod_est: string
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
      get_mv_energia_agua_detailed: {
        Args: { p_is_simples?: boolean }
        Returns: {
          cnpj_fornecedor: string
          cofins: number
          filial_cnpj: string
          filial_cod_est: string
          filial_id: string
          filial_nome: string
          icms: number
          is_simples: boolean
          mes_ano: string
          pis: number
          quantidade_docs: number
          tipo_operacao: string
          tipo_servico: string
          valor: number
        }[]
      }
      get_mv_fretes_aggregated: {
        Args: never
        Returns: {
          cofins: number
          filial_cnpj: string
          filial_cod_est: string
          filial_id: string
          filial_nome: string
          icms: number
          mes_ano: string
          pis: number
          tipo: string
          valor: number
        }[]
      }
      get_mv_fretes_detailed: {
        Args: { p_is_simples?: boolean }
        Returns: {
          cnpj_transportadora: string
          cofins: number
          filial_cnpj: string
          filial_cod_est: string
          filial_id: string
          filial_nome: string
          icms: number
          is_simples: boolean
          mes_ano: string
          pis: number
          quantidade_docs: number
          tipo: string
          valor: number
        }[]
      }
      get_mv_mercadorias_aggregated: {
        Args: never
        Returns: {
          cofins: number
          filial_cnpj: string
          filial_cod_est: string
          filial_id: string
          filial_nome: string
          icms: number
          mes_ano: string
          pis: number
          tipo: string
          valor: number
        }[]
      }
      get_mv_servicos_aggregated: {
        Args: never
        Returns: {
          cofins: number
          filial_cnpj: string
          filial_cod_est: string
          filial_id: string
          filial_nome: string
          iss: number
          mes_ano: string
          pis: number
          tipo: string
          valor: number
        }[]
      }
      get_mv_uso_consumo_aggregated: {
        Args: never
        Returns: {
          cfop: string
          cofins: number
          filial_cnpj: string
          filial_cod_est: string
          filial_id: string
          filial_nome: string
          icms: number
          mes_ano: string
          pis: number
          quantidade_itens: number
          tipo_operacao: string
          valor: number
        }[]
      }
      get_mv_uso_consumo_by_simples: {
        Args: { p_filial_id?: string; p_mes_ano?: string }
        Returns: {
          cofins: number
          icms: number
          is_simples: boolean
          pis: number
          quantidade_docs: number
          valor: number
        }[]
      }
      get_mv_uso_consumo_detailed:
        | {
            Args: never
            Returns: {
              cfop: string
              cod_part: string
              cofins: number
              filial_cnpj: string
              filial_cod_est: string
              filial_id: string
              filial_nome: string
              icms: number
              mes_ano: string
              participante_doc: string
              participante_nome: string
              pis: number
              quantidade_docs: number
              row_id: string
              tipo_operacao: string
              valor: number
            }[]
          }
        | {
            Args: { p_is_simples?: boolean }
            Returns: {
              cfop: string
              cod_part: string
              cofins: number
              filial_cnpj: string
              filial_cod_est: string
              filial_id: string
              filial_nome: string
              icms: number
              is_simples: boolean
              mes_ano: string
              participante_doc: string
              participante_nome: string
              pis: number
              quantidade_docs: number
              row_id: string
              tipo_operacao: string
              valor: number
            }[]
          }
      get_simples_counts: {
        Args: never
        Returns: {
          mercadorias_count: number
          uso_consumo_count: number
        }[]
      }
      get_simples_link_stats:
        | {
            Args: never
            Returns: {
              optantes_vinculados: number
              total_simples: number
              vinculados_mercadorias: number
              vinculados_uso_consumo: number
            }[]
          }
        | { Args: { p_tenant_id: string }; Returns: Json }
      get_tenant_subscription_info: {
        Args: { p_user_id: string }
        Returns: {
          can_write: boolean
          is_expired: boolean
          subscription_status: Database["public"]["Enums"]["subscription_status"]
          tenant_id: string
          tenant_nome: string
          trial_days_left: number
          trial_ends_at: string
          trial_started_at: string
        }[]
      }
      has_empresa_access: {
        Args: { _empresa_id: string; _user_id: string }
        Returns: boolean
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
      refresh_materialized_views_async: { Args: never; Returns: undefined }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      account_type: "standard" | "demo" | "paid"
      app_role: "admin" | "user" | "viewer"
      subscription_status:
        | "trial"
        | "active"
        | "past_due"
        | "cancelled"
        | "expired"
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
      account_type: ["standard", "demo", "paid"],
      app_role: ["admin", "user", "viewer"],
      subscription_status: [
        "trial",
        "active",
        "past_due",
        "cancelled",
        "expired",
      ],
    },
  },
} as const
