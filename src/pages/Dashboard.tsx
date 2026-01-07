import { useEffect, useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Package, Truck, Zap, Building2, Loader2, TrendingUp, TrendingDown, Calendar, CalendarDays } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface TotaisCategoria {
  valor: number;
  icms: number;
  pisCofins: number;
  count: number;
}

interface Aliquota {
  ano: number;
  ibs_estadual: number;
  ibs_municipal: number;
  cbs: number;
  reduc_icms: number;
  reduc_piscofins: number;
}

interface DashboardStats {
  mercadorias: {
    entradas: TotaisCategoria;
    saidas: TotaisCategoria;
  };
  fretes: {
    entradas: TotaisCategoria;
    saidas: TotaisCategoria;
  };
  energiaAgua: {
    creditos: TotaisCategoria;
    debitos: TotaisCategoria;
  };
  totalEmpresas: number;
}

const emptyTotais: TotaisCategoria = {
  valor: 0,
  icms: 0,
  pisCofins: 0,
  count: 0,
};

const ANOS_PROJECAO = [2027, 2028, 2029, 2030, 2031, 2032, 2033];

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

function calcularTotais(
  items: { valor?: number; icms?: number; pis?: number; cofins?: number }[]
): TotaisCategoria {
  const valor = items.reduce((acc, i) => acc + (i.valor || 0), 0);
  const icms = items.reduce((acc, i) => acc + (i.icms || 0), 0);
  const pisCofins = items.reduce((acc, i) => acc + (i.pis || 0) + (i.cofins || 0), 0);

  return { valor, icms, pisCofins, count: items.length };
}

function calcularProjecoes(
  totais: TotaisCategoria,
  aliquota: Aliquota | null
) {
  const icmsProjetado = aliquota ? totais.icms * (1 - aliquota.reduc_icms / 100) : totais.icms;
  const pisCofinsProjetado = aliquota ? totais.pisCofins * (1 - aliquota.reduc_piscofins / 100) : totais.pisCofins;
  const baseIbsCbs = totais.valor - icmsProjetado - pisCofinsProjetado;
  const ibsProjetado = aliquota ? baseIbsCbs * ((aliquota.ibs_estadual + aliquota.ibs_municipal) / 100) : 0;
  const cbsProjetado = aliquota ? baseIbsCbs * (aliquota.cbs / 100) : 0;
  const totalImpostosAtuais = totais.icms + totais.pisCofins;
  const totalReforma = ibsProjetado + cbsProjetado;
  const diferencaProjetado = totalImpostosAtuais - totalReforma;
  const diferencaReal = (totais.icms + totais.pisCofins) - (icmsProjetado + pisCofinsProjetado + ibsProjetado + cbsProjetado);

  return { icmsProjetado, pisCofinsProjetado, baseIbsCbs, ibsProjetado, cbsProjetado, totalImpostosAtuais, totalReforma, diferencaProjetado, diferencaReal };
}

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    mercadorias: { entradas: { ...emptyTotais }, saidas: { ...emptyTotais } },
    fretes: { entradas: { ...emptyTotais }, saidas: { ...emptyTotais } },
    energiaAgua: { creditos: { ...emptyTotais }, debitos: { ...emptyTotais } },
    totalEmpresas: 0,
  });
  const [aliquotas, setAliquotas] = useState<Aliquota[]>([]);
  const [loading, setLoading] = useState(true);
  const [anoProjecao, setAnoProjecao] = useState<number>(2027);
  const [periodosDisponiveis, setPeriodosDisponiveis] = useState<string[]>([]);
  const [periodoSelecionado, setPeriodoSelecionado] = useState<string>('');

  // Load available periods first
  useEffect(() => {
    const loadPeriodos = async () => {
      try {
        // Get all data without filter to extract available periods
        const { data: allStats } = await supabase.rpc('get_mv_dashboard_stats');
        
        if (allStats && allStats.length > 0) {
          const periodos = [...new Set(allStats.map((s: any) => s.mes_ano))]
            .filter(Boolean)
            .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
          
          setPeriodosDisponiveis(periodos);
          
          // Default to most recent period
          if (periodos.length > 0 && !periodoSelecionado) {
            setPeriodoSelecionado(periodos[0]);
          }
        }
      } catch (error) {
        console.error('Error loading periods:', error);
      }
    };

    loadPeriodos();
  }, []);

  // Load stats when period changes
  useEffect(() => {
    if (!periodoSelecionado) return;
    
    const loadStats = async () => {
      setLoading(true);
      try {
        const [
          { data: dashboardStats },
          { data: empresas },
          { data: aliquotasData },
        ] = await Promise.all([
          supabase.rpc('get_mv_dashboard_stats', { _mes_ano: periodoSelecionado }),
          supabase.from('empresas').select('id'),
          supabase.from('aliquotas').select('ano, ibs_estadual, ibs_municipal, cbs, reduc_icms, reduc_piscofins').order('ano'),
        ]);

        if (aliquotasData) setAliquotas(aliquotasData);

        // Process aggregated data from materialized view
        const statsData = dashboardStats || [];
        
        const sumCategory = (categoria: string, subtipo: string) => {
          const items = statsData.filter((s: any) => s.categoria === categoria && s.subtipo === subtipo);
          return items.reduce((acc: any, item: any) => ({
            valor: acc.valor + (Number(item.valor) || 0),
            icms: acc.icms + (Number(item.icms) || 0),
            pisCofins: acc.pisCofins + (Number(item.pis) || 0) + (Number(item.cofins) || 0),
            count: acc.count + 1,
          }), { valor: 0, icms: 0, pisCofins: 0, count: 0 });
        };

        setStats({
          mercadorias: {
            entradas: sumCategory('mercadorias', 'entrada'),
            saidas: sumCategory('mercadorias', 'saida'),
          },
          fretes: {
            entradas: sumCategory('fretes', 'entrada'),
            saidas: sumCategory('fretes', 'saida'),
          },
          energiaAgua: {
            creditos: sumCategory('energia_agua', 'credito'),
            debitos: sumCategory('energia_agua', 'debito'),
          },
          totalEmpresas: empresas?.length || 0,
        });
      } catch (error) {
        console.error('Error loading dashboard stats:', error);
      } finally {
        setLoading(false);
      }
    };

    loadStats();
  }, [periodoSelecionado]);

  const formatPeriodo = (periodo: string) => {
    try {
      const date = parseISO(periodo);
      return format(date, 'MMMM/yyyy', { locale: ptBR });
    } catch {
      return periodo;
    }
  };

  const aliquotaSelecionada = useMemo(() => {
    return aliquotas.find((a) => a.ano === anoProjecao) || null;
  }, [aliquotas, anoProjecao]);

  // Calcular totais consolidados com projeções baseadas no ano selecionado
  const totaisConsolidados = useMemo(() => {
    const entradas = {
      valor: stats.mercadorias.entradas.valor + stats.fretes.entradas.valor + stats.energiaAgua.creditos.valor,
      icms: stats.mercadorias.entradas.icms + stats.fretes.entradas.icms + stats.energiaAgua.creditos.icms,
      pisCofins: stats.mercadorias.entradas.pisCofins + stats.fretes.entradas.pisCofins + stats.energiaAgua.creditos.pisCofins,
    };

    const saidas = {
      valor: stats.mercadorias.saidas.valor + stats.fretes.saidas.valor + stats.energiaAgua.debitos.valor,
      icms: stats.mercadorias.saidas.icms + stats.fretes.saidas.icms + stats.energiaAgua.debitos.icms,
      pisCofins: stats.mercadorias.saidas.pisCofins + stats.fretes.saidas.pisCofins + stats.energiaAgua.debitos.pisCofins,
    };

    const projEntradas = calcularProjecoes({ ...entradas, count: 0 }, aliquotaSelecionada);
    const projSaidas = calcularProjecoes({ ...saidas, count: 0 }, aliquotaSelecionada);

    return {
      entradas: { ...entradas, ...projEntradas },
      saidas: { ...saidas, ...projSaidas },
    };
  }, [stats, aliquotaSelecionada]);

  // Projeções por categoria para os cards
  const projecoesMercadorias = useMemo(() => ({
    entradas: { ...stats.mercadorias.entradas, ...calcularProjecoes(stats.mercadorias.entradas, aliquotaSelecionada) },
    saidas: { ...stats.mercadorias.saidas, ...calcularProjecoes(stats.mercadorias.saidas, aliquotaSelecionada) },
  }), [stats.mercadorias, aliquotaSelecionada]);

  const projecoesFretes = useMemo(() => ({
    entradas: { ...stats.fretes.entradas, ...calcularProjecoes(stats.fretes.entradas, aliquotaSelecionada) },
    saidas: { ...stats.fretes.saidas, ...calcularProjecoes(stats.fretes.saidas, aliquotaSelecionada) },
  }), [stats.fretes, aliquotaSelecionada]);

  const projecoesEnergia = useMemo(() => ({
    creditos: { ...stats.energiaAgua.creditos, ...calcularProjecoes(stats.energiaAgua.creditos, aliquotaSelecionada) },
    debitos: { ...stats.energiaAgua.debitos, ...calcularProjecoes(stats.energiaAgua.debitos, aliquotaSelecionada) },
  }), [stats.energiaAgua, aliquotaSelecionada]);

  // Impostos antigos projetados (saídas - entradas)
  const impostosAntigosProjetados = 
    (totaisConsolidados.saidas.icmsProjetado + totaisConsolidados.saidas.pisCofinsProjetado) - 
    (totaisConsolidados.entradas.icmsProjetado + totaisConsolidados.entradas.pisCofinsProjetado);

  // Impostos novos projetados (saídas - entradas)
  const impostosNovosProjetados = 
    (totaisConsolidados.saidas.ibsProjetado + totaisConsolidados.saidas.cbsProjetado) - 
    (totaisConsolidados.entradas.ibsProjetado + totaisConsolidados.entradas.cbsProjetado);

  // Diferença: antigos - novos (positivo = economia)
  const diferencaImposto = impostosAntigosProjetados - impostosNovosProjetados;

  // Para os cards
  const impostoAtualTotal = totaisConsolidados.saidas.icms + totaisConsolidados.saidas.pisCofins - (totaisConsolidados.entradas.icms + totaisConsolidados.entradas.pisCofins);
  const impostoProjetadoTotal = impostosAntigosProjetados + impostosNovosProjetados;

  // Dados para gráfico de evolução
  const dadosEvolucao = useMemo(() => {
    const totaisSaidas = {
      valor: stats.mercadorias.saidas.valor + stats.fretes.saidas.valor + stats.energiaAgua.debitos.valor,
      icms: stats.mercadorias.saidas.icms + stats.fretes.saidas.icms + stats.energiaAgua.debitos.icms,
      pisCofins: stats.mercadorias.saidas.pisCofins + stats.fretes.saidas.pisCofins + stats.energiaAgua.debitos.pisCofins,
    };

    const totaisEntradas = {
      valor: stats.mercadorias.entradas.valor + stats.fretes.entradas.valor + stats.energiaAgua.creditos.valor,
      icms: stats.mercadorias.entradas.icms + stats.fretes.entradas.icms + stats.energiaAgua.creditos.icms,
      pisCofins: stats.mercadorias.entradas.pisCofins + stats.fretes.entradas.pisCofins + stats.energiaAgua.creditos.pisCofins,
    };

    return ANOS_PROJECAO.map((ano) => {
      const aliq = aliquotas.find((a) => a.ano === ano);
      
      if (!aliq) {
        return {
          ano,
          icmsProjetado: totaisSaidas.icms - totaisEntradas.icms,
          ibsCbsProjetado: 0,
          total: totaisSaidas.icms - totaisEntradas.icms,
          impostoAtual: totaisSaidas.icms + totaisSaidas.pisCofins - totaisEntradas.icms - totaisEntradas.pisCofins,
        };
      }

      const icmsSaidas = totaisSaidas.icms * (1 - aliq.reduc_icms / 100);
      const pisCofinsProjetadoSaidas = totaisSaidas.pisCofins * (1 - aliq.reduc_piscofins / 100);
      const baseIbsCbsSaidas = totaisSaidas.valor - icmsSaidas - pisCofinsProjetadoSaidas;
      const ibsSaidas = baseIbsCbsSaidas * ((aliq.ibs_estadual + aliq.ibs_municipal) / 100);
      const cbsSaidas = baseIbsCbsSaidas * (aliq.cbs / 100);

      const icmsEntradas = totaisEntradas.icms * (1 - aliq.reduc_icms / 100);
      const pisCofinsProjetadoEntradas = totaisEntradas.pisCofins * (1 - aliq.reduc_piscofins / 100);
      const baseIbsCbsEntradas = totaisEntradas.valor - icmsEntradas - pisCofinsProjetadoEntradas;
      const ibsEntradas = baseIbsCbsEntradas * ((aliq.ibs_estadual + aliq.ibs_municipal) / 100);
      const cbsEntradas = baseIbsCbsEntradas * (aliq.cbs / 100);

      const icmsLiquido = icmsSaidas - icmsEntradas;
      const ibsCbsLiquido = (ibsSaidas + cbsSaidas) - (ibsEntradas + cbsEntradas);

      return {
        ano,
        icmsProjetado: icmsLiquido,
        ibsCbsProjetado: ibsCbsLiquido,
        total: icmsLiquido + ibsCbsLiquido,
        impostoAtual: totaisSaidas.icms + totaisSaidas.pisCofins - totaisEntradas.icms - totaisEntradas.pisCofins,
      };
    });
  }, [aliquotas, stats]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const TotaisCard = ({
    title,
    icon: Icon,
    totais,
    variant,
  }: {
    title: string;
    icon: React.ElementType;
    totais: TotaisCategoria & { icmsProjetado: number; pisCofinsProjetado: number; baseIbsCbs: number; ibsProjetado: number; cbsProjetado: number; totalImpostosAtuais: number; totalReforma: number; diferencaProjetado: number; diferencaReal: number };
    variant: 'entrada' | 'saida';
  }) => (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <Icon className="h-4 w-4" />
          {title}
          <span className="ml-auto text-xs">({totais.count} registros)</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5">
        <div className="flex justify-between items-center">
          <span className="text-xs text-muted-foreground">Valor (VL_DOC):</span>
          <span className="text-sm font-semibold">{formatCurrency(totais.valor)}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-xs text-muted-foreground">ICMS:</span>
          <span className="text-sm font-semibold">{formatCurrency(totais.icms)}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-xs text-muted-foreground">ICMS Projetado ({anoProjecao}):</span>
          <span className="text-sm font-semibold">{formatCurrency(totais.icmsProjetado)}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-xs text-muted-foreground">PIS+COFINS:</span>
          <span className="text-sm font-semibold text-pis-cofins">{formatCurrency(totais.pisCofins)}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-xs text-muted-foreground">PIS+COFINS Projetado ({anoProjecao}):</span>
          <span className="text-sm font-semibold text-pis-cofins">{formatCurrency(totais.pisCofinsProjetado)}</span>
        </div>
        <div className="flex justify-between items-center bg-muted/30 -mx-2 px-2 py-1 rounded">
          <span className="text-xs font-medium">Tot. Impostos Atuais:</span>
          <span className="text-sm font-bold">{formatCurrency(totais.totalImpostosAtuais)}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-xs text-muted-foreground">Base IBS/CBS:</span>
          <span className="text-sm font-semibold">{formatCurrency(totais.baseIbsCbs)}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-xs text-muted-foreground">IBS Projetado ({anoProjecao}):</span>
          <span className="text-sm font-semibold text-ibs-cbs">{formatCurrency(totais.ibsProjetado)}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-xs text-muted-foreground">CBS Projetado ({anoProjecao}):</span>
          <span className="text-sm font-semibold text-ibs-cbs">{formatCurrency(totais.cbsProjetado)}</span>
        </div>
        <div className="flex justify-between items-center bg-muted/30 -mx-2 px-2 py-1 rounded">
          <span className="text-xs font-medium text-ibs-cbs">Total Reforma:</span>
          <span className="text-sm font-bold text-ibs-cbs">{formatCurrency(totais.totalReforma)}</span>
        </div>
        <div className="flex justify-between items-center pt-2 border-t">
          <span className="text-xs text-muted-foreground">Dif. Projetado:</span>
          <span className={`text-sm font-bold ${totais.diferencaProjetado > 0 ? 'text-destructive' : totais.diferencaProjetado < 0 ? 'text-positive' : ''}`}>
            {totais.diferencaProjetado > 0 ? '+' : ''}{formatCurrency(totais.diferencaProjetado)}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-xs text-muted-foreground">Dif. Real:</span>
          <span className={`text-sm font-bold ${totais.diferencaReal > 0 ? 'text-destructive' : totais.diferencaReal < 0 ? 'text-positive' : ''}`}>
            {totais.diferencaReal > 0 ? '+' : ''}{formatCurrency(totais.diferencaReal)}
          </span>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground">
            Visão consolidada da carga tributária 
            {periodoSelecionado && ` - ${formatPeriodo(periodoSelecionado)}`}
          </p>
        </div>
        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <Label className="text-sm font-medium">Período:</Label>
            <Select value={periodoSelecionado} onValueChange={setPeriodoSelecionado}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Selecione o período" />
              </SelectTrigger>
              <SelectContent>
                {periodosDisponiveis.map((periodo) => (
                  <SelectItem key={periodo} value={periodo}>
                    {formatPeriodo(periodo)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <Label className="text-sm font-medium">Ano Projeção:</Label>
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
      </div>

      {/* Resumo Geral */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Empresas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-muted-foreground" />
              <span className="text-2xl font-bold">{stats.totalEmpresas}</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Imposto Atual (Líquido)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(impostoAtualTotal)}</div>
            <p className="text-xs text-muted-foreground">ICMS + PIS/COFINS (Débitos - Créditos)</p>
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Imposto Projetado {anoProjecao} (Líquido)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-ibs-cbs">{formatCurrency(impostoProjetadoTotal)}</div>
            <p className="text-xs text-muted-foreground">ICMS Proj + IBS + CBS (Débitos - Créditos)</p>
          </CardContent>
        </Card>

        <Card className={`border-border/50 ${diferencaImposto < 0 ? 'bg-green-500/10' : diferencaImposto > 0 ? 'bg-red-500/10' : ''}`}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Diferença {anoProjecao}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${diferencaImposto < 0 ? 'text-green-600' : diferencaImposto > 0 ? 'text-red-600' : ''}`}>
              {diferencaImposto >= 0 ? '+' : ''}{formatCurrency(diferencaImposto)}
            </div>
            <p className="text-xs text-muted-foreground">{diferencaImposto < 0 ? 'Economia projetada' : diferencaImposto > 0 ? 'Aumento projetado' : 'Sem alteração'}</p>
          </CardContent>
        </Card>
      </div>

      {/* Gráfico de Evolução */}
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Evolução da Carga Tributária Projetada (2027-2033)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={dadosEvolucao}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="ano" className="text-xs" />
              <YAxis 
                tickFormatter={(v) => {
                  if (v >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
                  if (v >= 1000) return `${(v / 1000).toFixed(0)}K`;
                  return v.toFixed(0);
                }} 
                className="text-xs"
              />
              <Tooltip 
                formatter={(v: number) => formatCurrency(v)}
                labelFormatter={(label) => `Ano: ${label}`}
                contentStyle={{ backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))' }}
              />
              <Legend />
              <Line 
                type="monotone" 
                dataKey="impostoAtual" 
                name="Imposto Atual (ICMS+PIS/COFINS)" 
                stroke="hsl(var(--muted-foreground))" 
                strokeDasharray="5 5"
                strokeWidth={2}
              />
              <Line 
                type="monotone" 
                dataKey="icmsProjetado" 
                name="ICMS Projetado" 
                stroke="hsl(220, 70%, 50%)" 
                strokeWidth={2}
              />
              <Line 
                type="monotone" 
                dataKey="ibsCbsProjetado" 
                name="IBS+CBS Projetado" 
                stroke="hsl(142, 71%, 45%)" 
                strokeWidth={2}
              />
              <Line 
                type="monotone" 
                dataKey="total" 
                name="Total Projetado" 
                stroke="hsl(24, 95%, 53%)" 
                strokeWidth={3}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Mercadorias */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
          <Package className="h-5 w-5" /> Mercadorias
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          <TotaisCard
            title="Entradas (Créditos)"
            icon={TrendingDown}
            totais={projecoesMercadorias.entradas}
            variant="entrada"
          />
          <TotaisCard
            title="Saídas (Débitos)"
            icon={TrendingUp}
            totais={projecoesMercadorias.saidas}
            variant="saida"
          />
        </div>
      </div>

      {/* Fretes */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
          <Truck className="h-5 w-5" /> Fretes
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          <TotaisCard
            title="Entradas (Créditos)"
            icon={TrendingDown}
            totais={projecoesFretes.entradas}
            variant="entrada"
          />
          <TotaisCard
            title="Saídas (Débitos)"
            icon={TrendingUp}
            totais={projecoesFretes.saidas}
            variant="saida"
          />
        </div>
      </div>

      {/* Energia/Água */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
          <Zap className="h-5 w-5" /> Energia/Água
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          <TotaisCard
            title="Créditos"
            icon={TrendingDown}
            totais={projecoesEnergia.creditos}
            variant="entrada"
          />
          <TotaisCard
            title="Débitos"
            icon={TrendingUp}
            totais={projecoesEnergia.debitos}
            variant="saida"
          />
        </div>
      </div>
    </div>
  );
}
