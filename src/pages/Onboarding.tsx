import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Building2, Users, Store, ArrowRight, Copy, Check } from 'lucide-react';

interface OnboardingData {
  tenantNome: string;
  grupoNome: string;
  empresaNome: string;
  filialCnpj: string;
  filialRazaoSocial: string;
  filialNomeFantasia: string;
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
    filialCnpj: '',
    filialRazaoSocial: '',
    filialNomeFantasia: '',
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

  const formatCNPJ = (value: string) => {
    const cleaned = value.replace(/\D/g, '').slice(0, 14);
    return cleaned.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  };

  const handleCnpjChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatCNPJ(e.target.value);
    setData({ ...data, filialCnpj: formatted });
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
      const { data: empresa, error: empresaError } = await supabase
        .from('empresas')
        .insert({ grupo_id: grupo.id, nome: data.empresaNome })
        .select()
        .single();

      if (empresaError) throw empresaError;

      // 5. Create Filial
      const { error: filialError } = await supabase
        .from('filiais')
        .insert({
          empresa_id: empresa.id,
          cnpj: data.filialCnpj.replace(/\D/g, ''),
          razao_social: data.filialRazaoSocial,
          nome_fantasia: data.filialNomeFantasia || null,
        });

      if (filialError) throw filialError;

      setTenantId(tenant.id);
      setStep(5); // Success step
      toast.success('Cadastro realizado com sucesso!');
    } catch (error: any) {
      console.error('Error:', error);
      if (error.message?.includes('duplicate')) {
        toast.error('Este CNPJ já está cadastrado');
      } else {
        toast.error('Erro ao cadastrar. Tente novamente.');
      }
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
      case 4:
        return (
          data.filialCnpj.replace(/\D/g, '').length === 14 &&
          data.filialRazaoSocial.trim().length >= 2
        );
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
                  <span className="text-sm text-muted-foreground">Passo 1 de 4</span>
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
                  <span className="text-sm text-muted-foreground">Passo 2 de 4</span>
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
                  <span className="text-sm text-muted-foreground">Passo 3 de 4</span>
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
                    onClick={() => setStep(4)}
                    disabled={!canProceed()}
                  >
                    Continuar
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </div>
              </CardContent>
            </>
          )}

          {step === 4 && (
            <>
              <CardHeader className="space-y-1">
                <div className="flex items-center gap-2 mb-2">
                  <div className="p-2 bg-primary/10 rounded-lg">
                    <Building2 className="h-5 w-5 text-primary" />
                  </div>
                  <span className="text-sm text-muted-foreground">Passo 4 de 4</span>
                </div>
                <CardTitle className="text-xl">Filial / Estabelecimento</CardTitle>
                <CardDescription>
                  Cadastre a filial com o CNPJ para importar arquivos EFD.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="filialCnpj">CNPJ</Label>
                  <Input
                    id="filialCnpj"
                    placeholder="00.000.000/0000-00"
                    value={data.filialCnpj}
                    onChange={handleCnpjChange}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="filialRazaoSocial">Razão Social</Label>
                  <Input
                    id="filialRazaoSocial"
                    placeholder="Nome jurídico da empresa"
                    value={data.filialRazaoSocial}
                    onChange={(e) => setData({ ...data, filialRazaoSocial: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="filialNomeFantasia">Nome Fantasia (opcional)</Label>
                  <Input
                    id="filialNomeFantasia"
                    placeholder="Nome comercial"
                    value={data.filialNomeFantasia}
                    onChange={(e) => setData({ ...data, filialNomeFantasia: e.target.value })}
                  />
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setStep(3)}>
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

          {step === 5 && (
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
                <Button className="w-full" onClick={() => navigate('/')}>
                  Acessar o Sistema
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
