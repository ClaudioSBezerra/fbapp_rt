-- Remover funções não utilizadas

-- 1. Função legada de agregação (substituída por MV)
DROP FUNCTION IF EXISTS public.get_mercadorias_aggregated();

-- 2. Função de participante não paginada
DROP FUNCTION IF EXISTS public.get_mv_mercadorias_participante();

-- 3. Funções de tenant não utilizadas
DROP FUNCTION IF EXISTS public.validate_tenant_exists(uuid);
DROP FUNCTION IF EXISTS public.get_tenant_name(uuid);

-- 4. Versões de deleção sem validação de segurança (mantendo apenas as versões com user_id)
DROP FUNCTION IF EXISTS public.delete_mercadorias_batch(uuid[], integer);
DROP FUNCTION IF EXISTS public.delete_fretes_batch(uuid[], integer);
DROP FUNCTION IF EXISTS public.delete_energia_agua_batch(uuid[], integer);