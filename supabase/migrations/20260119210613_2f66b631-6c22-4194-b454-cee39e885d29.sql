-- ============================================================================
-- Nova Arquitetura EFD em 3 Camadas
-- Fase 1: Tabelas RAW para import rápido (append-only, sem agregação)
-- ============================================================================

-- Tabela RAW para C100 (Documentos Fiscais - Mercadorias)
CREATE TABLE IF NOT EXISTS public.efd_raw_c100 (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    import_job_id uuid NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
    filial_id uuid NOT NULL REFERENCES filiais(id) ON DELETE CASCADE,
    mes_ano date NOT NULL,
    tipo varchar(10) NOT NULL,
    cod_part varchar(60),
    valor numeric NOT NULL DEFAULT 0,
    pis numeric NOT NULL DEFAULT 0,
    cofins numeric NOT NULL DEFAULT 0,
    icms numeric DEFAULT 0,
    ipi numeric DEFAULT 0,
    created_at timestamptz DEFAULT now()
);

-- Índices para consolidação rápida
CREATE INDEX IF NOT EXISTS idx_efd_raw_c100_job ON efd_raw_c100(import_job_id);
CREATE INDEX IF NOT EXISTS idx_efd_raw_c100_aggregate ON efd_raw_c100(filial_id, mes_ano, tipo, cod_part);

-- Tabela RAW para C500 (Energia/Água/Gás)
CREATE TABLE IF NOT EXISTS public.efd_raw_c500 (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    import_job_id uuid NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
    filial_id uuid NOT NULL REFERENCES filiais(id) ON DELETE CASCADE,
    mes_ano date NOT NULL,
    tipo_operacao varchar(10) NOT NULL,
    tipo_servico varchar(20) NOT NULL,
    cnpj_fornecedor varchar(14),
    valor numeric NOT NULL DEFAULT 0,
    pis numeric NOT NULL DEFAULT 0,
    cofins numeric NOT NULL DEFAULT 0,
    icms numeric DEFAULT 0,
    created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_efd_raw_c500_job ON efd_raw_c500(import_job_id);
CREATE INDEX IF NOT EXISTS idx_efd_raw_c500_aggregate ON efd_raw_c500(filial_id, mes_ano, tipo_operacao, tipo_servico, cnpj_fornecedor);

-- Tabela RAW para D100/D500 (Fretes/Telecom)
CREATE TABLE IF NOT EXISTS public.efd_raw_fretes (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    import_job_id uuid NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
    filial_id uuid NOT NULL REFERENCES filiais(id) ON DELETE CASCADE,
    mes_ano date NOT NULL,
    tipo varchar(10) NOT NULL,
    cnpj_transportadora varchar(14),
    valor numeric NOT NULL DEFAULT 0,
    pis numeric NOT NULL DEFAULT 0,
    cofins numeric NOT NULL DEFAULT 0,
    icms numeric DEFAULT 0,
    created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_efd_raw_fretes_job ON efd_raw_fretes(import_job_id);
CREATE INDEX IF NOT EXISTS idx_efd_raw_fretes_aggregate ON efd_raw_fretes(filial_id, mes_ano, tipo, cnpj_transportadora);

-- Tabela RAW para A100 (Serviços)
CREATE TABLE IF NOT EXISTS public.efd_raw_a100 (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    import_job_id uuid NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
    filial_id uuid NOT NULL REFERENCES filiais(id) ON DELETE CASCADE,
    mes_ano date NOT NULL,
    tipo varchar(10) NOT NULL,
    valor numeric NOT NULL DEFAULT 0,
    pis numeric NOT NULL DEFAULT 0,
    cofins numeric NOT NULL DEFAULT 0,
    iss numeric DEFAULT 0,
    created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_efd_raw_a100_job ON efd_raw_a100(import_job_id);
CREATE INDEX IF NOT EXISTS idx_efd_raw_a100_aggregate ON efd_raw_a100(filial_id, mes_ano, tipo);

-- ============================================================================
-- Fase 2: Funções de Consolidação (GROUP BY otimizado pelo PostgreSQL)
-- ============================================================================

-- Consolidar mercadorias (C100/C600)
CREATE OR REPLACE FUNCTION public.consolidar_mercadorias(p_job_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_inserted integer := 0;
    v_raw_count integer := 0;
BEGIN
    -- Contar registros RAW
    SELECT COUNT(*) INTO v_raw_count FROM efd_raw_c100 WHERE import_job_id = p_job_id;
    
    IF v_raw_count = 0 THEN
        RETURN jsonb_build_object('inserted', 0, 'raw_count', 0, 'message', 'No raw records to consolidate');
    END IF;
    
    -- Consolidar e inserir/atualizar na tabela mercadorias
    WITH aggregated AS (
        SELECT 
            filial_id,
            mes_ano,
            tipo,
            cod_part,
            SUM(valor) as total_valor,
            SUM(pis) as total_pis,
            SUM(cofins) as total_cofins,
            SUM(icms) as total_icms,
            SUM(ipi) as total_ipi
        FROM efd_raw_c100
        WHERE import_job_id = p_job_id
        GROUP BY filial_id, mes_ano, tipo, cod_part
    ),
    upserted AS (
        INSERT INTO mercadorias (filial_id, mes_ano, tipo, cod_part, descricao, valor, pis, cofins, icms, ipi)
        SELECT 
            filial_id,
            mes_ano,
            tipo,
            cod_part,
            'Agregado',
            total_valor,
            total_pis,
            total_cofins,
            total_icms,
            total_ipi
        FROM aggregated
        ON CONFLICT (filial_id, mes_ano, tipo, COALESCE(cod_part, '__NULL__'))
        DO UPDATE SET 
            valor = mercadorias.valor + EXCLUDED.valor,
            pis = mercadorias.pis + EXCLUDED.pis,
            cofins = mercadorias.cofins + EXCLUDED.cofins,
            icms = mercadorias.icms + EXCLUDED.icms,
            ipi = mercadorias.ipi + EXCLUDED.ipi,
            updated_at = now()
        RETURNING 1
    )
    SELECT COUNT(*) INTO v_inserted FROM upserted;
    
    -- Limpar dados RAW após consolidação bem-sucedida
    DELETE FROM efd_raw_c100 WHERE import_job_id = p_job_id;
    
    RETURN jsonb_build_object('inserted', v_inserted, 'raw_count', v_raw_count, 'message', 'Consolidation complete');
END;
$$;

-- Consolidar energia/água (C500)
CREATE OR REPLACE FUNCTION public.consolidar_energia_agua(p_job_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_inserted integer := 0;
    v_raw_count integer := 0;
BEGIN
    SELECT COUNT(*) INTO v_raw_count FROM efd_raw_c500 WHERE import_job_id = p_job_id;
    
    IF v_raw_count = 0 THEN
        RETURN jsonb_build_object('inserted', 0, 'raw_count', 0, 'message', 'No raw records to consolidate');
    END IF;
    
    WITH aggregated AS (
        SELECT 
            filial_id,
            mes_ano,
            tipo_operacao,
            tipo_servico,
            cnpj_fornecedor,
            SUM(valor) as total_valor,
            SUM(pis) as total_pis,
            SUM(cofins) as total_cofins,
            SUM(icms) as total_icms
        FROM efd_raw_c500
        WHERE import_job_id = p_job_id
        GROUP BY filial_id, mes_ano, tipo_operacao, tipo_servico, cnpj_fornecedor
    ),
    inserted AS (
        INSERT INTO energia_agua (filial_id, mes_ano, tipo_operacao, tipo_servico, cnpj_fornecedor, descricao, valor, pis, cofins, icms)
        SELECT 
            filial_id,
            mes_ano,
            tipo_operacao,
            tipo_servico,
            cnpj_fornecedor,
            'Agregado',
            total_valor,
            total_pis,
            total_cofins,
            total_icms
        FROM aggregated
        ON CONFLICT DO NOTHING
        RETURNING 1
    )
    SELECT COUNT(*) INTO v_inserted FROM inserted;
    
    DELETE FROM efd_raw_c500 WHERE import_job_id = p_job_id;
    
    RETURN jsonb_build_object('inserted', v_inserted, 'raw_count', v_raw_count, 'message', 'Consolidation complete');
END;
$$;

-- Consolidar fretes (D100/D500)
CREATE OR REPLACE FUNCTION public.consolidar_fretes(p_job_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_inserted integer := 0;
    v_raw_count integer := 0;
BEGIN
    SELECT COUNT(*) INTO v_raw_count FROM efd_raw_fretes WHERE import_job_id = p_job_id;
    
    IF v_raw_count = 0 THEN
        RETURN jsonb_build_object('inserted', 0, 'raw_count', 0, 'message', 'No raw records to consolidate');
    END IF;
    
    WITH aggregated AS (
        SELECT 
            filial_id,
            mes_ano,
            tipo,
            cnpj_transportadora,
            SUM(valor) as total_valor,
            SUM(pis) as total_pis,
            SUM(cofins) as total_cofins,
            SUM(icms) as total_icms
        FROM efd_raw_fretes
        WHERE import_job_id = p_job_id
        GROUP BY filial_id, mes_ano, tipo, cnpj_transportadora
    ),
    inserted AS (
        INSERT INTO fretes (filial_id, mes_ano, tipo, cnpj_transportadora, descricao, valor, pis, cofins, icms)
        SELECT 
            filial_id,
            mes_ano,
            tipo,
            cnpj_transportadora,
            'Agregado',
            total_valor,
            total_pis,
            total_cofins,
            total_icms
        FROM aggregated
        ON CONFLICT DO NOTHING
        RETURNING 1
    )
    SELECT COUNT(*) INTO v_inserted FROM inserted;
    
    DELETE FROM efd_raw_fretes WHERE import_job_id = p_job_id;
    
    RETURN jsonb_build_object('inserted', v_inserted, 'raw_count', v_raw_count, 'message', 'Consolidation complete');
END;
$$;

-- Consolidar serviços (A100)
CREATE OR REPLACE FUNCTION public.consolidar_servicos(p_job_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_inserted integer := 0;
    v_raw_count integer := 0;
BEGIN
    SELECT COUNT(*) INTO v_raw_count FROM efd_raw_a100 WHERE import_job_id = p_job_id;
    
    IF v_raw_count = 0 THEN
        RETURN jsonb_build_object('inserted', 0, 'raw_count', 0, 'message', 'No raw records to consolidate');
    END IF;
    
    WITH aggregated AS (
        SELECT 
            filial_id,
            mes_ano,
            tipo,
            SUM(valor) as total_valor,
            SUM(pis) as total_pis,
            SUM(cofins) as total_cofins,
            SUM(iss) as total_iss
        FROM efd_raw_a100
        WHERE import_job_id = p_job_id
        GROUP BY filial_id, mes_ano, tipo
    ),
    inserted AS (
        INSERT INTO servicos (filial_id, mes_ano, tipo, descricao, valor, pis, cofins, iss)
        SELECT 
            filial_id,
            mes_ano,
            tipo,
            'Agregado',
            total_valor,
            total_pis,
            total_cofins,
            total_iss
        FROM aggregated
        ON CONFLICT DO NOTHING
        RETURNING 1
    )
    SELECT COUNT(*) INTO v_inserted FROM inserted;
    
    DELETE FROM efd_raw_a100 WHERE import_job_id = p_job_id;
    
    RETURN jsonb_build_object('inserted', v_inserted, 'raw_count', v_raw_count, 'message', 'Consolidation complete');
END;
$$;

-- Função mestre que chama todas as consolidações
CREATE OR REPLACE FUNCTION public.consolidar_import_job(p_job_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_result_mercadorias jsonb;
    v_result_energia_agua jsonb;
    v_result_fretes jsonb;
    v_result_servicos jsonb;
BEGIN
    -- Consolidar cada tipo de registro
    v_result_mercadorias := consolidar_mercadorias(p_job_id);
    v_result_energia_agua := consolidar_energia_agua(p_job_id);
    v_result_fretes := consolidar_fretes(p_job_id);
    v_result_servicos := consolidar_servicos(p_job_id);
    
    RETURN jsonb_build_object(
        'mercadorias', v_result_mercadorias,
        'energia_agua', v_result_energia_agua,
        'fretes', v_result_fretes,
        'servicos', v_result_servicos,
        'success', true
    );
END;
$$;

-- ============================================================================
-- RLS Policies para tabelas RAW (mesmas regras das tabelas finais)
-- ============================================================================

ALTER TABLE efd_raw_c100 ENABLE ROW LEVEL SECURITY;
ALTER TABLE efd_raw_c500 ENABLE ROW LEVEL SECURITY;
ALTER TABLE efd_raw_fretes ENABLE ROW LEVEL SECURITY;
ALTER TABLE efd_raw_a100 ENABLE ROW LEVEL SECURITY;

-- Políticas baseadas em filial_access
CREATE POLICY "Users can view raw_c100 of their filiais" ON efd_raw_c100 FOR SELECT USING (has_filial_access(auth.uid(), filial_id));
CREATE POLICY "Users can insert raw_c100 for their filiais" ON efd_raw_c100 FOR INSERT WITH CHECK (has_filial_access(auth.uid(), filial_id));
CREATE POLICY "Users can delete raw_c100 of their filiais" ON efd_raw_c100 FOR DELETE USING (has_filial_access(auth.uid(), filial_id));

CREATE POLICY "Users can view raw_c500 of their filiais" ON efd_raw_c500 FOR SELECT USING (has_filial_access(auth.uid(), filial_id));
CREATE POLICY "Users can insert raw_c500 for their filiais" ON efd_raw_c500 FOR INSERT WITH CHECK (has_filial_access(auth.uid(), filial_id));
CREATE POLICY "Users can delete raw_c500 of their filiais" ON efd_raw_c500 FOR DELETE USING (has_filial_access(auth.uid(), filial_id));

CREATE POLICY "Users can view raw_fretes of their filiais" ON efd_raw_fretes FOR SELECT USING (has_filial_access(auth.uid(), filial_id));
CREATE POLICY "Users can insert raw_fretes for their filiais" ON efd_raw_fretes FOR INSERT WITH CHECK (has_filial_access(auth.uid(), filial_id));
CREATE POLICY "Users can delete raw_fretes of their filiais" ON efd_raw_fretes FOR DELETE USING (has_filial_access(auth.uid(), filial_id));

CREATE POLICY "Users can view raw_a100 of their filiais" ON efd_raw_a100 FOR SELECT USING (has_filial_access(auth.uid(), filial_id));
CREATE POLICY "Users can insert raw_a100 for their filiais" ON efd_raw_a100 FOR INSERT WITH CHECK (has_filial_access(auth.uid(), filial_id));
CREATE POLICY "Users can delete raw_a100 of their filiais" ON efd_raw_a100 FOR DELETE USING (has_filial_access(auth.uid(), filial_id));

-- Função para limpar dados RAW órfãos (jobs que falharam)
CREATE OR REPLACE FUNCTION public.cleanup_orphaned_raw_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Deletar dados RAW de jobs que falharam ou foram cancelados há mais de 1 hora
    DELETE FROM efd_raw_c100 WHERE import_job_id IN (
        SELECT id FROM import_jobs WHERE status IN ('failed', 'cancelled') AND updated_at < now() - interval '1 hour'
    );
    DELETE FROM efd_raw_c500 WHERE import_job_id IN (
        SELECT id FROM import_jobs WHERE status IN ('failed', 'cancelled') AND updated_at < now() - interval '1 hour'
    );
    DELETE FROM efd_raw_fretes WHERE import_job_id IN (
        SELECT id FROM import_jobs WHERE status IN ('failed', 'cancelled') AND updated_at < now() - interval '1 hour'
    );
    DELETE FROM efd_raw_a100 WHERE import_job_id IN (
        SELECT id FROM import_jobs WHERE status IN ('failed', 'cancelled') AND updated_at < now() - interval '1 hour'
    );
END;
$$;