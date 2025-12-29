import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, ArrowDownRight, ArrowUpRight, Zap, Filter } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';

interface EnergiaAguaItem {
  id: string;
  tipo_operacao: string;
  tipo_servico: string;
  mes_ano: string;
  cnpj_fornecedor: string | null;
  valor: number;
  pis: number;
  cofins: number;
  icms: number;
  descricao: string | null;
  filial_id: string;
}

interface Filial {
  id: string;
  cnpj: string;
  razao_social: string;
  nome_fantasia: string | null;
}

interface Aliquota {
  ano: number;
  ibs_estadual: number;
  ibs_municipal: number;
  cbs: number;
  reduc_icms: number;
}

interface AggregatedRow {
  filial_id: string;
  filial_nome: string;
  mes_ano: string;
  valor: number;
  pis: number;
  cofins: number;
  icms: number;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return new Intl.DateTimeFormat('pt-BR', { month: 'short', year: 'numeric' }).format(date);
}

function formatCNPJ(cnpj: string): string {
  const cleaned = cnpj.replace(/\D/g, '');
  return cleaned.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

function getYearFromMesAno(mesAno: string): number {
  return new Date(mesAno).getFullYear();
}

export default function EnergiaAgua() {
  const [items, setItems] = useState<EnergiaAguaItem[]>([]);
  const [aliquotas, setAliquotas] = useState<Aliquota[]>([]);
  const [filiais, setFiliais] = useState<Filial[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedFilial, setSelectedFilial] = useState<string>('');
  const { user } = useAuth();

  // Filters
  const [filterFilial, setFilterFilial] = useState<string>('all');
  const [filterMesAno, setFilterMesAno] = useState<string>('all');

  const [newItem, setNewItem] = useState({
    tipo_operacao: 'credito',
    tipo_servico: 'energia',
    mes_ano: new Date().toISOString().slice(0, 7),
    cnpj_fornecedor: '',
    valor: '',
    pis: '',
    cofins: '',
    descricao: '',
  });

  useEffect(() => {
    async function fetchData() {
      try {
        const { data: aliquotasData } = await supabase
          .from('aliquotas')
          .select('ano, ibs_estadual, ibs_municipal, cbs, reduc_icms')
          .order('ano');

        if (aliquotasData) setAliquotas(aliquotasData);

        const { data: itemsData } = await supabase
          .from('energia_agua')
          .select('*')
          .order('mes_ano', { ascending: false });

        if (itemsData) setItems(itemsData);

        const { data: filiaisData } = await supabase
          .from('filiais')
          .select('id, cnpj, razao_social, nome_fantasia');

        if (filiaisData) {
          setFiliais(filiaisData);
          if (filiaisData.length > 0 && !selectedFilial) {
            setSelectedFilial(filiaisData[0].id);
          }
        }
      } catch (error) {
        console.error('Error fetching data:', error);
        toast.error('Erro ao carregar dados');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [user]);

  // Get unique mes_ano options
  const mesAnoOptions = useMemo(() => {
    const unique = [...new Set(items.map(i => i.mes_ano))];
    return unique.sort((a, b) => b.localeCompare(a));
  }, [items]);

  // Filter items
  const filteredItems = useMemo(() => {
    return items.filter(i => {
      if (filterFilial !== 'all' && i.filial_id !== filterFilial) return false;
      if (filterMesAno !== 'all' && i.mes_ano !== filterMesAno) return false;
      return true;
    });
  }, [items, filterFilial, filterMesAno]);

  // Aggregate data by filial + mes_ano
  const aggregateData = (data: EnergiaAguaItem[]): AggregatedRow[] => {
    const grouped: Record<string, AggregatedRow> = {};
    
    data.forEach(item => {
      const key = `${item.filial_id}_${item.mes_ano}`;
      if (!grouped[key]) {
        const filial = filiais.find(f => f.id === item.filial_id);
        grouped[key] = {
          filial_id: item.filial_id,
          filial_nome: filial?.nome_fantasia || filial?.razao_social || 'Filial',
          mes_ano: item.mes_ano,
          valor: 0,
          pis: 0,
          cofins: 0,
          icms: 0,
        };
      }
      grouped[key].valor += item.valor;
      grouped[key].pis += item.pis;
      grouped[key].cofins += item.cofins;
      grouped[key].icms += item.icms || 0;
    });

    return Object.values(grouped).sort((a, b) => b.mes_ano.localeCompare(a.mes_ano));
  };

  const creditosAgregados = useMemo(() => 
    aggregateData(filteredItems.filter(i => i.tipo_operacao === 'credito')), 
    [filteredItems, filiais]
  );

  const debitosAgregados = useMemo(() => 
    aggregateData(filteredItems.filter(i => i.tipo_operacao === 'debito')), 
    [filteredItems, filiais]
  );

  const handleNewItem = async () => {
    if (!selectedFilial) {
      toast.error('Selecione uma filial');
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.from('energia_agua').insert({
        filial_id: selectedFilial,
        tipo_operacao: newItem.tipo_operacao,
        tipo_servico: newItem.tipo_servico,
        mes_ano: `${newItem.mes_ano}-01`,
        cnpj_fornecedor: newItem.cnpj_fornecedor || null,
        valor: parseFloat(newItem.valor) || 0,
        pis: parseFloat(newItem.pis) || 0,
        cofins: parseFloat(newItem.cofins) || 0,
        descricao: newItem.descricao || null,
      });

      if (error) throw error;

      toast.success('Registro adicionado com sucesso');
      setDialogOpen(false);
      setNewItem({
        tipo_operacao: 'credito',
        tipo_servico: 'energia',
        mes_ano: new Date().toISOString().slice(0, 7),
        cnpj_fornecedor: '',
        valor: '',
        pis: '',
        cofins: '',
        descricao: '',
      });

      const { data: itemsData } = await supabase
        .from('energia_agua')
        .select('*')
        .order('mes_ano', { ascending: false });

      if (itemsData) setItems(itemsData);
    } catch (error) {
      console.error('Error adding item:', error);
      toast.error('Erro ao adicionar registro');
    } finally {
      setSubmitting(false);
    }
  };

  const totaisCreditos = useMemo(() => {
    const creditos = filteredItems.filter((i) => i.tipo_operacao === 'credito');
    return {
      valor: creditos.reduce((acc, i) => acc + i.valor, 0),
      icms: creditos.reduce((acc, i) => acc + (i.icms || 0), 0),
      pisCofins: creditos.reduce((acc, i) => acc + i.pis + i.cofins, 0),
    };
  }, [filteredItems]);

  const totaisDebitos = useMemo(() => {
    const debitos = filteredItems.filter((i) => i.tipo_operacao === 'debito');
    return {
      valor: debitos.reduce((acc, i) => acc + i.valor, 0),
      icms: debitos.reduce((acc, i) => acc + (i.icms || 0), 0),
      pisCofins: debitos.reduce((acc, i) => acc + i.pis + i.cofins, 0),
    };
  }, [filteredItems]);

  const hasFiliais = filiais.length > 0;

  const renderTable = (data: AggregatedRow[], tipo: 'credito' | 'debito') => {
    if (data.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Zap className="h-12 w-12 text-muted-foreground/30 mb-4" />
          <p className="text-muted-foreground">Nenhum registro encontrado</p>
          <p className="text-sm text-muted-foreground/60 mt-1">
            Adicione registros de energia ou água
          </p>
        </div>
      );
    }

    return (
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Filial</TableHead>
              <TableHead>Mês/Ano</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead className="text-right">ICMS</TableHead>
              <TableHead className="text-right">ICMS Projetado</TableHead>
              <TableHead className="text-right text-pis-cofins">PIS+COFINS</TableHead>
              <TableHead className="text-right text-ibs-cbs">IBS Projetado</TableHead>
              <TableHead className="text-right text-ibs-cbs">CBS Projetado</TableHead>
              <TableHead className="text-right">Diferença</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((row, index) => {
              const year = getYearFromMesAno(row.mes_ano);
              const aliquota = aliquotas.find((a) => a.ano === year) || aliquotas[0];
              
              const vlIcms = row.icms;
              const vlIcmsProjetado = aliquota ? vlIcms * (1 - (aliquota.reduc_icms / 100)) : vlIcms;
              const vlPisCofins = row.pis + row.cofins;
              const vlIbsProjetado = aliquota ? row.valor * ((aliquota.ibs_estadual + aliquota.ibs_municipal) / 100) : 0;
              const vlCbsProjetado = aliquota ? row.valor * (aliquota.cbs / 100) : 0;
              const diferenca = (vlIbsProjetado + vlCbsProjetado) - vlPisCofins;

              return (
                <TableRow key={`${row.filial_id}-${row.mes_ano}-${index}`}>
                  <TableCell className="font-medium">{row.filial_nome}</TableCell>
                  <TableCell>{formatDate(row.mes_ano)}</TableCell>
                  <TableCell className="text-right font-mono">{formatCurrency(row.valor)}</TableCell>
                  <TableCell className="text-right font-mono">{formatCurrency(vlIcms)}</TableCell>
                  <TableCell className="text-right font-mono">{formatCurrency(vlIcmsProjetado)}</TableCell>
                  <TableCell className="text-right font-mono text-pis-cofins">{formatCurrency(vlPisCofins)}</TableCell>
                  <TableCell className="text-right font-mono text-ibs-cbs">{formatCurrency(vlIbsProjetado)}</TableCell>
                  <TableCell className="text-right font-mono text-ibs-cbs">{formatCurrency(vlCbsProjetado)}</TableCell>
                  <TableCell className="text-right">
                    <Badge
                      variant={diferenca > 0 ? 'destructive' : diferenca < 0 ? 'default' : 'secondary'}
                      className={diferenca < 0 ? 'bg-positive text-positive-foreground' : ''}
                    >
                      {diferenca > 0 ? '+' : ''}
                      {formatCurrency(diferenca)}
                    </Badge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Energia e Água</h1>
          <p className="text-muted-foreground">
            Comparativo PIS+COFINS vs IBS+CBS agregado por Filial e Mês
          </p>
        </div>
        <Button size="sm" onClick={() => setDialogOpen(true)} disabled={!hasFiliais}>
          <Plus className="h-4 w-4 mr-2" />
          Nova Entrada
        </Button>
      </div>

      {/* Filters */}
      <Card className="border-border/50">
        <CardContent className="pt-4">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Filtros:</span>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-sm">Filial:</Label>
              <Select value={filterFilial} onValueChange={setFilterFilial}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {filiais.map((filial) => (
                    <SelectItem key={filial.id} value={filial.id}>
                      {filial.nome_fantasia || filial.razao_social}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-sm">Mês/Ano:</Label>
              <Select value={filterMesAno} onValueChange={setFilterMesAno}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {mesAnoOptions.map((mesAno) => (
                    <SelectItem key={mesAno} value={mesAno}>
                      {formatDate(mesAno)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <ArrowDownRight className="h-4 w-4" />
              Total Créditos
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Valor (VL_DOC):</span>
              <span className="text-lg font-bold">{formatCurrency(totaisCreditos.valor)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">ICMS:</span>
              <span className="text-lg font-bold">{formatCurrency(totaisCreditos.icms)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">PIS+COFINS:</span>
              <span className="text-lg font-bold text-pis-cofins">{formatCurrency(totaisCreditos.pisCofins)}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <ArrowUpRight className="h-4 w-4" />
              Total Débitos
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Valor (VL_DOC):</span>
              <span className="text-lg font-bold">{formatCurrency(totaisDebitos.valor)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">ICMS:</span>
              <span className="text-lg font-bold">{formatCurrency(totaisDebitos.icms)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">PIS+COFINS:</span>
              <span className="text-lg font-bold text-pis-cofins">{formatCurrency(totaisDebitos.pisCofins)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/50">
        <Tabs defaultValue="creditos" className="w-full">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Registros Agregados</CardTitle>
                <CardDescription>
                  Visualize créditos e débitos de energia e água agregados por Filial e Mês/Ano
                </CardDescription>
              </div>
              <TabsList>
                <TabsTrigger value="creditos">Créditos</TabsTrigger>
                <TabsTrigger value="debitos">Débitos</TabsTrigger>
              </TabsList>
            </div>
          </CardHeader>
          <CardContent>
            <TabsContent value="creditos" className="mt-0">
              {loading ? (
                <div className="py-12 text-center text-muted-foreground">Carregando...</div>
              ) : (
                renderTable(creditosAgregados, 'credito')
              )}
            </TabsContent>
            <TabsContent value="debitos" className="mt-0">
              {loading ? (
                <div className="py-12 text-center text-muted-foreground">Carregando...</div>
              ) : (
                renderTable(debitosAgregados, 'debito')
              )}
            </TabsContent>
          </CardContent>
        </Tabs>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova Entrada</DialogTitle>
            <DialogDescription>
              Adicione um registro de energia ou água.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Filial</Label>
                <Select value={selectedFilial} onValueChange={setSelectedFilial}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {filiais.map((filial) => (
                      <SelectItem key={filial.id} value={filial.id}>
                        {filial.nome_fantasia || filial.razao_social}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Operação</Label>
                <Select
                  value={newItem.tipo_operacao}
                  onValueChange={(v) => setNewItem({ ...newItem, tipo_operacao: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="credito">Crédito</SelectItem>
                    <SelectItem value="debito">Débito</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tipo Serviço</Label>
                <Select
                  value={newItem.tipo_servico}
                  onValueChange={(v) => setNewItem({ ...newItem, tipo_servico: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="energia">Energia</SelectItem>
                    <SelectItem value="agua">Água</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="mes_ano">Mês/Ano</Label>
                <Input
                  id="mes_ano"
                  type="month"
                  value={newItem.mes_ano}
                  onChange={(e) => setNewItem({ ...newItem, mes_ano: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cnpj_fornecedor">CNPJ Fornecedor</Label>
              <Input
                id="cnpj_fornecedor"
                placeholder="00000000000000"
                value={newItem.cnpj_fornecedor}
                onChange={(e) => setNewItem({ ...newItem, cnpj_fornecedor: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="descricao">Descrição</Label>
              <Input
                id="descricao"
                placeholder="Descrição opcional"
                value={newItem.descricao}
                onChange={(e) => setNewItem({ ...newItem, descricao: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="valor">Valor (R$)</Label>
                <Input
                  id="valor"
                  type="number"
                  step="0.01"
                  placeholder="0,00"
                  value={newItem.valor}
                  onChange={(e) => setNewItem({ ...newItem, valor: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pis">PIS (R$)</Label>
                <Input
                  id="pis"
                  type="number"
                  step="0.01"
                  placeholder="0,00"
                  value={newItem.pis}
                  onChange={(e) => setNewItem({ ...newItem, pis: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cofins">COFINS (R$)</Label>
                <Input
                  id="cofins"
                  type="number"
                  step="0.01"
                  placeholder="0,00"
                  value={newItem.cofins}
                  onChange={(e) => setNewItem({ ...newItem, cofins: e.target.value })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleNewItem} disabled={submitting || !selectedFilial}>
              {submitting ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
