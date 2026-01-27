-- Fix get_demo_status signature to match frontend call (which passes _user_id)
-- We drop the no-arg version to avoid confusion, though overloads work.
DROP FUNCTION IF EXISTS public.get_demo_status();

CREATE OR REPLACE FUNCTION public.get_demo_status(_user_id uuid DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_demo_id uuid := '11111111-1111-1111-1111-111111111111';
    v_has_data boolean;
BEGIN
    -- Logic is the same, we ignore _user_id as we use auth.uid() or just check the tenant
    -- But we need to accept the argument to satisfy the RPC call signature.
    
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

GRANT EXECUTE ON FUNCTION public.get_demo_status(uuid) TO authenticated;
