import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAuth } from '@/hooks/useAuth';
import { useRole } from '@/hooks/useRole';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Settings, User, Shield, Building2, Users, Save, Loader2, Lock, Eye, EyeOff, Trash2, AlertTriangle, UserCog, ArrowUpCircle, ArrowDownCircle } from 'lucide-react';
import { SimplesNacionalImporter } from '@/components/SimplesNacionalImporter';

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
  grupo_id: string;
}

interface Grupo {
  id: string;
  nome: string;
}

export default function Configuracoes() {
  const { user, updatePassword } = useAuth();
  const { isAdmin } = useRole();
  
  // Admin management state
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [userEmpresas, setUserEmpresas] = useState<UserEmpresa[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  // Password change state
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);

  // Data cleanup state
  const [selectedEmpresaForClear, setSelectedEmpresaForClear] = useState<string>('');
  const [selectedGrupoForClear, setSelectedGrupoForClear] = useState<string>('');
  const [clearEmpresaDialogOpen, setClearEmpresaDialogOpen] = useState(false);
  const [clearGrupoDialogOpen, setClearGrupoDialogOpen] = useState(false);
  const [confirmationText, setConfirmationText] = useState('');

  // Role management state
  const [promoteDialogOpen, setPromoteDialogOpen] = useState(false);
  const [demoteDialogOpen, setDemoteDialogOpen] = useState(false);
  const [selectedUserForRole, setSelectedUserForRole] = useState<UserProfile | null>(null);
  const [isUpdatingRole, setIsUpdatingRole] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (newPassword.length < 6) {
      toast.error('A nova senha deve ter pelo menos 6 caracteres');
      return;
    }
    
    if (newPassword !== confirmPassword) {
      toast.error('As senhas não coincidem');
      return;
    }
    
    setIsChangingPassword(true);
    const { error } = await updatePassword(newPassword);
    
    if (error) {
      toast.error('Erro ao alterar senha: ' + error.message);
    } else {
      toast.success('Senha alterada com sucesso!');
      setShowPasswordForm(false);
      setNewPassword('');
      setConfirmPassword('');
    }
    setIsChangingPassword(false);
  };

  // Fetch users, empresas, grupos and links when admin
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

        // Fetch grupos in this tenant
        const { data: gruposData } = await supabase
          .from('grupos_empresas')
          .select('id, nome')
          .eq('tenant_id', tenantId);

        if (gruposData) {
          setGrupos(gruposData);
        }

        if (gruposData && gruposData.length > 0) {
          const grupoIds = gruposData.map(g => g.id);
          
          const { data: empresasData } = await supabase
            .from('empresas')
            .select('id, nome, grupo_id')
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

  const getSelectedEmpresaName = () => {
    return empresas.find(e => e.id === selectedEmpresaForClear)?.nome || '';
  };

  const getSelectedGrupoName = () => {
    return grupos.find(g => g.id === selectedGrupoForClear)?.nome || '';
  };

  const handleClearEmpresa = async () => {
    if (!selectedEmpresaForClear || confirmationText !== getSelectedEmpresaName()) {
      toast.error('Digite o nome da empresa corretamente para confirmar');
      return;
    }

    setIsClearing(true);
    try {
      const { data, error } = await supabase.functions.invoke('clear-company-data', {
        body: {
          scope: 'empresa',
          empresaId: selectedEmpresaForClear
        }
      });

      if (error) throw error;

      if (data.success) {
        toast.success(data.message);
        const counts = data.counts;
        const total = Object.values(counts as Record<string, number>).reduce((a: number, b: number) => a + b, 0);
        if (total > 0) {
          toast.info(`${total} registros removidos`, { duration: 5000 });
        }
      } else {
        throw new Error(data.error || 'Erro ao limpar dados');
      }
    } catch (error: any) {
      console.error('Error clearing empresa data:', error);
      toast.error(error.message || 'Erro ao limpar dados da empresa');
    } finally {
      setIsClearing(false);
      setClearEmpresaDialogOpen(false);
      setConfirmationText('');
      setSelectedEmpresaForClear('');
    }
  };

  const handleClearGrupo = async () => {
    if (!selectedGrupoForClear || confirmationText !== getSelectedGrupoName()) {
      toast.error('Digite o nome do grupo corretamente para confirmar');
      return;
    }

    setIsClearing(true);
    try {
      const { data, error } = await supabase.functions.invoke('clear-company-data', {
        body: {
          scope: 'grupo',
          grupoId: selectedGrupoForClear
        }
      });

      if (error) throw error;

      if (data.success) {
        toast.success(data.message);
        const counts = data.counts;
        const total = Object.values(counts as Record<string, number>).reduce((a: number, b: number) => a + b, 0);
        if (total > 0) {
          toast.info(`${total} registros removidos`, { duration: 5000 });
        }
      } else {
        throw new Error(data.error || 'Erro ao limpar dados');
      }
    } catch (error: any) {
      console.error('Error clearing grupo data:', error);
      toast.error(error.message || 'Erro ao limpar dados do grupo');
    } finally {
      setIsClearing(false);
      setClearGrupoDialogOpen(false);
      setConfirmationText('');
      setSelectedGrupoForClear('');
    }
  };

  const handlePromoteToAdmin = async () => {
    if (!selectedUserForRole) return;

    setIsUpdatingRole(true);
    try {
      // Upsert will insert if not exists or update if exists
      const { error } = await supabase
        .from('user_roles')
        .upsert(
          { user_id: selectedUserForRole.id, role: 'admin' as const },
          { onConflict: 'user_id' }
        );

      if (error) throw error;

      // Update local state
      setUsers(prev => prev.map(u => 
        u.id === selectedUserForRole.id ? { ...u, role: 'admin' } : u
      ));

      toast.success(`${selectedUserForRole.full_name || selectedUserForRole.email} foi promovido a Administrador`);
    } catch (error: any) {
      console.error('Error promoting user:', error);
      toast.error('Erro ao promover usuário: ' + (error.message || 'Erro desconhecido'));
    } finally {
      setIsUpdatingRole(false);
      setPromoteDialogOpen(false);
      setSelectedUserForRole(null);
    }
  };

  const handleDemoteToUser = async () => {
    if (!selectedUserForRole) return;

    setIsUpdatingRole(true);
    try {
      const { error } = await supabase
        .from('user_roles')
        .update({ role: 'user' as const })
        .eq('user_id', selectedUserForRole.id);

      if (error) throw error;

      // Update local state
      setUsers(prev => prev.map(u => 
        u.id === selectedUserForRole.id ? { ...u, role: 'user' } : u
      ));

      toast.success(`${selectedUserForRole.full_name || selectedUserForRole.email} foi rebaixado para Usuário`);
    } catch (error: any) {
      console.error('Error demoting user:', error);
      toast.error('Erro ao rebaixar usuário: ' + (error.message || 'Erro desconhecido'));
    } finally {
      setIsUpdatingRole(false);
      setDemoteDialogOpen(false);
      setSelectedUserForRole(null);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Configurações e Parâmetros Gerais</h1>
        <p className="text-muted-foreground">
          Gerencie suas preferências, dados da conta e parâmetros do sistema
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

            <div className="border-t border-border/50 pt-4">
              {!showPasswordForm ? (
                <Button
                  variant="outline"
                  onClick={() => setShowPasswordForm(true)}
                  className="w-full sm:w-auto"
                >
                  <Lock className="h-4 w-4 mr-2" />
                  Alterar senha
                </Button>
              ) : (
                <form onSubmit={handleChangePassword} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="newPassword">Nova senha</Label>
                    <div className="relative">
                      <Input
                        id="newPassword"
                        type={showNewPassword ? 'text' : 'password'}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="Mínimo 6 caracteres"
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirmPassword">Confirmar nova senha</Label>
                    <div className="relative">
                      <Input
                        id="confirmPassword"
                        type={showConfirmPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="Repita a nova senha"
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setShowPasswordForm(false);
                        setNewPassword('');
                        setConfirmPassword('');
                      }}
                    >
                      Cancelar
                    </Button>
                    <Button type="submit" disabled={isChangingPassword}>
                      {isChangingPassword ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Salvando...
                        </>
                      ) : (
                        'Salvar nova senha'
                      )}
                    </Button>
                  </div>
                </form>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Admin: Simples Nacional Importer */}
      {isAdmin && <SimplesNacionalImporter />}

      {/* Admin: Data Cleanup */}
      {isAdmin && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              <div>
                <CardTitle className="text-destructive">Limpeza de Dados</CardTitle>
                <CardDescription>
                  Ações destrutivas - remova dados transacionais de empresas ou grupos. 
                  A estrutura organizacional será mantida.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <Alert variant="default" className="border-muted bg-muted/50">
              <AlertDescription className="text-sm">
                <strong>O que será removido:</strong> Operações de Compra e Venda, Serviços, Fretes, Energia/Água, Uso e Consumo, Participantes, Jobs de Importação e Filiais.
                <br />
                <strong>O que será preservado:</strong> Alíquotas, Estrutura de Tenant/Grupo/Empresa, Usuários e Permissões, Simples Nacional.
              </AlertDescription>
            </Alert>

            {/* Clear Empresa */}
            <div className="space-y-3">
              <Label className="text-base font-medium">Limpar dados de uma Empresa</Label>
              <div className="flex flex-col sm:flex-row gap-3">
                <Select
                  value={selectedEmpresaForClear}
                  onValueChange={setSelectedEmpresaForClear}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Selecione a empresa" />
                  </SelectTrigger>
                  <SelectContent>
                    {empresas.map((empresa) => (
                      <SelectItem key={empresa.id} value={empresa.id}>
                        {empresa.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                <Dialog open={clearEmpresaDialogOpen} onOpenChange={setClearEmpresaDialogOpen}>
                  <DialogTrigger asChild>
                    <Button 
                      variant="destructive" 
                      disabled={!selectedEmpresaForClear}
                      className="sm:w-auto"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Limpar Empresa
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2 text-destructive">
                        <AlertTriangle className="h-5 w-5" />
                        Confirmar Limpeza de Dados
                      </DialogTitle>
                      <DialogDescription>
                        Você está prestes a remover <strong>todos os dados transacionais</strong> da empresa 
                        <strong> "{getSelectedEmpresaName()}"</strong>, incluindo todas as suas filiais.
                        <br /><br />
                        Esta ação <strong>não pode ser desfeita</strong>.
                      </DialogDescription>
                    </DialogHeader>
                    
                    <div className="space-y-3 py-4">
                      <Label htmlFor="confirmEmpresa">
                        Digite <strong>"{getSelectedEmpresaName()}"</strong> para confirmar:
                      </Label>
                      <Input
                        id="confirmEmpresa"
                        value={confirmationText}
                        onChange={(e) => setConfirmationText(e.target.value)}
                        placeholder="Digite o nome da empresa"
                        autoComplete="off"
                      />
                    </div>
                    
                    <DialogFooter>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setClearEmpresaDialogOpen(false);
                          setConfirmationText('');
                        }}
                        disabled={isClearing}
                      >
                        Cancelar
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={handleClearEmpresa}
                        disabled={isClearing || confirmationText !== getSelectedEmpresaName()}
                      >
                        {isClearing ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Limpando...
                          </>
                        ) : (
                          <>
                            <Trash2 className="h-4 w-4 mr-2" />
                            Confirmar Limpeza
                          </>
                        )}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </div>

            <div className="border-t border-border/50" />

            {/* Clear Grupo */}
            <div className="space-y-3">
              <Label className="text-base font-medium">Limpar dados de um Grupo (todas as empresas)</Label>
              <div className="flex flex-col sm:flex-row gap-3">
                <Select
                  value={selectedGrupoForClear}
                  onValueChange={setSelectedGrupoForClear}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Selecione o grupo" />
                  </SelectTrigger>
                  <SelectContent>
                    {grupos.map((grupo) => (
                      <SelectItem key={grupo.id} value={grupo.id}>
                        {grupo.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                <Dialog open={clearGrupoDialogOpen} onOpenChange={setClearGrupoDialogOpen}>
                  <DialogTrigger asChild>
                    <Button 
                      variant="destructive" 
                      disabled={!selectedGrupoForClear}
                      className="sm:w-auto"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Limpar Grupo
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-2 text-destructive">
                        <AlertTriangle className="h-5 w-5" />
                        Confirmar Limpeza de Grupo
                      </DialogTitle>
                      <DialogDescription>
                        Você está prestes a remover <strong>todos os dados transacionais</strong> do grupo 
                        <strong> "{getSelectedGrupoName()}"</strong>, incluindo <strong>todas as empresas e filiais</strong> associadas.
                        <br /><br />
                        Esta ação <strong>não pode ser desfeita</strong>.
                      </DialogDescription>
                    </DialogHeader>
                    
                    <div className="space-y-3 py-4">
                      <Label htmlFor="confirmGrupo">
                        Digite <strong>"{getSelectedGrupoName()}"</strong> para confirmar:
                      </Label>
                      <Input
                        id="confirmGrupo"
                        value={confirmationText}
                        onChange={(e) => setConfirmationText(e.target.value)}
                        placeholder="Digite o nome do grupo"
                        autoComplete="off"
                      />
                    </div>
                    
                    <DialogFooter>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setClearGrupoDialogOpen(false);
                          setConfirmationText('');
                        }}
                        disabled={isClearing}
                      >
                        Cancelar
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={handleClearGrupo}
                        disabled={isClearing || confirmationText !== getSelectedGrupoName()}
                      >
                        {isClearing ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Limpando...
                          </>
                        ) : (
                          <>
                            <Trash2 className="h-4 w-4 mr-2" />
                            Confirmar Limpeza
                          </>
                        )}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Admin: Role Management */}
      {isAdmin && (
        <Card className="border-border/50">
          <CardHeader>
            <div className="flex items-center gap-2">
              <UserCog className="h-5 w-5 text-muted-foreground" />
              <div>
                <CardTitle>Gerenciamento de Administradores</CardTitle>
                <CardDescription>
                  Promova ou rebaixe usuários do seu ambiente. Administradores têm acesso completo a todas as funcionalidades.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-4">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : users.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>Nenhum outro usuário no ambiente.</p>
                <p className="text-sm">Quando outros usuários entrarem, você poderá gerenciar suas permissões aqui.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {users.map((u) => (
                  <div 
                    key={u.id} 
                    className="flex items-center justify-between p-4 border border-border/50 rounded-lg hover:bg-muted/30 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-full ${u.role === 'admin' ? 'bg-primary/10' : 'bg-muted'}`}>
                        <User className={`h-5 w-5 ${u.role === 'admin' ? 'text-primary' : 'text-muted-foreground'}`} />
                      </div>
                      <div>
                        <p className="font-medium">{u.full_name || u.email}</p>
                        <p className="text-sm text-muted-foreground">{u.email}</p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                        u.role === 'admin' 
                          ? 'bg-primary/10 text-primary border border-primary/20' 
                          : 'bg-muted text-muted-foreground'
                      }`}>
                        {u.role === 'admin' ? 'Administrador' : u.role === 'viewer' ? 'Visualizador' : 'Usuário'}
                      </span>
                      
                      {u.role === 'admin' ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedUserForRole(u);
                            setDemoteDialogOpen(true);
                          }}
                          className="text-orange-600 hover:text-orange-700 hover:bg-orange-50 border-orange-200"
                        >
                          <ArrowDownCircle className="h-4 w-4 mr-1" />
                          Rebaixar
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedUserForRole(u);
                            setPromoteDialogOpen(true);
                          }}
                          className="text-green-600 hover:text-green-700 hover:bg-green-50 border-green-200"
                        >
                          <ArrowUpCircle className="h-4 w-4 mr-1" />
                          Promover
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            <Alert variant="default" className="mt-4 border-muted bg-muted/50">
              <AlertDescription className="text-sm">
                <strong>Administradores</strong> têm acesso total: visualizam todas as empresas, gerenciam usuários, 
                importam dados e podem executar ações de limpeza.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      )}

      {/* Promote Dialog */}
      <Dialog open={promoteDialogOpen} onOpenChange={setPromoteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowUpCircle className="h-5 w-5 text-green-600" />
              Promover a Administrador
            </DialogTitle>
            <DialogDescription>
              Você está prestes a promover <strong>{selectedUserForRole?.full_name || selectedUserForRole?.email}</strong> para Administrador.
              <br /><br />
              Esta ação dará ao usuário <strong>acesso completo</strong> a todas as empresas e funcionalidades do sistema, incluindo:
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>Visualização de todas as empresas do ambiente</li>
                <li>Gerenciamento de usuários e permissões</li>
                <li>Importação e exclusão de dados</li>
                <li>Configurações administrativas</li>
              </ul>
            </DialogDescription>
          </DialogHeader>
          
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setPromoteDialogOpen(false);
                setSelectedUserForRole(null);
              }}
              disabled={isUpdatingRole}
            >
              Cancelar
            </Button>
            <Button
              onClick={handlePromoteToAdmin}
              disabled={isUpdatingRole}
              className="bg-green-600 hover:bg-green-700"
            >
              {isUpdatingRole ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Promovendo...
                </>
              ) : (
                <>
                  <ArrowUpCircle className="h-4 w-4 mr-2" />
                  Confirmar Promoção
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Demote Dialog */}
      <Dialog open={demoteDialogOpen} onOpenChange={setDemoteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-orange-600">
              <ArrowDownCircle className="h-5 w-5" />
              Rebaixar para Usuário
            </DialogTitle>
            <DialogDescription>
              Você está prestes a rebaixar <strong>{selectedUserForRole?.full_name || selectedUserForRole?.email}</strong> para Usuário comum.
              <br /><br />
              O usuário <strong>perderá</strong>:
              <ul className="list-disc list-inside mt-2 space-y-1">
                <li>Acesso administrativo ao sistema</li>
                <li>Visualização automática de todas as empresas</li>
                <li>Capacidade de gerenciar outros usuários</li>
                <li>Acesso a funcionalidades de importação e limpeza</li>
              </ul>
              <br />
              O usuário precisará ter empresas vinculadas manualmente para continuar acessando dados.
            </DialogDescription>
          </DialogHeader>
          
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDemoteDialogOpen(false);
                setSelectedUserForRole(null);
              }}
              disabled={isUpdatingRole}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleDemoteToUser}
              disabled={isUpdatingRole}
              variant="destructive"
              className="bg-orange-600 hover:bg-orange-700"
            >
              {isUpdatingRole ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Rebaixando...
                </>
              ) : (
                <>
                  <ArrowDownCircle className="h-4 w-4 mr-2" />
                  Confirmar Rebaixamento
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
