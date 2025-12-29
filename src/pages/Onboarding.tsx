import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Building2, Users, Store, ArrowRight, Copy, Check, FileText } from 'lucide-react';

interface OnboardingData {
  tenantNome: string;
  grupoNome: string;
  empresaNome: string;
}

export default function Onboarding() {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [tenantId, setTenantId] = useState<string>('');
  const [data, setData] = useState<OnboardingData>({
    tenantNome: '',
    grupoNome: '',
    empresaNome: '',
  });
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!user) {
      navigate('/auth');
    }
  }, [user, navigate]);

  const handleCopyTenantId = () => {
    navigator.clipboard.writeText(tenantId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSubmit = async () => {
    if (!user) return;
    setLoading(true);

    try {
      // 1. Create Tenant
      const { data: tenant, error: tenantError } = await supabase
        .from('tenants')
        .insert({ nome: data.tenantNome })
        .select()
        .single();

      if (tenantError) throw tenantError;

      // 2. Link user to tenant
      const { error: linkError } = await supabase
        .from('user_tenants')
        .insert({ user_id: user.id, tenant_id: tenant.id });

      if (linkError) throw linkError;

      // 3. Create Grupo de Empresas
      const { data: grupo, error: grupoError } = await supabase
        .from('grupos_empresas')
        .insert({ tenant_id: tenant.id, nome: data.grupoNome })
        .select()
        .single();

      if (grupoError) throw grupoError;

      // 4. Create Empresa
      const { error: empresaError } = await supabase
        .from('empresas')
        .insert({ grupo_id: grupo.id, nome: data.empresaNome });

      if (empresaError) throw empresaError;

      setTenantId(tenant.id);
      setStep(4); // Success step
      toast.success('Cadastro realizado com sucesso!');
    } catch (error: any) {
      console.error('Error:', error);
      toast.error('Erro ao cadastrar. Tente novamente.');
    } finally {
      setLoading(false);
    }
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
