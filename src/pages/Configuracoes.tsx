import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/useAuth';
import { useRole } from '@/hooks/useRole';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Settings, User, Shield, Building2, Users, Save, Loader2 } from 'lucide-react';

interface UserEmpresa {
  user_id: string;
  empresa_id: string;
}

interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  empresas: string[];
}

interface Empresa {
  id: string;
  nome: string;
}

export default function Configuracoes() {
  const { user } = useAuth();
  const { isAdmin } = useRole();
  
  // Admin management state
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [userEmpresas, setUserEmpresas] = useState<UserEmpresa[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  // Fetch users, empresas, and links when admin
  useEffect(() => {
    if (!isAdmin || !user) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        // Get tenant ID for current user
        const { data: userTenants } = await supabase
          .from('user_tenants')
          .select('tenant_id')
          .eq('user_id', user.id);

        if (!userTenants || userTenants.length === 0) {
          setLoading(false);
          return;
        }

        const tenantId = userTenants[0].tenant_id;

        // Fetch all users in the same tenant (non-admins only for management)
        const { data: tenantUsers } = await supabase
          .from('user_tenants')
          .select('user_id')
          .eq('tenant_id', tenantId);

        if (!tenantUsers) {
          setLoading(false);
          return;
        }

        const userIds = tenantUsers.map(u => u.user_id);

        // Fetch profiles for these users
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, email, full_name')
          .in('id', userIds);

        // Fetch roles for these users
        const { data: roles } = await supabase
          .from('user_roles')
          .select('user_id, role')
          .in('user_id', userIds);

        // Fetch empresas in this tenant
        const { data: gruposData } = await supabase
          .from('grupos_empresas')
          .select('id')
          .eq('tenant_id', tenantId);

        if (gruposData && gruposData.length > 0) {
          const grupoIds = gruposData.map(g => g.id);
          
          const { data: empresasData } = await supabase
            .from('empresas')
            .select('id, nome')
            .in('grupo_id', grupoIds);

          if (empresasData) {
            setEmpresas(empresasData);

            // Fetch user_empresas links
            const empresaIds = empresasData.map(e => e.id);
            const { data: linksData } = await supabase
              .from('user_empresas')
              .select('user_id, empresa_id')
              .in('user_id', userIds)
              .in('empresa_id', empresaIds);

            if (linksData) {
              setUserEmpresas(linksData);
            }
          }
        }

        // Combine profiles with roles
        const usersWithRoles: UserProfile[] = (profiles || [])
          .filter(p => p.id !== user.id) // Exclude current admin
          .map(p => {
            const userRole = roles?.find(r => r.user_id === p.id);
            const userLinks = userEmpresas.filter(ue => ue.user_id === p.id);
            return {
              id: p.id,
              email: p.email,
              full_name: p.full_name,
              role: userRole?.role || 'user',
              empresas: userLinks.map(ue => ue.empresa_id)
            };
          });

        setUsers(usersWithRoles);
      } catch (error) {
        console.error('Error fetching data:', error);
        toast.error('Erro ao carregar dados');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [isAdmin, user]);

  // Update users list with current userEmpresas
  useEffect(() => {
    setUsers(prev => prev.map(u => ({
      ...u,
      empresas: userEmpresas.filter(ue => ue.user_id === u.id).map(ue => ue.empresa_id)
    })));
  }, [userEmpresas]);

  const handleToggleEmpresa = (userId: string, empresaId: string, checked: boolean) => {
    if (checked) {
      setUserEmpresas(prev => [...prev, { user_id: userId, empresa_id: empresaId }]);
    } else {
      setUserEmpresas(prev => prev.filter(
        ue => !(ue.user_id === userId && ue.empresa_id === empresaId)
      ));
    }
  };

  const handleSaveUser = async (userId: string) => {
    setSaving(userId);
    try {
      const currentLinks = userEmpresas.filter(ue => ue.user_id === userId);
      const empresaIds = currentLinks.map(ue => ue.empresa_id);

      // Delete all existing links for this user in this tenant's empresas
      const empresaIdsToDelete = empresas.map(e => e.id);
      const { error: deleteError } = await supabase
        .from('user_empresas')
        .delete()
        .eq('user_id', userId)
        .in('empresa_id', empresaIdsToDelete);

      if (deleteError) throw deleteError;

      // Insert new links
      if (empresaIds.length > 0) {
        const { error: insertError } = await supabase
          .from('user_empresas')
          .insert(empresaIds.map(empresaId => ({
            user_id: userId,
            empresa_id: empresaId
          })));

        if (insertError) throw insertError;
      }

      toast.success('Permissões atualizadas com sucesso!');
    } catch (error) {
      console.error('Error saving:', error);
      toast.error('Erro ao salvar permissões');
    } finally {
      setSaving(null);
    }
  };

  const isUserLinked = (userId: string, empresaId: string) => {
    return userEmpresas.some(ue => ue.user_id === userId && ue.empresa_id === empresaId);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Configurações</h1>
        <p className="text-muted-foreground">
          Gerencie suas preferências e dados da conta
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="border-border/50">
          <CardHeader>
            <div className="flex items-center gap-2">
              <User className="h-5 w-5 text-muted-foreground" />
              <div>
                <CardTitle>Perfil</CardTitle>
                <CardDescription>Informações da sua conta</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground">E-mail</p>
              <p className="font-medium">{user?.email}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">ID do Usuário</p>
              <code className="text-xs bg-muted px-2 py-1 rounded">
                {user?.id}
              </code>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-muted-foreground" />
              <div>
                <CardTitle>Segurança</CardTitle>
                <CardDescription>Configurações de acesso</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground">Último acesso</p>
              <p className="font-medium">
                {user?.last_sign_in_at
                  ? new Date(user.last_sign_in_at).toLocaleString('pt-BR')
                  : 'Primeiro acesso'}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Admin: User-Empresa Management */}
      {isAdmin && (
        <Card className="border-border/50">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-muted-foreground" />
              <div>
                <CardTitle>Permissões por Empresa</CardTitle>
                <CardDescription>
                  Defina quais empresas cada usuário pode acessar. Administradores têm acesso a todas.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-4">
                <Skeleton className="h-20 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            ) : users.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>Nenhum outro usuário no ambiente.</p>
                <p className="text-sm">Quando outros usuários entrarem, você poderá gerenciar suas permissões aqui.</p>
              </div>
            ) : empresas.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Building2 className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>Nenhuma empresa cadastrada.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {users.map((u) => (
                  <div key={u.id} className="border border-border/50 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <p className="font-medium">{u.full_name || u.email}</p>
                        <p className="text-sm text-muted-foreground">{u.email}</p>
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-muted text-muted-foreground mt-1">
                          {u.role === 'admin' ? 'Administrador' : u.role === 'viewer' ? 'Visualizador' : 'Usuário'}
                        </span>
                      </div>
                      <Button
                        size="sm"
                        onClick={() => handleSaveUser(u.id)}
                        disabled={saving === u.id || u.role === 'admin'}
                      >
                        {saving === u.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <Save className="h-4 w-4 mr-1" />
                            Salvar
                          </>
                        )}
                      </Button>
                    </div>
                    
                    {u.role === 'admin' ? (
                      <p className="text-sm text-muted-foreground italic">
                        Administradores têm acesso a todas as empresas automaticamente.
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {empresas.map((empresa) => (
                          <label
                            key={empresa.id}
                            className="flex items-center gap-2 p-2 rounded-md hover:bg-muted/50 cursor-pointer"
                          >
                            <Checkbox
                              checked={isUserLinked(u.id, empresa.id)}
                              onCheckedChange={(checked) => 
                                handleToggleEmpresa(u.id, empresa.id, checked as boolean)
                              }
                            />
                            <span className="text-sm">{empresa.nome}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
