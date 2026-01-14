-- Create materialized views in extensions schema

-- 1. mv_mercadorias_aggregated
CREATE MATERIALIZED VIEW extensions.mv_mercadorias_aggregated AS
SELECT 
    m.filial_id,
    COALESCE(f.nome_fantasia, f.razao_social) as filial_nome,
    m.mes_ano,
    m.tipo,
    SUM(m.valor) as valor,
    SUM(m.pis) as pis,
    SUM(m.cofins) as cofins,
    SUM(COALESCE(m.icms, 0)) as icms
FROM public.mercadorias m
JOIN public.filiais f ON f.id = m.filial_id
GROUP BY m.filial_id, f.nome_fantasia, f.razao_social, m.mes_ano, m.tipo;

CREATE UNIQUE INDEX idx_mv_mercadorias_agg_pk 
ON extensions.mv_mercadorias_aggregated(filial_id, mes_ano, tipo);

-- 2. mv_fretes_aggregated
CREATE MATERIALIZED VIEW extensions.mv_fretes_aggregated AS
SELECT 
    fr.filial_id,
    COALESCE(f.nome_fantasia, f.razao_social) as filial_nome,
    fr.mes_ano,
    fr.tipo,
    SUM(fr.valor) as valor,
    SUM(fr.pis) as pis,
    SUM(fr.cofins) as cofins,
    SUM(fr.icms) as icms
FROM public.fretes fr
JOIN public.filiais f ON f.id = fr.filial_id
GROUP BY fr.filial_id, f.nome_fantasia, f.razao_social, fr.mes_ano, fr.tipo;

CREATE UNIQUE INDEX idx_mv_fretes_agg_pk 
ON extensions.mv_fretes_aggregated(filial_id, mes_ano, tipo);

-- 3. mv_energia_agua_aggregated
CREATE MATERIALIZED VIEW extensions.mv_energia_agua_aggregated AS
SELECT 
    ea.filial_id,
    COALESCE(f.nome_fantasia, f.razao_social) as filial_nome,
    ea.mes_ano,
    ea.tipo_operacao,
    ea.tipo_servico,
    SUM(ea.valor) as valor,
    SUM(ea.pis) as pis,
    SUM(ea.cofins) as cofins,
    SUM(ea.icms) as icms
FROM public.energia_agua ea
JOIN public.filiais f ON f.id = ea.filial_id
GROUP BY ea.filial_id, f.nome_fantasia, f.razao_social, ea.mes_ano, ea.tipo_operacao, ea.tipo_servico;

CREATE UNIQUE INDEX idx_mv_energia_agua_agg_pk 
ON extensions.mv_energia_agua_aggregated(filial_id, mes_ano, tipo_operacao, tipo_servico);

-- 4. mv_servicos_aggregated
CREATE MATERIALIZED VIEW extensions.mv_servicos_aggregated AS
SELECT 
    s.filial_id,
    COALESCE(f.nome_fantasia, f.razao_social) as filial_nome,
    s.mes_ano,
    s.tipo,
    SUM(s.valor) as valor,
    SUM(s.pis) as pis,
    SUM(s.cofins) as cofins,
    SUM(COALESCE(s.iss, 0)) as iss
FROM public.servicos s
JOIN public.filiais f ON f.id = s.filial_id
GROUP BY s.filial_id, f.nome_fantasia, f.razao_social, s.mes_ano, s.tipo;

CREATE UNIQUE INDEX idx_mv_servicos_agg_pk 
ON extensions.mv_servicos_aggregated(filial_id, mes_ano, tipo);

-- 5. mv_mercadorias_participante
CREATE MATERIALIZED VIEW extensions.mv_mercadorias_participante AS
SELECT 
    m.filial_id,
    m.cod_part,
    COALESCE(p.nome, 'Participante ' || m.cod_part) as participante_nome,
    p.cnpj as participante_cnpj,
    m.mes_ano,
    m.tipo,
    SUM(m.valor) as valor,
    SUM(m.pis) as pis,
    SUM(m.cofins) as cofins,
    SUM(COALESCE(m.icms, 0)) as icms
FROM public.mercadorias m
LEFT JOIN public.participantes p ON p.filial_id = m.filial_id AND p.cod_part = m.cod_part
GROUP BY m.filial_id, m.cod_part, p.nome, p.cnpj, m.mes_ano, m.tipo;

CREATE UNIQUE INDEX idx_mv_mercadorias_part_pk 
ON extensions.mv_mercadorias_participante(filial_id, cod_part, mes_ano, tipo);

-- 6. mv_dashboard_stats
CREATE MATERIALIZED VIEW extensions.mv_dashboard_stats AS
SELECT 
    'mercadorias' as categoria,
    tipo as subtipo,
    filial_id,
    mes_ano,
    SUM(valor) as valor,
    SUM(COALESCE(icms, 0)) as icms,
    SUM(pis) as pis,
    SUM(cofins) as cofins
FROM public.mercadorias
GROUP BY tipo, filial_id, mes_ano
UNION ALL
SELECT 
    'fretes' as categoria,
    tipo as subtipo,
    filial_id,
    mes_ano,
    SUM(valor) as valor,
    SUM(icms) as icms,
    SUM(pis) as pis,
    SUM(cofins) as cofins
FROM public.fretes
GROUP BY tipo, filial_id, mes_ano
UNION ALL
SELECT 
    'energia_agua' as categoria,
    tipo_operacao as subtipo,
    filial_id,
    mes_ano,
    SUM(valor) as valor,
    SUM(icms) as icms,
    SUM(pis) as pis,
    SUM(cofins) as cofins
FROM public.energia_agua
GROUP BY tipo_operacao, filial_id, mes_ano
UNION ALL
SELECT 
    'servicos' as categoria,
    tipo as subtipo,
    filial_id,
    mes_ano,
    SUM(valor) as valor,
    SUM(COALESCE(iss, 0)) as icms,
    SUM(pis) as pis,
    SUM(cofins) as cofins
FROM public.servicos
GROUP BY tipo, filial_id, mes_ano;

CREATE UNIQUE INDEX idx_mv_dashboard_stats_pk 
ON extensions.mv_dashboard_stats(categoria, subtipo, filial_id, mes_ano);

-- Grant permissions
GRANT SELECT ON extensions.mv_mercadorias_aggregated TO authenticated;
GRANT SELECT ON extensions.mv_fretes_aggregated TO authenticated;
GRANT SELECT ON extensions.mv_energia_agua_aggregated TO authenticated;
GRANT SELECT ON extensions.mv_servicos_aggregated TO authenticated;
GRANT SELECT ON extensions.mv_mercadorias_participante TO authenticated;
GRANT SELECT ON extensions.mv_dashboard_stats TO authenticated;