
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Building2, LogOut, Loader2 } from 'lucide-react';
import { useRole } from '@/hooks/useRole';

interface Empresa {
  id: string;
  nome: string;
}

export default function SelectCompany() {
  const { user, selectCompany, signOut } = useAuth();
  const { isAdmin } = useRole();
  const navigate = useNavigate();
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const fetchEmpresas = async () => {
      try {
        let empresasData: Empresa[] = [];

        if (isAdmin) {
          // Admin sees all companies in their tenant(s)
          // First get user's tenant
          const { data: userTenants } = await supabase
            .from('user_tenants')
            .select('tenant_id')
            .eq('user_id', user.id);
            
          if (userTenants && userTenants.length > 0) {
             const tenantId = userTenants[0].tenant_id;
             // Get groups then companies
             const { data: grupos } = await supabase
                .from('grupos_empresas')
                .select('id')
                .eq('tenant_id', tenantId);
                
             if (grupos && grupos.length > 0) {
                const grupoIds = grupos.map(g => g.id);
                const { data: emps } = await supabase
                    .from('empresas')
                    .select('id, nome')
                    .in('grupo_id', grupoIds);
                if (emps) empresasData = emps;
             }
          }
        } else {
            // Regular user: fetch linked companies
            const { data: links } = await supabase
                .from('user_empresas')
                .select('empresa_id')
                .eq('user_id', user.id);
            
            if (links && links.length > 0) {
                const ids = links.map(l => l.empresa_id);
                const { data: emps } = await supabase
                    .from('empresas')
                    .select('id, nome')
                    .in('id', ids);
                if (emps) empresasData = emps;
            }
        }
        
        setEmpresas(empresasData);
        
        // Auto-select if only one company (and not admin, or admin forcing selection?)
        // If regular user has 1 company, auto select.
        // If admin has 1 company, auto select.
        if (empresasData.length === 1) {
            handleSelect(empresasData[0].id);
        }

      } catch (error) {
        console.error('Error fetching companies:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchEmpresas();
  }, [user, isAdmin]);

  const handleSelect = (id: string) => {
    selectCompany(id);
    navigate('/');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto bg-primary/10 p-3 rounded-full w-fit mb-2">
            <Building2 className="h-6 w-6 text-primary" />
          </div>
          <CardTitle>Selecione a Empresa</CardTitle>
          <CardDescription>
            Escolha em qual empresa você deseja trabalhar agora
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {empresas.length === 0 ? (
             <div className="text-center py-4 text-muted-foreground">
                <p>Nenhuma empresa vinculada à sua conta.</p>
                <p className="text-sm mt-2">Entre em contato com o administrador.</p>
             </div>
          ) : (
             <div className="space-y-2">
                {empresas.map((empresa) => (
                  <Button
                    key={empresa.id}
                    variant="outline"
                    className="w-full justify-start h-auto py-4 text-left hover:bg-muted/50 transition-colors"
                    onClick={() => handleSelect(empresa.id)}
                  >
                    <Building2 className="h-5 w-5 mr-3 text-muted-foreground" />
                    <span className="font-medium">{empresa.nome}</span>
                  </Button>
                ))}
             </div>
          )}
          
          <div className="pt-4 border-t mt-4">
            <Button variant="ghost" className="w-full text-muted-foreground" onClick={signOut}>
              <LogOut className="h-4 w-4 mr-2" />
              Sair da conta
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
