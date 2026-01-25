
CREATE OR REPLACE FUNCTION public.debug_get_mv_for_user(p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_count int;
    v_sample json;
BEGIN
    SELECT count(*) INTO v_count
    FROM extensions.mv_mercadorias_aggregated mv
    WHERE has_filial_access(p_user_id, mv.filial_id);

    SELECT json_agg(t) INTO v_sample
    FROM (
        SELECT * 
        FROM extensions.mv_mercadorias_aggregated mv
        WHERE has_filial_access(p_user_id, mv.filial_id)
        LIMIT 5
    ) t;

    RETURN json_build_object(
        'count', v_count,
        'sample', v_sample
    );
END;
$$;
