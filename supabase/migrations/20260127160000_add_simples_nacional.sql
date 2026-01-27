-- Cria tabela de Simples Nacional se não existir
CREATE TABLE IF NOT EXISTS public.simples_nacional (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id),
    cnpj VARCHAR(14) NOT NULL, -- Apenas números
    is_simples BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(tenant_id, cnpj)
);

-- RLS
ALTER TABLE public.simples_nacional ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view simples_nacional of their tenant" 
ON public.simples_nacional FOR SELECT 
USING (
    tenant_id IN (
        SELECT tenant_id FROM public.user_tenants WHERE user_id = auth.uid()
    )
);

CREATE POLICY "Users can insert/update simples_nacional of their tenant" 
ON public.simples_nacional FOR ALL 
USING (
    tenant_id IN (
        SELECT tenant_id FROM public.user_tenants WHERE user_id = auth.uid()
    )
)
WITH CHECK (
    tenant_id IN (
        SELECT tenant_id FROM public.user_tenants WHERE user_id = auth.uid()
    )
);

-- Atualiza função de paginação para incluir is_simples e filtro
DROP FUNCTION IF EXISTS public.get_mercadorias_participante_page(integer, integer, date, text, text);
DROP FUNCTION IF EXISTS public.get_mercadorias_participante_page(integer, integer, date, text, text, boolean);

CREATE OR REPLACE FUNCTION public.get_mercadorias_participante_page(
    p_limit integer DEFAULT 100, 
    p_offset integer DEFAULT 0, 
    p_mes_ano date DEFAULT NULL, 
    p_participante text DEFAULT NULL, 
    p_tipo text DEFAULT NULL,
    p_only_simples boolean DEFAULT NULL -- Novo parâmetro
)
RETURNS TABLE(
    cod_part varchar,
    cofins numeric,
    filial_id uuid,
    icms numeric,
    mes_ano date,
    participante_cnpj varchar,
    participante_nome varchar,
    pis numeric,
    tipo varchar,
    valor numeric,
    is_simples boolean -- Nova coluna de retorno
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'extensions'
AS $function$
DECLARE
    v_tenant_id uuid;
BEGIN
    -- Busca tenant_id do usuário atual (assume 1 tenant por user ou pega o primeiro)
    SELECT tenant_id INTO v_tenant_id 
    FROM public.user_tenants 
    WHERE user_id = auth.uid() 
    LIMIT 1;

    -- Limitar para performance
    IF p_limit > 100 THEN
        p_limit := 100;
    END IF;
    
    RETURN QUERY
    SELECT 
        mv.cod_part::varchar,
        mv.cofins,
        mv.filial_id,
        mv.icms,
        mv.mes_ano,
        mv.participante_cnpj::varchar,
        mv.participante_nome::varchar,
        mv.pis,
        mv.tipo::varchar,
        mv.valor,
        COALESCE(sn.is_simples, false) as is_simples
    FROM extensions.mv_mercadorias_participante mv
    LEFT JOIN public.simples_nacional sn ON 
        sn.tenant_id = v_tenant_id AND 
        sn.cnpj = regexp_replace(mv.participante_cnpj, '[^0-9]', '', 'g') -- Remove formatação para join
    WHERE has_filial_access(auth.uid(), mv.filial_id)
      AND (p_mes_ano IS NULL OR mv.mes_ano = p_mes_ano)
      AND (p_participante IS NULL OR p_participante = '' OR 
           mv.participante_nome ILIKE '%' || p_participante || '%' OR
           mv.cod_part ILIKE '%' || p_participante || '%')
      AND (p_tipo IS NULL OR p_tipo = '' OR mv.tipo = p_tipo)
      AND (p_only_simples IS NULL OR COALESCE(sn.is_simples, false) = p_only_simples) -- Filtro simples
    ORDER BY mv.valor DESC
    LIMIT p_limit OFFSET p_offset;
END;
$function$;

-- Atualiza função de totais para considerar filtro simples
DROP FUNCTION IF EXISTS public.get_mercadorias_participante_totals(date, text);
DROP FUNCTION IF EXISTS public.get_mercadorias_participante_totals(date, text, boolean);

CREATE OR REPLACE FUNCTION public.get_mercadorias_participante_totals(
    p_mes_ano date DEFAULT NULL, 
    p_participante text DEFAULT NULL,
    p_only_simples boolean DEFAULT NULL
)
RETURNS TABLE(
    total_registros bigint,
    total_valor numeric,
    total_entradas_valor numeric,
    total_entradas_pis numeric,
    total_entradas_cofins numeric,
    total_entradas_icms numeric,
    total_saidas_valor numeric,
    total_saidas_pis numeric,
    total_saidas_cofins numeric,
    total_saidas_icms numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'extensions'
AS $function$
DECLARE
    v_tenant_id uuid;
BEGIN
    SELECT tenant_id INTO v_tenant_id 
    FROM public.user_tenants 
    WHERE user_id = auth.uid() 
    LIMIT 1;

    RETURN QUERY
    SELECT 
        COUNT(*)::bigint as total_registros,
        COALESCE(SUM(mv.valor), 0) as total_valor,
        COALESCE(SUM(CASE WHEN mv.tipo = 'entrada' THEN mv.valor ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN mv.tipo = 'entrada' THEN mv.pis ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN mv.tipo = 'entrada' THEN mv.cofins ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN mv.tipo = 'entrada' THEN mv.icms ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN mv.tipo = 'saida' THEN mv.valor ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN mv.tipo = 'saida' THEN mv.pis ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN mv.tipo = 'saida' THEN mv.cofins ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN mv.tipo = 'saida' THEN mv.icms ELSE 0 END), 0)
    FROM extensions.mv_mercadorias_participante mv
    LEFT JOIN public.simples_nacional sn ON 
        sn.tenant_id = v_tenant_id AND 
        sn.cnpj = regexp_replace(mv.participante_cnpj, '[^0-9]', '', 'g')
    WHERE has_filial_access(auth.uid(), mv.filial_id)
      AND (p_mes_ano IS NULL OR mv.mes_ano = p_mes_ano)
      AND (p_participante IS NULL OR p_participante = '' OR 
           mv.participante_nome ILIKE '%' || p_participante || '%' OR
           mv.cod_part ILIKE '%' || p_participante || '%')
      AND (p_only_simples IS NULL OR COALESCE(sn.is_simples, false) = p_only_simples);
END;
$function$;
