-- Fix Materialized View Index for Concurrent Refresh and RPC types

-- 1. Create Unique Index required for CONCURRENTLY refresh
-- Ensure we don't have duplicate rows before creating index (should be grouped already)
-- We use the columns that guarantee uniqueness based on the GROUP BY clause
-- NOTE: All columns in the unique index must be NOT NULL for concurrent refresh.
-- m.filial_id, m.cod_part (filtered not null), m.mes_ano, m.tipo are safe.

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_mercadorias_participante_unique_pk
ON extensions.mv_mercadorias_participante (filial_id, cod_part, mes_ano, tipo);

-- 2. Fix RPC get_mercadorias_participante_lista (Ensure compatible types)
-- Previous migration might have issues if types don't match exactly frontend expectations
DROP FUNCTION IF EXISTS public.get_mercadorias_participante_lista(uuid);

CREATE OR REPLACE FUNCTION public.get_mercadorias_participante_lista(
    p_empresa_id uuid DEFAULT NULL
)
RETURNS TABLE(
    cod_part varchar,
    nome varchar,
    cnpj varchar
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'extensions'
AS $$
BEGIN
    RETURN QUERY
    SELECT DISTINCT ON (COALESCE(mv.participante_nome, 'NAO INFORMADO'))
        COALESCE(mv.cod_part, 'NAO INFORMADO')::varchar,
        COALESCE(mv.participante_nome, 'NAO INFORMADO')::varchar,
        mv.participante_cnpj::varchar
    FROM extensions.mv_mercadorias_participante mv
    JOIN public.filiais f_filter ON f_filter.id = mv.filial_id
    WHERE has_filial_access(auth.uid(), mv.filial_id)
      AND (p_empresa_id IS NULL OR f_filter.empresa_id = p_empresa_id)
    ORDER BY COALESCE(mv.participante_nome, 'NAO INFORMADO');
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_mercadorias_participante_lista(uuid) TO authenticated;

-- 3. Fix get_mercadorias_participante_meses (Ensure permissions and types)
DROP FUNCTION IF EXISTS public.get_mercadorias_participante_meses(uuid);

CREATE OR REPLACE FUNCTION public.get_mercadorias_participante_meses(
    p_empresa_id uuid DEFAULT NULL
)
RETURNS TABLE(mes_ano date)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'extensions'
AS $$
BEGIN
    RETURN QUERY
    SELECT DISTINCT mv.mes_ano
    FROM extensions.mv_mercadorias_participante mv
    JOIN public.filiais f_filter ON f_filter.id = mv.filial_id
    WHERE has_filial_access(auth.uid(), mv.filial_id)
      AND (p_empresa_id IS NULL OR f_filter.empresa_id = p_empresa_id)
    ORDER BY mv.mes_ano DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_mercadorias_participante_meses(uuid) TO authenticated;

-- Refresh schema cache
NOTIFY pgrst, 'reload config';
