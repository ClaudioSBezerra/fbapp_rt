import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, ArrowUpRight, ArrowDownRight, Building2, Filter } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

interface Mercadoria {
  id: string;
  tipo: string;
  mes_ano: string;
  ncm: string | null;
  descricao: string | null;
  valor: number;
  pis: number;
  cofins: number;
  icms: number;
  filial_id: string;
}

interface Aliquota {
  ano: number;
  ibs_estadual: number;
  ibs_municipal: number;
  cbs: number;
  reduc_icms: number;
}

interface Filial {
  id: string;
  cnpj: string;
  razao_social: string;
  nome_fantasia: string | null;
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
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
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

interface MercadoriasTableProps {
  data: AggregatedRow[];
  aliquotas: Aliquota[];
  tipo: 'entrada' | 'saida';
}

function MercadoriasTable({ data, aliquotas, tipo }: MercadoriasTableProps) {
  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        {tipo === 'entrada' ? (
          <ArrowDownRight className="h-12 w-12 text-muted-foreground/30 mb-4" />
        ) : (
          <ArrowUpRight className="h-12 w-12 text-muted-foreground/30 mb-4" />
        )}
        <p className="text-muted-foreground">
          Nenhuma {tipo === 'entrada' ? 'entrada' : 'saída'} registrada
        </p>
        <p className="text-sm text-muted-foreground/60 mt-1">
          Adicione mercadorias ou importe dados EFD
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
                    {diferenca > 0 ? '+' : ''}{formatCurrency(diferenca)}
                  </Badge>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

export default function Mercadorias() {
  const [mercadorias, setMercadorias] = useState<Mercadoria[]>([]);
  const [aliquotas, setAliquotas] = useState<Aliquota[]>([]);
  const [filiais, setFiliais] = useState<Filial[]>([]);
  const [loading, setLoading] = useState(true);
  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const [selectedFilial, setSelectedFilial] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const { user } = useAuth();

  // Filters
  const [filterFilial, setFilterFilial] = useState<string>('all');
  const [filterMesAno, setFilterMesAno] = useState<string>('all');

  const [newMercadoria, setNewMercadoria] = useState({
    tipo: 'entrada',
    mes_ano: new Date().toISOString().slice(0, 7),
    ncm: '',
    descricao: '',
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

        const { data: mercadoriasData } = await supabase
          .from('mercadorias')
          .select('id, tipo, mes_ano, ncm, descricao, valor, pis, cofins, icms, filial_id')
          .order('mes_ano', { ascending: false });
        if (mercadoriasData) setMercadorias(mercadoriasData);

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
    const unique = [...new Set(mercadorias.map(m => m.mes_ano))];
    return unique.sort((a, b) => b.localeCompare(a));
  }, [mercadorias]);

  // Aggregate data by filial + mes_ano
  const aggregateData = (items: Mercadoria[]): AggregatedRow[] => {
    const grouped: Record<string, AggregatedRow> = {};
    
    items.forEach(item => {
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

  // Filter and aggregate
  const filteredMercadorias = useMemo(() => {
    return mercadorias.filter(m => {
      if (filterFilial !== 'all' && m.filial_id !== filterFilial) return false;
      if (filterMesAno !== 'all' && m.mes_ano !== filterMesAno) return false;
      return true;
    });
  }, [mercadorias, filterFilial, filterMesAno]);

  const entradasAgregadas = useMemo(() => 
    aggregateData(filteredMercadorias.filter(m => m.tipo === 'entrada')), 
    [filteredMercadorias, filiais]
  );

  const saidasAgregadas = useMemo(() => 
    aggregateData(filteredMercadorias.filter(m => m.tipo === 'saida')), 
    [filteredMercadorias, filiais]
  );

  const handleNewMercadoria = async () => {
    if (!selectedFilial) {
      toast.error('Selecione uma filial');
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.from('mercadorias').insert({
        filial_id: selectedFilial,
        tipo: newMercadoria.tipo,
        mes_ano: `${newMercadoria.mes_ano}-01`,
        ncm: newMercadoria.ncm || null,
        descricao: newMercadoria.descricao || null,
        valor: parseFloat(newMercadoria.valor) || 0,
        pis: parseFloat(newMercadoria.pis) || 0,
        cofins: parseFloat(newMercadoria.cofins) || 0,
      });
      if (error) throw error;

      toast.success('Mercadoria adicionada com sucesso');
      setNewDialogOpen(false);
      setNewMercadoria({ tipo: 'entrada', mes_ano: new Date().toISOString().slice(0, 7), ncm: '', descricao: '', valor: '', pis: '', cofins: '' });

      const { data: mercadoriasData } = await supabase
        .from('mercadorias')
        .select('id, tipo, mes_ano, ncm, descricao, valor, pis, cofins, icms, filial_id')
        .order('mes_ano', { ascending: false });
      if (mercadoriasData) setMercadorias(mercadoriasData);
    } catch (error) {
      console.error('Error adding mercadoria:', error);
      toast.error('Erro ao adicionar mercadoria');
    } finally {
      setSubmitting(false);
    }
  };

  const totalEntradasPisCofins = filteredMercadorias.filter((m) => m.tipo === 'entrada').reduce((acc, m) => acc + m.pis + m.cofins, 0);
  const totalSaidasPisCofins = filteredMercadorias.filter((m) => m.tipo === 'saida').reduce((acc, m) => acc + m.pis + m.cofins, 0);
  const hasFiliais = filiais.length > 0;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Painel de Mercadorias</h1>
          <p className="text-muted-foreground">Comparativo PIS+COFINS vs IBS+CBS agregado por Filial e Mês</p>
        </div>
        <Button size="sm" onClick={() => setNewDialogOpen(true)} disabled={!hasFiliais}>
          <Plus className="h-4 w-4 mr-2" />
          Nova Mercadoria
        </Button>
      </div>

      {!hasFiliais && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <Building2 className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <p className="text-sm font-medium">Nenhuma filial cadastrada</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Use o botão "Importar EFD" no cabeçalho para criar automaticamente a filial.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

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
              <ArrowDownRight className="h-4 w-4" /> Total Entradas (Créditos)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-pis-cofins">{formatCurrency(totalEntradasPisCofins)}</p>
            <p className="text-xs text-muted-foreground">PIS+COFINS acumulado</p>
          </CardContent>
        </Card>
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <ArrowUpRight className="h-4 w-4" /> Total Saídas (Débitos)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-pis-cofins">{formatCurrency(totalSaidasPisCofins)}</p>
            <p className="text-xs text-muted-foreground">PIS+COFINS acumulado</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/50">
        <Tabs defaultValue="entradas" className="w-full">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Operações Agregadas</CardTitle>
                <CardDescription>Visualize entradas e saídas agregadas por Filial e Mês/Ano</CardDescription>
              </div>
              <TabsList>
                <TabsTrigger value="entradas">Entradas</TabsTrigger>
                <TabsTrigger value="saidas">Saídas</TabsTrigger>
              </TabsList>
            </div>
          </CardHeader>
          <CardContent>
            <TabsContent value="entradas" className="mt-0">
              {loading ? <div className="py-12 text-center text-muted-foreground">Carregando...</div> : <MercadoriasTable data={entradasAgregadas} aliquotas={aliquotas} tipo="entrada" />}
            </TabsContent>
            <TabsContent value="saidas" className="mt-0">
              {loading ? <div className="py-12 text-center text-muted-foreground">Carregando...</div> : <MercadoriasTable data={saidasAgregadas} aliquotas={aliquotas} tipo="saida" />}
            </TabsContent>
          </CardContent>
        </Tabs>
      </Card>

      <Dialog open={newDialogOpen} onOpenChange={setNewDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova Mercadoria</DialogTitle>
            <DialogDescription>Adicione manualmente uma mercadoria ou serviço.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Filial</Label>
                <Select value={selectedFilial} onValueChange={setSelectedFilial}>
                  <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                  <SelectContent>
                    {filiais.map((filial) => (
                      <SelectItem key={filial.id} value={filial.id}>
                        {filial.nome_fantasia || filial.razao_social} - {formatCNPJ(filial.cnpj)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select value={newMercadoria.tipo} onValueChange={(v) => setNewMercadoria({ ...newMercadoria, tipo: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="entrada">Entrada</SelectItem>
                    <SelectItem value="saida">Saída</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="mes_ano">Mês/Ano</Label>
                <Input id="mes_ano" type="month" value={newMercadoria.mes_ano} onChange={(e) => setNewMercadoria({ ...newMercadoria, mes_ano: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ncm">NCM</Label>
                <Input id="ncm" placeholder="00000000" value={newMercadoria.ncm} onChange={(e) => setNewMercadoria({ ...newMercadoria, ncm: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="descricao">Descrição</Label>
              <Input id="descricao" placeholder="Descrição do produto ou serviço" value={newMercadoria.descricao} onChange={(e) => setNewMercadoria({ ...newMercadoria, descricao: e.target.value })} />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="valor">Valor (R$)</Label>
                <Input id="valor" type="number" step="0.01" placeholder="0,00" value={newMercadoria.valor} onChange={(e) => setNewMercadoria({ ...newMercadoria, valor: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pis">PIS (R$)</Label>
                <Input id="pis" type="number" step="0.01" placeholder="0,00" value={newMercadoria.pis} onChange={(e) => setNewMercadoria({ ...newMercadoria, pis: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cofins">COFINS (R$)</Label>
                <Input id="cofins" type="number" step="0.01" placeholder="0,00" value={newMercadoria.cofins} onChange={(e) => setNewMercadoria({ ...newMercadoria, cofins: e.target.value })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewDialogOpen(false)}>Cancelar</Button>
            <Button onClick={handleNewMercadoria} disabled={submitting || !selectedFilial}>{submitting ? 'Salvando...' : 'Salvar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
