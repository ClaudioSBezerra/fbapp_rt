-- Debug function to investigate empty view issues
CREATE OR REPLACE FUNCTION public.debug_company_filter(p_empresa_id uuid)
RETURNS TABLE(
    metric text,
    value text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
    RETURN QUERY
    SELECT 'Selected Company ID'::text, p_empresa_id::text
    UNION ALL
    SELECT 'Total Rows in MV'::text, count(*)::text FROM extensions.mv_mercadorias_participante
    UNION ALL
    SELECT 'Rows with Filial Access'::text, count(*)::text 
    FROM extensions.mv_mercadorias_participante mv
    WHERE has_filial_access(auth.uid(), mv.filial_id)
    UNION ALL
    SELECT 'Rows Matching Company'::text, count(*)::text
    FROM extensions.mv_mercadorias_participante mv
    JOIN public.filiais f ON f.id = mv.filial_id
    WHERE f.empresa_id = p_empresa_id
    UNION ALL
    SELECT 'Rows Matching Access AND Company'::text, count(*)::text
    FROM extensions.mv_mercadorias_participante mv
    JOIN public.filiais f ON f.id = mv.filial_id
    WHERE has_filial_access(auth.uid(), mv.filial_id)
      AND f.empresa_id = p_empresa_id
    UNION ALL
    (SELECT 'Sample Filial ID'::text, mv.filial_id::text
    FROM extensions.mv_mercadorias_participante mv
    LIMIT 1)
    UNION ALL
    (SELECT 'Sample Empresa ID from Filial'::text, f.empresa_id::text
    FROM extensions.mv_mercadorias_participante mv
    JOIN public.filiais f ON f.id = mv.filial_id
    LIMIT 1);
END;
$$;
