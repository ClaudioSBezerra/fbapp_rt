-- Create get_demo_status function to fix 404 errors in dashboard
CREATE OR REPLACE FUNCTION public.get_demo_status()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_demo_id uuid := '11111111-1111-1111-1111-111111111111';
    v_has_data boolean;
BEGIN
    -- Check if there is data for the demo tenant
    -- We can check if there are any mercadorias for this tenant's companies
    SELECT EXISTS (
        SELECT 1 
        FROM mercadorias m
        JOIN filiais f ON f.id = m.filial_id
        JOIN empresas e ON e.id = f.empresa_id
        JOIN grupos_empresas g ON g.id = e.grupo_id
        WHERE g.tenant_id = v_demo_id
        LIMIT 1
    ) INTO v_has_data;

    RETURN json_build_object(
        'status', 'ready', 
        'has_data', v_has_data,
        'message', CASE WHEN v_has_data THEN 'Dados de demonstração disponíveis' ELSE 'Ambiente de demonstração vazio' END
    );
END;
$$;

-- Grant access to authenticated users
GRANT EXECUTE ON FUNCTION public.get_demo_status() TO authenticated;
