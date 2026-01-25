import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useRole } from '@/hooks/useRole';
import { supabase } from '@/integrations/supabase/client';

interface SessionInfo {
  tenantNome: string | null;
  grupoNome: string | null;
  empresas: { id: string; nome: string }[];
  isAdmin: boolean;
}

export function useSessionInfo() {
  const { user } = useAuth();
  const { isAdmin } = useRole();

  const { data, isLoading } = useQuery({
    queryKey: ['session-info', user?.id, isAdmin],
    queryFn: async (): Promise<SessionInfo> => {
      if (!user?.id) return { tenantNome: null, grupoNome: null, empresas: [], isAdmin: false };

      // Buscar tenant do usuário
      const { data: tenantData } = await supabase
        .from('user_tenants')
        .select('tenant_id')
        .eq('user_id', user.id)
        .maybeSingle();

      let tenantNome: string | null = null;
      let grupoNome: string | null = null;
      let empresas: { id: string; nome: string }[] = [];

      if (tenantData?.tenant_id) {
        // Buscar nome do tenant
        const { data: tenant } = await supabase
          .from('tenants')
          .select('nome')
          .eq('id', tenantData.tenant_id)
          .maybeSingle();
        
        tenantNome = tenant?.nome || null;

        if (isAdmin) {
          // Admin vê todas as empresas de todos os grupos do tenant
          const { data: allEmpresas } = await supabase
            .from('empresas')
            .select('id, nome, grupo_id, grupos_empresas!inner(id, nome, tenant_id)')
            .eq('grupos_empresas.tenant_id', tenantData.tenant_id);
          
          if (allEmpresas && allEmpresas.length > 0) {
            empresas = allEmpresas.map(e => ({ id: e.id, nome: e.nome }));
            
            // Tenta determinar um nome de grupo representativo
            // Se houver empresas de múltiplos grupos, pega o primeiro ou indica múltiplos?
            // Por enquanto, pegamos o nome do grupo da primeira empresa encontrada
            const firstGrupo = allEmpresas[0].grupos_empresas;
            grupoNome = Array.isArray(firstGrupo) ? firstGrupo[0]?.nome : firstGrupo?.nome;
          }
        } else {
          // Usuário vê apenas empresas vinculadas
          const { data: userEmpresas } = await supabase
            .from('user_empresas')
            .select('empresa_id, empresas!inner(id, nome, grupo_id, grupos_empresas!inner(id, nome))')
            .eq('user_id', user.id);
          
          if (userEmpresas && userEmpresas.length > 0) {
            empresas = userEmpresas.map(ue => ({
              id: ue.empresas.id,
              nome: ue.empresas.nome
            }));
            
            // Pega o nome do grupo da primeira empresa vinculada
            const firstEmpresa = userEmpresas[0].empresas;
            const firstGrupo = firstEmpresa.grupos_empresas;
            grupoNome = Array.isArray(firstGrupo) ? firstGrupo[0]?.nome : firstGrupo?.nome;
          }
        }
      }

      return { tenantNome, grupoNome, empresas, isAdmin };
    },
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  });

  return {
    tenantNome: data?.tenantNome || null,
    grupoNome: data?.grupoNome || null,
    empresas: data?.empresas || [],
    isAdmin: data?.isAdmin || false,
    isLoading,
  };
}
