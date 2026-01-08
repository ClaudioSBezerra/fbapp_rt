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

        // Buscar grupo
        const { data: grupoData } = await supabase
          .from('grupos_empresas')
          .select('id, nome')
          .eq('tenant_id', tenantData.tenant_id)
          .maybeSingle();
        
        grupoNome = grupoData?.nome || null;

        if (grupoData?.id) {
          if (isAdmin) {
            // Admin vê todas as empresas do grupo
            const { data: empresasData } = await supabase
              .from('empresas')
              .select('id, nome')
              .eq('grupo_id', grupoData.id);
            
            empresas = empresasData || [];
          } else {
            // Usuário vê apenas empresas vinculadas
            const { data: userEmpresas } = await supabase
              .from('user_empresas')
              .select('empresa_id')
              .eq('user_id', user.id);
            
            if (userEmpresas && userEmpresas.length > 0) {
              const empresaIds = userEmpresas.map(ue => ue.empresa_id);
              const { data: empresasData } = await supabase
                .from('empresas')
                .select('id, nome')
                .in('id', empresaIds);
              
              empresas = empresasData || [];
            }
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
