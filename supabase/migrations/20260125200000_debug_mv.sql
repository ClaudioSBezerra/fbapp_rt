
CREATE OR REPLACE FUNCTION public.debug_mv_state()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_mercadorias_count int;
    v_mv_count int;
    v_filiais_count int;
    v_mv_sample json;
BEGIN
    SELECT count(*) INTO v_mercadorias_count FROM public.mercadorias;
    SELECT count(*) INTO v_filiais_count FROM public.filiais;
    SELECT count(*) INTO v_mv_count FROM extensions.mv_mercadorias_aggregated;
    
    SELECT json_agg(t) INTO v_mv_sample 
    FROM (SELECT * FROM extensions.mv_mercadorias_aggregated LIMIT 5) t;
    
    RETURN json_build_object(
        'mercadorias_count', v_mercadorias_count,
        'filiais_count', v_filiais_count,
        'mv_count', v_mv_count,
        'mv_sample', v_mv_sample
    );
END;
$$;
