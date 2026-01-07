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
import { Plus, ArrowUpRight, ArrowDownRight, Building2, Filter, Trash2, AlertTriangle, Calendar } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';


interface Aliquota {
  ano: number;
  ibs_estadual: number;
  ibs_municipal: number;
  cbs: number;
  reduc_icms: number;
  reduc_piscofins: number;
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
  tipo: string;
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
  anoProjecao: number;
}

function MercadoriasTable({ data, aliquotas, tipo, anoProjecao }: MercadoriasTableProps) {
  const aliquotaSelecionada = aliquotas.find((a) => a.ano === anoProjecao) || aliquotas[0];
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
            <TableHead className="text-right text-pis-cofins">PIS+COFINS Projetado</TableHead>
            <TableHead className="text-right">Base IBS/CBS</TableHead>
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
            const vlPisCofinsProjetado = aliquota ? vlPisCofins * (1 - (aliquota.reduc_piscofins / 100)) : vlPisCofins;
            const baseIbsCbs = row.valor - vlIcmsProjetado - vlPisCofinsProjetado;
            const vlIbsProjetado = aliquota ? baseIbsCbs * ((aliquota.ibs_estadual + aliquota.ibs_municipal) / 100) : 0;
            const vlCbsProjetado = aliquota ? baseIbsCbs * (aliquota.cbs / 100) : 0;
            const diferenca = (vlIbsProjetado + vlCbsProjetado) - vlPisCofins;

            return (
              <TableRow key={`${row.filial_id}-${row.mes_ano}-${index}`}>
                <TableCell className="font-medium">{row.filial_nome}</TableCell>
                <TableCell>{formatDate(row.mes_ano)}</TableCell>
                <TableCell className="text-right font-mono">{formatCurrency(row.valor)}</TableCell>
                <TableCell className="text-right font-mono">{formatCurrency(vlIcms)}</TableCell>
                <TableCell className="text-right font-mono">{formatCurrency(vlIcmsProjetado)}</TableCell>
                <TableCell className="text-right font-mono text-pis-cofins">{formatCurrency(vlPisCofins)}</TableCell>
                <TableCell className="text-right font-mono text-pis-cofins">{formatCurrency(vlPisCofinsProjetado)}</TableCell>
                <TableCell className="text-right font-mono">{formatCurrency(baseIbsCbs)}</TableCell>
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
  const [aggregatedData, setAggregatedData] = useState<AggregatedRow[]>([]);
  const [aliquotas, setAliquotas] = useState<Aliquota[]>([]);
  const [filiais, setFiliais] = useState<Filial[]>([]);
  const [loading, setLoading] = useState(true);
  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const [selectedFilial, setSelectedFilial] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const { user } = useAuth();

  // Filters
  const [filterFilial, setFilterFilial] = useState<string>('all');
  const [filterMesAno, setFilterMesAno] = useState<string>('all');
  const [anoProjecao, setAnoProjecao] = useState<number>(2027);
  const ANOS_PROJECAO = [2027, 2028, 2029, 2030, 2031, 2032, 2033];

  const [newMercadoria, setNewMercadoria] = useState({
    tipo: 'entrada',
    mes_ano: new Date().toISOString().slice(0, 7),
    ncm: '',
    descricao: '',
    valor: '',
    pis: '',
    cofins: '',
  });

  // Fetch aggregated data directly from DB
  const fetchAggregatedData = async () => {
    try {
      setLoading(true);
      
      // Fetch aliquotas
      const { data: aliquotasData } = await supabase
        .from('aliquotas')
        .select('ano, ibs_estadual, ibs_municipal, cbs, reduc_icms, reduc_piscofins')
        .order('ano');
      if (aliquotasData) setAliquotas(aliquotasData);

      // Fetch filiais
      const { data: filiaisData } = await supabase
        .from('filiais')
        .select('id, cnpj, razao_social, nome_fantasia');
      if (filiaisData) {
        setFiliais(filiaisData);
        if (filiaisData.length > 0 && !selectedFilial) {
          setSelectedFilial(filiaisData[0].id);
        }
      }

      // Use Materialized View for aggregated data (instant load)
      const { data: aggregatedResult, error } = await supabase.rpc('get_mv_mercadorias_aggregated');
      
      if (error) {
        console.error('Error fetching aggregated mercadorias:', error);
        toast.error('Erro ao carregar mercadorias');
        return;
      }

      if (aggregatedResult) {
        setAggregatedData(aggregatedResult.map((item: any) => ({
          filial_id: item.filial_id,
          filial_nome: item.filial_nome || 'Filial',
          mes_ano: item.mes_ano,
          valor: Number(item.valor) || 0,
          pis: Number(item.pis) || 0,
          cofins: Number(item.cofins) || 0,
          icms: Number(item.icms) || 0,
          tipo: item.tipo,
        })));
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAggregatedData();
  }, [user]);

  // Get unique mes_ano options from aggregated data
  const mesAnoOptions = useMemo(() => {
    const unique = [...new Set(aggregatedData.map(m => m.mes_ano))];
    return unique.sort((a, b) => b.localeCompare(a));
  }, [aggregatedData]);

  // Filter aggregated data
  const filteredData = useMemo(() => {
    return aggregatedData.filter(m => {
      if (filterFilial !== 'all' && m.filial_id !== filterFilial) return false;
      if (filterMesAno !== 'all' && m.mes_ano !== filterMesAno) return false;
      return true;
    });
  }, [aggregatedData, filterFilial, filterMesAno]);

  const entradasAgregadas = useMemo(() => 
    filteredData.filter(m => m.tipo === 'entrada').sort((a, b) => b.mes_ano.localeCompare(a.mes_ano)), 
    [filteredData]
  );

  const saidasAgregadas = useMemo(() => 
    filteredData.filter(m => m.tipo === 'saida').sort((a, b) => b.mes_ano.localeCompare(a.mes_ano)), 
    [filteredData]
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

      // Reload aggregated data
      fetchAggregatedData();
    } catch (error) {
      console.error('Error adding mercadoria:', error);
      toast.error('Erro ao adicionar mercadoria');
    } finally {
      setSubmitting(false);
    }
  };

  const aliquotaSelecionada = useMemo(() => {
    return aliquotas.find((a) => a.ano === anoProjecao) || null;
  }, [aliquotas, anoProjecao]);

  const totaisEntradas = useMemo(() => {
    const entradas = filteredData.filter((m) => m.tipo === 'entrada');
    const valor = entradas.reduce((acc, m) => acc + m.valor, 0);
    const icms = entradas.reduce((acc, m) => acc + (m.icms || 0), 0);
    const pisCofins = entradas.reduce((acc, m) => acc + m.pis + m.cofins, 0);
    
    const aliquota = aliquotaSelecionada;
    const icmsProjetado = aliquota ? icms * (1 - (aliquota.reduc_icms / 100)) : icms;
    const pisCofinsProjetado = aliquota ? pisCofins * (1 - (aliquota.reduc_piscofins / 100)) : pisCofins;
    const baseIbsCbs = valor - icmsProjetado - pisCofinsProjetado;
    const ibsProjetado = aliquota ? baseIbsCbs * ((aliquota.ibs_estadual + aliquota.ibs_municipal) / 100) : 0;
    const cbsProjetado = aliquota ? baseIbsCbs * (aliquota.cbs / 100) : 0;
    
    return { valor, icms, pisCofins, icmsProjetado, pisCofinsProjetado, baseIbsCbs, ibsProjetado, cbsProjetado };
  }, [filteredData, aliquotaSelecionada]);

  const totaisSaidas = useMemo(() => {
    const saidas = filteredData.filter((m) => m.tipo === 'saida');
    const valor = saidas.reduce((acc, m) => acc + m.valor, 0);
    const icms = saidas.reduce((acc, m) => acc + (m.icms || 0), 0);
    const pisCofins = saidas.reduce((acc, m) => acc + m.pis + m.cofins, 0);
    
    const aliquota = aliquotaSelecionada;
    const icmsProjetado = aliquota ? icms * (1 - (aliquota.reduc_icms / 100)) : icms;
    const pisCofinsProjetado = aliquota ? pisCofins * (1 - (aliquota.reduc_piscofins / 100)) : pisCofins;
    const baseIbsCbs = valor - icmsProjetado - pisCofinsProjetado;
    const ibsProjetado = aliquota ? baseIbsCbs * ((aliquota.ibs_estadual + aliquota.ibs_municipal) / 100) : 0;
    const cbsProjetado = aliquota ? baseIbsCbs * (aliquota.cbs / 100) : 0;
    
    return { valor, icms, pisCofins, icmsProjetado, pisCofinsProjetado, baseIbsCbs, ibsProjetado, cbsProjetado };
  }, [filteredData, aliquotaSelecionada]);
  const hasFiliais = filiais.length > 0;

  const handleClearDatabase = async () => {
    if (!user?.id) return;
    
    setIsClearing(true);
    try {
      // Delete all mercadorias, energia_agua, fretes
      await supabase.from('mercadorias').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('energia_agua').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('fretes').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('import_jobs').delete().eq('user_id', user.id);
      
      // Reload data
      setAggregatedData([]);
      toast.success('Base de dados SPED limpa com sucesso!');
      setShowClearConfirm(false);
    } catch (error) {
      console.error('Error clearing database:', error);
      toast.error('Erro ao limpar base de dados');
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Painel de Mercadorias</h1>
          <p className="text-muted-foreground">Comparativo PIS+COFINS vs IBS+CBS agregado por Filial e Mês</p>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm"
            className="text-destructive border-destructive hover:bg-destructive hover:text-destructive-foreground"
            onClick={() => setShowClearConfirm(true)}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Limpar Base SPED
          </Button>
          <Button size="sm" onClick={() => setNewDialogOpen(true)} disabled={!hasFiliais}>
            <Plus className="h-4 w-4 mr-2" />
            Nova Mercadoria
          </Button>
        </div>
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
              <ArrowDownRight className="h-4 w-4" /> Total Entradas (Créditos) - Projeção {anoProjecao}
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
              <span className="text-sm text-muted-foreground">PIS+COFINS Projetado:</span>
              <span className="text-lg font-bold text-pis-cofins">{formatCurrency(totaisEntradas.pisCofinsProjetado)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Base IBS/CBS:</span>
              <span className="text-lg font-bold">{formatCurrency(totaisEntradas.baseIbsCbs)}</span>
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
              <ArrowUpRight className="h-4 w-4" /> Total Saídas (Débitos) - Projeção {anoProjecao}
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
              <span className="text-sm text-muted-foreground">PIS+COFINS Projetado:</span>
              <span className="text-lg font-bold text-pis-cofins">{formatCurrency(totaisSaidas.pisCofinsProjetado)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Base IBS/CBS:</span>
              <span className="text-lg font-bold">{formatCurrency(totaisSaidas.baseIbsCbs)}</span>
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
              {loading ? <div className="py-12 text-center text-muted-foreground">Carregando...</div> : <MercadoriasTable data={entradasAgregadas} aliquotas={aliquotas} tipo="entrada" anoProjecao={anoProjecao} />}
            </TabsContent>
            <TabsContent value="saidas" className="mt-0">
              {loading ? <div className="py-12 text-center text-muted-foreground">Carregando...</div> : <MercadoriasTable data={saidasAgregadas} aliquotas={aliquotas} tipo="saida" anoProjecao={anoProjecao} />}
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

      <AlertDialog open={showClearConfirm} onOpenChange={setShowClearConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Limpar Base Importada do SPED
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>Esta ação irá <strong>remover permanentemente</strong> todos os dados importados:</p>
              <ul className="list-disc list-inside text-sm space-y-1 mt-2">
                <li>Todas as mercadorias (entradas e saídas)</li>
                <li>Todos os registros de energia e água</li>
                <li>Todos os registros de fretes</li>
                <li>Histórico de importações</li>
              </ul>
              <p className="mt-3 text-destructive font-medium">Esta ação não pode ser desfeita!</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isClearing}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleClearDatabase}
              disabled={isClearing}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isClearing ? 'Limpando...' : 'Sim, limpar tudo'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
