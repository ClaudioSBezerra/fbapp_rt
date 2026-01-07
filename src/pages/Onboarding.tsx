import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useRole } from '@/hooks/useRole';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Building2, Users, Store, ArrowRight, Copy, Check, FileText, Key, Loader2, Search } from 'lucide-react';

interface OnboardingData {
  tenantNome: string;
  grupoNome: string;
  empresaNome: string;
}

interface Empresa {
  id: string;
  nome: string;
}

interface Grupo {
  id: string;
  nome: string;
  empresas: Empresa[];
}

interface TenantStructure {
  tenant_id: string;
  tenant_nome: string;
  grupos: Grupo[];
}

type JoinState = 'idle' | 'loading' | 'selecting' | 'joining';

export default function Onboarding() {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [tenantId, setTenantId] = useState<string>('');
  const [tenantCode, setTenantCode] = useState<string>('');
  const [data, setData] = useState<OnboardingData>({
    tenantNome: '',
    grupoNome: '',
    empresaNome: '',
  });
  
  // Non-admin flow state
  const [joinState, setJoinState] = useState<JoinState>('idle');
  const [tenantStructure, setTenantStructure] = useState<TenantStructure | null>(null);
  const [selectedGrupoId, setSelectedGrupoId] = useState<string>('');
  const [selectedEmpresaId, setSelectedEmpresaId] = useState<string>('');
  
  const { user } = useAuth();
  const { isAdmin, isLoading: roleLoading } = useRole();
  const navigate = useNavigate();

  // Check if user already has a tenant linked
  useEffect(() => {
    const checkUserTenant = async () => {
      if (!user) return;
      
      const { data: userTenants } = await supabase
        .from('user_tenants')
        .select('tenant_id')
        .eq('user_id', user.id);

      if (userTenants && userTenants.length > 0) {
        navigate('/dashboard');
      }
    };

    checkUserTenant();
  }, [user, navigate]);

  // Get empresas for selected grupo
  const selectedGrupo = tenantStructure?.grupos.find(g => g.id === selectedGrupoId);
  const availableEmpresas = selectedGrupo?.empresas || [];

  // Reset empresa when grupo changes
  useEffect(() => {
    setSelectedEmpresaId('');
  }, [selectedGrupoId]);

  const handleCopyTenantId = () => {
    navigator.clipboard.writeText(tenantId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSubmit = async () => {
    if (!user) return;
    setLoading(true);

    try {
      const { data: result, error } = await supabase.functions.invoke('onboarding-complete', {
        body: {
          tenantNome: data.tenantNome,
          grupoNome: data.grupoNome,
          empresaNome: data.empresaNome
        }
      });

      if (error) {
        console.error('Edge function error:', error);
        throw new Error(error.message || 'Erro na comunicação com o servidor');
      }

      if (!result?.success) {
        console.error('Onboarding failed:', result);
        throw new Error(result?.error || 'Erro ao processar cadastro');
      }

      setTenantId(result.tenant_id);
      setStep(4);
      toast.success('Cadastro realizado com sucesso!');
    } catch (error: any) {
      console.error('Error:', error);
      const errorMessage = error?.message || 'Erro ao cadastrar. Tente novamente.';
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleFetchTenantStructure = async () => {
    if (!user || !tenantCode.trim()) return;
    setJoinState('loading');

    try {
      const { data: result, error } = await supabase.functions.invoke('get-tenant-structure', {
        body: { tenantId: tenantCode.trim() }
      });

      if (error) {
        console.error('Edge function error:', error);
        throw new Error(error.message || 'Erro na comunicação com o servidor');
      }

      if (!result?.success) {
        console.error('Fetch structure failed:', result);
        throw new Error(result?.error || 'Erro ao buscar estrutura do ambiente');
      }

      setTenantStructure(result);
      setJoinState('selecting');
      toast.success(`Ambiente "${result.tenant_nome}" encontrado!`);
    } catch (error: any) {
      console.error('Error:', error);
      const errorMessage = error?.message || 'Erro ao buscar ambiente. Verifique o código.';
      toast.error(errorMessage);
      setJoinState('idle');
    }
  };

  const handleJoinTenant = async () => {
    if (!user || !tenantStructure || !selectedEmpresaId) return;
    setJoinState('joining');

    try {
      const { data: result, error } = await supabase.functions.invoke('join-tenant', {
        body: { 
          tenantId: tenantStructure.tenant_id,
          empresaId: selectedEmpresaId
        }
      });

      if (error) {
        console.error('Edge function error:', error);
        throw new Error(error.message || 'Erro na comunicação com o servidor');
      }

      if (!result?.success) {
        console.error('Join tenant failed:', result);
        throw new Error(result?.error || 'Erro ao entrar no ambiente');
      }

      toast.success(`Vinculado à empresa "${result.empresa_nome}" com sucesso!`);
      navigate('/dashboard');
    } catch (error: any) {
      console.error('Error:', error);
      const errorMessage = error?.message || 'Erro ao entrar no ambiente.';
      toast.error(errorMessage);
      setJoinState('selecting');
    }
  };

  const handleResetJoin = () => {
    setJoinState('idle');
    setTenantStructure(null);
    setSelectedGrupoId('');
    setSelectedEmpresaId('');
    setTenantCode('');
  };

  const canProceed = () => {
    switch (step) {
      case 1:
        return data.tenantNome.trim().length >= 2;
      case 2:
        return data.grupoNome.trim().length >= 2;
      case 3:
        return data.empresaNome.trim().length >= 2;
      default:
        return false;
    }
  };

  // Loading state while checking role
  if (roleLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="flex items-center gap-2">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          <span className="text-muted-foreground">Carregando...</span>
        </div>
      </div>
    );
  }

  // Non-admin flow: Enter tenant code and select empresa
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-lg animate-fade-in">
          <Card className="border-border/50 shadow-lg">
            <CardHeader className="space-y-1">
              <div className="flex items-center gap-2 mb-2">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Key className="h-5 w-5 text-primary" />
                </div>
              </div>
              <CardTitle className="text-xl">Entrar em um Ambiente</CardTitle>
              <CardDescription>
                {joinState === 'idle' && 'Para acessar o sistema, insira o código do ambiente fornecido pelo administrador.'}
                {joinState === 'loading' && 'Buscando estrutura do ambiente...'}
                {(joinState === 'selecting' || joinState === 'joining') && `Ambiente: ${tenantStructure?.tenant_nome}`}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Step 1: Enter tenant code */}
              {joinState === 'idle' && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="tenantCode">Código do Ambiente</Label>
                    <Input
                      id="tenantCode"
                      placeholder="Ex: b5e7dc15-ec38-46e8-9c12-944..."
                      value={tenantCode}
                      onChange={(e) => setTenantCode(e.target.value)}
                      className="font-mono text-sm"
                    />
                    <p className="text-xs text-muted-foreground">
                      Solicite o código ao administrador do ambiente que deseja acessar.
                    </p>
                  </div>
                  <Button
                    className="w-full"
                    onClick={handleFetchTenantStructure}
                    disabled={!tenantCode.trim()}
                  >
                    <Search className="h-4 w-4 mr-2" />
                    Buscar Ambiente
                  </Button>
                </>
              )}

              {/* Loading state */}
              {joinState === 'loading' && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              )}

              {/* Step 2: Select grupo and empresa */}
              {(joinState === 'selecting' || joinState === 'joining') && tenantStructure && (
                <>
                  <div className="p-3 bg-positive/10 border border-positive/20 rounded-lg">
                    <div className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-positive" />
                      <span className="text-sm font-medium text-positive">Ambiente encontrado</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="grupo">Selecione o Grupo</Label>
                    <Select 
                      value={selectedGrupoId} 
                      onValueChange={setSelectedGrupoId}
                      disabled={joinState === 'joining'}
                    >
                      <SelectTrigger id="grupo">
                        <SelectValue placeholder="Selecione um grupo..." />
                      </SelectTrigger>
                      <SelectContent>
                        {tenantStructure.grupos.map((grupo) => (
                          <SelectItem key={grupo.id} value={grupo.id}>
                            {grupo.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="empresa">Selecione a Empresa</Label>
                    <Select 
                      value={selectedEmpresaId} 
                      onValueChange={setSelectedEmpresaId}
                      disabled={!selectedGrupoId || availableEmpresas.length === 0 || joinState === 'joining'}
                    >
                      <SelectTrigger id="empresa">
                        <SelectValue 
                          placeholder={
                            !selectedGrupoId 
                              ? "Selecione um grupo primeiro..." 
                              : availableEmpresas.length === 0 
                                ? "Nenhuma empresa neste grupo" 
                                : "Selecione uma empresa..."
                          } 
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {availableEmpresas.map((empresa) => (
                          <SelectItem key={empresa.id} value={empresa.id}>
                            {empresa.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <Button 
                      variant="outline" 
                      onClick={handleResetJoin}
                      disabled={joinState === 'joining'}
                    >
                      Voltar
                    </Button>
                    <Button
                      className="flex-1"
                      onClick={handleJoinTenant}
                      disabled={!selectedEmpresaId || joinState === 'joining'}
                    >
                      {joinState === 'joining' ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Entrando...
                        </>
                      ) : (
                        <>
                          Entrar no Ambiente
                          <ArrowRight className="h-4 w-4 ml-2" />
                        </>
                      )}
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Admin flow: Create tenant, group, company
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-lg animate-fade-in">
        <Card className="border-border/50 shadow-lg">
          {step === 1 && (
            <>
              <CardHeader className="space-y-1">
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <Building2 className="h-5 w-5 text-primary" />
                  </div>
                  <span className="text-sm text-muted-foreground">Passo 1 de 3</span>
                </div>
                <CardTitle className="text-xl">Crie seu Ambiente</CardTitle>
                <CardDescription>
                  O ambiente é o espaço principal onde você gerenciará suas empresas.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="tenantNome">Nome do Ambiente</Label>
                  <Input
                    id="tenantNome"
                    placeholder="Ex: Minha Contabilidade"
                    value={data.tenantNome}
                    onChange={(e) => setData({ ...data, tenantNome: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    Este será o nome do seu espaço de trabalho.
                  </p>
                </div>
                <Button
                  className="w-full"
                  onClick={() => setStep(2)}
                  disabled={!canProceed()}
                >
                  Continuar
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </CardContent>
            </>
          )}

          {step === 2 && (
            <>
              <CardHeader className="space-y-1">
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <Users className="h-5 w-5 text-primary" />
                  </div>
                  <span className="text-sm text-muted-foreground">Passo 2 de 3</span>
                </div>
                <CardTitle className="text-xl">Grupo de Empresas</CardTitle>
                <CardDescription>
                  Agrupe suas empresas por categoria ou estrutura organizacional.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="grupoNome">Nome do Grupo</Label>
                  <Input
                    id="grupoNome"
                    placeholder="Ex: Grupo ABC"
                    value={data.grupoNome}
                    onChange={(e) => setData({ ...data, grupoNome: e.target.value })}
                  />
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setStep(1)}>
                    Voltar
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={() => setStep(3)}
                    disabled={!canProceed()}
                  >
                    Continuar
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              </CardContent>
            </>
          )}

          {step === 3 && (
            <>
              <CardHeader className="space-y-1">
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <Store className="h-5 w-5 text-primary" />
                  </div>
                  <span className="text-sm text-muted-foreground">Passo 3 de 3</span>
                </div>
                <CardTitle className="text-xl">Empresa</CardTitle>
                <CardDescription>
                  Cadastre a empresa principal do grupo.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="empresaNome">Nome da Empresa</Label>
                  <Input
                    id="empresaNome"
                    placeholder="Ex: Empresa XYZ"
                    value={data.empresaNome}
                    onChange={(e) => setData({ ...data, empresaNome: e.target.value })}
                  />
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setStep(2)}>
                    Voltar
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={handleSubmit}
                    disabled={!canProceed() || loading}
                  >
                    {loading ? 'Salvando...' : 'Finalizar Cadastro'}
                  </Button>
                </div>
              </CardContent>
            </>
          )}

          {step === 4 && (
            <>
              <CardHeader className="space-y-1 text-center">
                <div className="flex justify-center mb-4">
                  <div className="p-4 bg-positive/10 rounded-full">
                    <Check className="h-8 w-8 text-positive" />
                  </div>
                </div>
                <CardTitle className="text-xl">Cadastro Concluído!</CardTitle>
                <CardDescription>
                  Seu ambiente foi criado com sucesso.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 bg-muted rounded-lg space-y-2">
                  <Label className="text-xs text-muted-foreground">Código do Ambiente (Tenant)</Label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-sm font-mono bg-background p-2 rounded border overflow-hidden text-ellipsis">
                      {tenantId}
                    </code>
                    <Button variant="outline" size="sm" onClick={handleCopyTenantId}>
                      {copied ? (
                        <Check className="h-4 w-4 text-positive" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Use este código para compartilhar o ambiente com outros usuários.
                  </p>
                </div>

                <div className="p-4 bg-primary/5 rounded-lg border border-primary/20">
                  <div className="flex items-start gap-3">
                    <FileText className="h-5 w-5 text-primary mt-0.5" />
                    <div>
                      <p className="text-sm font-medium">Próximo Passo</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Acesse a tela de <strong>Mercadorias</strong> e importe seu arquivo EFD. 
                        O sistema criará automaticamente a Filial/Estabelecimento com base no CNPJ do arquivo.
                      </p>
                    </div>
                  </div>
                </div>

                <Button className="w-full" onClick={() => navigate('/mercadorias')}>
                  Ir para Mercadorias
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
