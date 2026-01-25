import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { Building2, Plus, Users, Store, Copy, Check } from 'lucide-react';
import { formatCNPJMasked } from '@/lib/formatFilial';

interface Tenant {
  id: string;
  nome: string;
  created_at: string;
}

interface GrupoEmpresas {
  id: string;
  tenant_id: string;
  nome: string;
  empresas: Empresa[];
}

interface Empresa {
  id: string;
  grupo_id: string;
  nome: string;
  filiais: Filial[];
}

interface Filial {
  id: string;
  empresa_id: string;
  cnpj: string;
  razao_social: string;
  nome_fantasia: string | null;
}



export default function Empresas() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [grupos, setGrupos] = useState<GrupoEmpresas[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);
  
  // Dialog states
  const [grupoDialogOpen, setGrupoDialogOpen] = useState(false);
  const [empresaDialogOpen, setEmpresaDialogOpen] = useState(false);
  const [filialDialogOpen, setFilialDialogOpen] = useState(false);
  
  // Form states
  const [selectedTenant, setSelectedTenant] = useState<string>('');
  const [selectedGrupo, setSelectedGrupo] = useState<string>('');
  const [selectedEmpresa, setSelectedEmpresa] = useState<string>('');
  const [formData, setFormData] = useState({
    grupoNome: '',
    empresaNome: '',
    filialCnpj: '',
    filialRazaoSocial: '',
    filialNomeFantasia: '',
  });
  const [submitting, setSubmitting] = useState(false);
  
  const { user } = useAuth();

  useEffect(() => {
    fetchData();
  }, [user]);

  async function fetchData() {
    try {
      // Fetch tenants
      const { data: tenantsData, error: tenantsError } = await supabase
        .from('tenants')
        .select('*')
        .order('nome');

      if (tenantsError) throw tenantsError;
      setTenants(tenantsData || []);

      if (tenantsData && tenantsData.length > 0) {
        if (!selectedTenant) {
          setSelectedTenant(tenantsData[0].id);
        }
      }

      // Fetch grupos with empresas and filiais
      const { data: gruposData, error: gruposError } = await supabase
        .from('grupos_empresas')
        .select(`
          id,
          tenant_id,
          nome,
          empresas (
            id,
            grupo_id,
            nome,
            filiais (
              id,
              empresa_id,
              cnpj,
              razao_social,
              nome_fantasia
            )
          )
        `)
        .order('nome');

      if (gruposError) throw gruposError;
      setGrupos(gruposData || []);

    } catch (error) {
      console.error('Error:', error);
      toast.error('Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  }

  const handleCopyTenantId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const formatCnpjInput = (value: string) => {
    const cleaned = value.replace(/\D/g, '').slice(0, 14);
    return cleaned.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  };

  async function handleAddGrupo(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedTenant) return;

    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('grupos_empresas')
        .insert({
          tenant_id: selectedTenant,
          nome: formData.grupoNome,
        });

      if (error) throw error;

      toast.success('Grupo cadastrado com sucesso!');
      setGrupoDialogOpen(false);
      setFormData({ ...formData, grupoNome: '' });
      fetchData();
    } catch (error) {
      console.error('Error:', error);
      toast.error('Erro ao cadastrar grupo');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAddEmpresa(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedGrupo) return;

    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('empresas')
        .insert({
          grupo_id: selectedGrupo,
          nome: formData.empresaNome,
        });

      if (error) throw error;

      toast.success('Empresa cadastrada com sucesso!');
      setEmpresaDialogOpen(false);
      setFormData({ ...formData, empresaNome: '' });
      fetchData();
    } catch (error) {
      console.error('Error:', error);
      toast.error('Erro ao cadastrar empresa');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAddFilial(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedEmpresa) return;

    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('filiais')
        .insert({
          empresa_id: selectedEmpresa,
          cnpj: formData.filialCnpj.replace(/\D/g, ''),
          razao_social: formData.filialRazaoSocial,
          nome_fantasia: formData.filialNomeFantasia || null,
        });

      if (error) throw error;

      toast.success('Filial cadastrada com sucesso!');
      setFilialDialogOpen(false);
      setFormData({ ...formData, filialCnpj: '', filialRazaoSocial: '', filialNomeFantasia: '' });
      fetchData();
    } catch (error: any) {
      console.error('Error:', error);
      if (error.message?.includes('duplicate')) {
        toast.error('Este CNPJ já está cadastrado');
      } else {
        toast.error('Erro ao cadastrar filial');
      }
    } finally {
      setSubmitting(false);
    }
  }

  const filteredGrupos = grupos.filter(g => g.tenant_id === selectedTenant);
  const allEmpresas = filteredGrupos.flatMap(g => g.empresas || []);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Estrutura Empresarial</h1>
          <p className="text-muted-foreground">
            Gerencie seus ambientes, grupos, empresas e filiais
          </p>
        </div>
        <div className="flex gap-2">
          <Dialog open={grupoDialogOpen} onOpenChange={setGrupoDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Users className="h-4 w-4 mr-2" />
                Novo Grupo
              </Button>
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={handleAddGrupo}>
                <DialogHeader>
                  <DialogTitle>Novo Grupo de Empresas</DialogTitle>
                  <DialogDescription>
                    Crie um grupo para organizar suas empresas
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Ambiente</Label>
                    <Select value={selectedTenant} onValueChange={setSelectedTenant}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o ambiente" />
                      </SelectTrigger>
                      <SelectContent>
                        {tenants.map((t) => (
                          <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="grupoNome">Nome do Grupo</Label>
                    <Input
                      id="grupoNome"
                      placeholder="Ex: Grupo ABC"
                      value={formData.grupoNome}
                      onChange={(e) => setFormData({ ...formData, grupoNome: e.target.value })}
                      required
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setGrupoDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={submitting}>
                    {submitting ? 'Salvando...' : 'Salvar'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog open={empresaDialogOpen} onOpenChange={setEmpresaDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Store className="h-4 w-4 mr-2" />
                Nova Empresa
              </Button>
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={handleAddEmpresa}>
                <DialogHeader>
                  <DialogTitle>Nova Empresa</DialogTitle>
                  <DialogDescription>
                    Cadastre uma empresa dentro de um grupo
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Grupo de Empresas</Label>
                    <Select value={selectedGrupo} onValueChange={setSelectedGrupo}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione o grupo" />
                      </SelectTrigger>
                      <SelectContent>
                        {filteredGrupos.map((g) => (
                          <SelectItem key={g.id} value={g.id}>{g.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="empresaNome">Nome da Empresa</Label>
                    <Input
                      id="empresaNome"
                      placeholder="Ex: Empresa XYZ"
                      value={formData.empresaNome}
                      onChange={(e) => setFormData({ ...formData, empresaNome: e.target.value })}
                      required
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setEmpresaDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={submitting || !selectedGrupo}>
                    {submitting ? 'Salvando...' : 'Salvar'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>

          <Dialog open={filialDialogOpen} onOpenChange={setFilialDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Nova Filial
              </Button>
            </DialogTrigger>
            <DialogContent>
              <form onSubmit={handleAddFilial}>
                <DialogHeader>
                  <DialogTitle>Nova Filial</DialogTitle>
                  <DialogDescription>
                    Cadastre uma filial com CNPJ
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Empresa</Label>
                    <Select value={selectedEmpresa} onValueChange={setSelectedEmpresa}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione a empresa" />
                      </SelectTrigger>
                      <SelectContent>
                        {allEmpresas.map((e) => (
                          <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="filialCnpj">CNPJ</Label>
                    <Input
                      id="filialCnpj"
                      placeholder="00.000.000/0000-00"
                      value={formData.filialCnpj}
                      onChange={(e) => setFormData({ ...formData, filialCnpj: formatCnpjInput(e.target.value) })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="filialRazaoSocial">Razão Social</Label>
                    <Input
                      id="filialRazaoSocial"
                      placeholder="Nome jurídico"
                      value={formData.filialRazaoSocial}
                      onChange={(e) => setFormData({ ...formData, filialRazaoSocial: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="filialNomeFantasia">Nome Fantasia (opcional)</Label>
                    <Input
                      id="filialNomeFantasia"
                      placeholder="Nome comercial"
                      value={formData.filialNomeFantasia}
                      onChange={(e) => setFormData({ ...formData, filialNomeFantasia: e.target.value })}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setFilialDialogOpen(false)}>
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={submitting || !selectedEmpresa}>
                    {submitting ? 'Salvando...' : 'Salvar'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Tenant Selector */}
      {tenants.length > 0 && (
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-muted-foreground" />
                <div>
                  <CardTitle className="text-base">Ambiente Selecionado</CardTitle>
                </div>
              </div>
              <Select value={selectedTenant} onValueChange={setSelectedTenant}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {tenants.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Código:</span>
              <code className="font-mono text-xs bg-muted px-2 py-1 rounded">
                {selectedTenant.slice(0, 8)}...
              </code>
              <Button variant="ghost" size="sm" onClick={() => handleCopyTenantId(selectedTenant)}>
                {copied === selectedTenant ? (
                  <Check className="h-3 w-3 text-positive" />
                ) : (
                  <Copy className="h-3 w-3" />
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Hierarchy View */}
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle>Estrutura Hierárquica</CardTitle>
          <CardDescription>
            Grupos → Empresas → Filiais (com CNPJ)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-12 text-center text-muted-foreground">
              Carregando...
            </div>
          ) : filteredGrupos.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Users className="h-12 w-12 text-muted-foreground/30 mb-4" />
              <p className="text-muted-foreground">Nenhum grupo cadastrado</p>
              <p className="text-sm text-muted-foreground/60 mt-1">
                Crie um grupo de empresas para começar
              </p>
            </div>
          ) : (
            <Accordion type="multiple" className="w-full">
              {filteredGrupos.map((grupo) => (
                <AccordionItem key={grupo.id} value={grupo.id}>
                  <AccordionTrigger className="hover:no-underline">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{grupo.nome}</span>
                      <Badge variant="secondary" className="ml-2">
                        {grupo.empresas?.length || 0} empresa(s)
                      </Badge>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="pl-6 space-y-4">
                      {grupo.empresas?.length === 0 ? (
                        <p className="text-sm text-muted-foreground py-2">
                          Nenhuma empresa neste grupo
                        </p>
                      ) : (
                        grupo.empresas?.map((empresa) => (
                          <div key={empresa.id} className="border-l-2 border-border pl-4">
                            <div className="flex items-center gap-2 mb-2">
                              <Store className="h-4 w-4 text-muted-foreground" />
                              <span className="font-medium">{empresa.nome}</span>
                              <Badge variant="outline" className="ml-2">
                                {empresa.filiais?.length || 0} filial(is)
                              </Badge>
                            </div>
                            {empresa.filiais?.length > 0 && (
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>CNPJ</TableHead>
                                    <TableHead>Razão Social</TableHead>
                                    <TableHead>Nome Fantasia</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {empresa.filiais.map((filial) => (
                                    <TableRow key={filial.id}>
                                      <TableCell className="font-mono text-sm">
                                        {formatCNPJMasked(filial.cnpj)}
                                      </TableCell>
                                      <TableCell>{filial.razao_social}</TableCell>
                                      <TableCell>{filial.nome_fantasia || '-'}</TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
