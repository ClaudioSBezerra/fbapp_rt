import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, ArrowDownRight, ArrowUpRight, Truck, Filter, Calendar } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';

interface FreteItem {
  id: string;
  tipo: string;
  mes_ano: string;
  ncm: string | null;
  descricao: string | null;
  cnpj_transportadora: string | null;
  valor: number;
  pis: number;
  cofins: number;
  icms: number;
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

export default function Fretes() {
  const [items, setItems] = useState<FreteItem[]>([]);
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
  const [anoProjecao, setAnoProjecao] = useState<number>(2027);
  const ANOS_PROJECAO = [2027, 2028, 2029, 2030, 2031, 2032, 2033];

  const [newItem, setNewItem] = useState({
    tipo: 'entrada',
    mes_ano: new Date().toISOString().slice(0, 7),
    ncm: '',
    descricao: '',
    cnpj_transportadora: '',
    valor: '',
    pis: '',
    cofins: '',
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
          .from('fretes')
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
  const aggregateData = (data: FreteItem[]): AggregatedRow[] => {
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

  const entradasAgregadas = useMemo(() => 
    aggregateData(filteredItems.filter(i => i.tipo === 'entrada')), 
    [filteredItems, filiais]
  );

  const saidasAgregadas = useMemo(() => 
    aggregateData(filteredItems.filter(i => i.tipo === 'saida')), 
    [filteredItems, filiais]
  );

  const handleNewItem = async () => {
    if (!selectedFilial) {
      toast.error('Selecione uma filial');
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.from('fretes').insert({
        filial_id: selectedFilial,
        tipo: newItem.tipo,
        mes_ano: `${newItem.mes_ano}-01`,
        ncm: newItem.ncm || null,
        descricao: newItem.descricao || null,
        cnpj_transportadora: newItem.cnpj_transportadora || null,
        valor: parseFloat(newItem.valor) || 0,
        pis: parseFloat(newItem.pis) || 0,
        cofins: parseFloat(newItem.cofins) || 0,
      });

      if (error) throw error;

      toast.success('Frete adicionado com sucesso');
      setDialogOpen(false);
      setNewItem({
        tipo: 'entrada',
        mes_ano: new Date().toISOString().slice(0, 7),
        ncm: '',
        descricao: '',
        cnpj_transportadora: '',
        valor: '',
        pis: '',
        cofins: '',
      });

      const { data: itemsData } = await supabase
        .from('fretes')
        .select('*')
        .order('mes_ano', { ascending: false });

      if (itemsData) setItems(itemsData);
    } catch (error) {
      console.error('Error adding item:', error);
      toast.error('Erro ao adicionar frete');
    } finally {
      setSubmitting(false);
    }
  };

  const aliquotaSelecionada = useMemo(() => {
    return aliquotas.find((a) => a.ano === anoProjecao) || null;
  }, [aliquotas, anoProjecao]);

  const totaisEntradas = useMemo(() => {
    const entradas = filteredItems.filter((i) => i.tipo === 'entrada');
    const valor = entradas.reduce((acc, i) => acc + i.valor, 0);
    const icms = entradas.reduce((acc, i) => acc + (i.icms || 0), 0);
    const pisCofins = entradas.reduce((acc, i) => acc + i.pis + i.cofins, 0);
    
    const aliquota = aliquotaSelecionada;
    const icmsProjetado = aliquota ? icms * (1 - (aliquota.reduc_icms / 100)) : icms;
    const ibsProjetado = aliquota ? valor * ((aliquota.ibs_estadual + aliquota.ibs_municipal) / 100) : 0;
    const cbsProjetado = aliquota ? valor * (aliquota.cbs / 100) : 0;
    
    return { valor, icms, pisCofins, icmsProjetado, ibsProjetado, cbsProjetado };
  }, [filteredItems, aliquotaSelecionada]);

  const totaisSaidas = useMemo(() => {
    const saidas = filteredItems.filter((i) => i.tipo === 'saida');
    const valor = saidas.reduce((acc, i) => acc + i.valor, 0);
    const icms = saidas.reduce((acc, i) => acc + (i.icms || 0), 0);
    const pisCofins = saidas.reduce((acc, i) => acc + i.pis + i.cofins, 0);
    
    const aliquota = aliquotaSelecionada;
    const icmsProjetado = aliquota ? icms * (1 - (aliquota.reduc_icms / 100)) : icms;
    const ibsProjetado = aliquota ? valor * ((aliquota.ibs_estadual + aliquota.ibs_municipal) / 100) : 0;
    const cbsProjetado = aliquota ? valor * (aliquota.cbs / 100) : 0;
    
    return { valor, icms, pisCofins, icmsProjetado, ibsProjetado, cbsProjetado };
  }, [filteredItems, aliquotaSelecionada]);

  const hasFiliais = filiais.length > 0;

  const renderTable = (data: AggregatedRow[], tipo: 'entrada' | 'saida') => {
    if (data.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Truck className="h-12 w-12 text-muted-foreground/30 mb-4" />
          <p className="text-muted-foreground">Nenhum frete registrado</p>
          <p className="text-sm text-muted-foreground/60 mt-1">
            Adicione registros de fretes
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
              const aliquota = aliquotaSelecionada;
              
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
          <h1 className="text-2xl font-bold text-foreground">Fretes</h1>
          <p className="text-muted-foreground">
            Comparativo PIS+COFINS vs IBS+CBS agregado por Filial e Mês
          </p>
        </div>
        <Button size="sm" onClick={() => setDialogOpen(true)} disabled={!hasFiliais}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Frete
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
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <Label className="text-sm">Ano Projeção:</Label>
              <Select value={anoProjecao.toString()} onValueChange={(v) => setAnoProjecao(parseInt(v))}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue placeholder="Ano" />
                </SelectTrigger>
                <SelectContent>
                  {ANOS_PROJECAO.map((ano) => (
                    <SelectItem key={ano} value={ano.toString()}>{ano}</SelectItem>
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
              Total Entradas (Fretes s/ Compras) - Projeção {anoProjecao}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Valor (VL_DOC):</span>
              <span className="text-lg font-bold">{formatCurrency(totaisEntradas.valor)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">ICMS:</span>
              <span className="text-lg font-bold">{formatCurrency(totaisEntradas.icms)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">ICMS Projetado:</span>
              <span className="text-lg font-bold">{formatCurrency(totaisEntradas.icmsProjetado)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">PIS+COFINS:</span>
              <span className="text-lg font-bold text-pis-cofins">{formatCurrency(totaisEntradas.pisCofins)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">IBS Projetado:</span>
              <span className="text-lg font-bold text-ibs-cbs">{formatCurrency(totaisEntradas.ibsProjetado)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">CBS Projetado:</span>
              <span className="text-lg font-bold text-ibs-cbs">{formatCurrency(totaisEntradas.cbsProjetado)}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <ArrowUpRight className="h-4 w-4" />
              Total Saídas (Fretes s/ Vendas) - Projeção {anoProjecao}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Valor (VL_DOC):</span>
              <span className="text-lg font-bold">{formatCurrency(totaisSaidas.valor)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">ICMS:</span>
              <span className="text-lg font-bold">{formatCurrency(totaisSaidas.icms)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">ICMS Projetado:</span>
              <span className="text-lg font-bold">{formatCurrency(totaisSaidas.icmsProjetado)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">PIS+COFINS:</span>
              <span className="text-lg font-bold text-pis-cofins">{formatCurrency(totaisSaidas.pisCofins)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">IBS Projetado:</span>
              <span className="text-lg font-bold text-ibs-cbs">{formatCurrency(totaisSaidas.ibsProjetado)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">CBS Projetado:</span>
              <span className="text-lg font-bold text-ibs-cbs">{formatCurrency(totaisSaidas.cbsProjetado)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/50">
        <Tabs defaultValue="entradas" className="w-full">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Registros Agregados</CardTitle>
                <CardDescription>
                  Visualize fretes sobre compras e vendas agregados por Filial e Mês/Ano
                </CardDescription>
              </div>
              <TabsList>
                <TabsTrigger value="entradas">Entradas</TabsTrigger>
                <TabsTrigger value="saidas">Saídas</TabsTrigger>
              </TabsList>
            </div>
          </CardHeader>
          <CardContent>
            <TabsContent value="entradas" className="mt-0">
              {loading ? (
                <div className="py-12 text-center text-muted-foreground">Carregando...</div>
              ) : (
                renderTable(entradasAgregadas, 'entrada')
              )}
            </TabsContent>
            <TabsContent value="saidas" className="mt-0">
              {loading ? (
                <div className="py-12 text-center text-muted-foreground">Carregando...</div>
              ) : (
                renderTable(saidasAgregadas, 'saida')
              )}
            </TabsContent>
          </CardContent>
        </Tabs>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Frete</DialogTitle>
            <DialogDescription>
              Adicione um registro de frete.
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
                <Label>Tipo</Label>
                <Select
                  value={newItem.tipo}
                  onValueChange={(v) => setNewItem({ ...newItem, tipo: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="entrada">Entrada (s/ Compra)</SelectItem>
                    <SelectItem value="saida">Saída (s/ Venda)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="mes_ano">Mês/Ano</Label>
                <Input
                  id="mes_ano"
                  type="month"
                  value={newItem.mes_ano}
                  onChange={(e) => setNewItem({ ...newItem, mes_ano: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ncm">NCM</Label>
                <Input
                  id="ncm"
                  placeholder="00000000"
                  value={newItem.ncm}
                  onChange={(e) => setNewItem({ ...newItem, ncm: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cnpj_transportadora">CNPJ Transportadora</Label>
              <Input
                id="cnpj_transportadora"
                placeholder="00000000000000"
                value={newItem.cnpj_transportadora}
                onChange={(e) => setNewItem({ ...newItem, cnpj_transportadora: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="descricao">Descrição</Label>
              <Input
                id="descricao"
                placeholder="Descrição do frete"
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
