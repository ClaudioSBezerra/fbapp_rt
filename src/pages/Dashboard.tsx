import { useEffect, useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Package, Truck, Zap, Loader2, TrendingUp, TrendingDown, Calendar, CalendarDays, AlertTriangle, Info, ChevronDown, ChevronUp } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import { AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';
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
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPercent(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value) + '%';
}

function calcularProjecoes(
  totais: TotaisCategoria,
  aliquota: Aliquota | null
) {
  const icmsProjetado = aliquota ? totais.icms * (1 - aliquota.reduc_icms / 100) : totais.icms;
  const pisCofinsProjetado = aliquota ? totais.pisCofins * (1 - aliquota.reduc_piscofins / 100) : totais.pisCofins;
  const baseIbsCbs = totais.valor - totais.icms - totais.pisCofins;
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
  const [tabelaAberta, setTabelaAberta] = useState(false);

  // Load available periods first
  useEffect(() => {
    const loadPeriodos = async () => {
      try {
        const { data: allStats } = await supabase.rpc('get_mv_dashboard_stats');
        
        if (allStats && allStats.length > 0) {
          const periodos = [...new Set(allStats.map((s: any) => s.mes_ano))]
            .filter(Boolean)
            .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
          
          setPeriodosDisponiveis(periodos);
          
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

  // Para os cards
  const impostoAtualTotal = totaisConsolidados.saidas.icms + totaisConsolidados.saidas.pisCofins - (totaisConsolidados.entradas.icms + totaisConsolidados.entradas.pisCofins);
  const impostoProjetadoTotal = impostosAntigosProjetados + impostosNovosProjetados;
  const diferencaImposto = impostoAtualTotal - impostoProjetadoTotal;
  const variacaoPercentual = impostoAtualTotal !== 0 ? ((impostoProjetadoTotal - impostoAtualTotal) / impostoAtualTotal) * 100 : 0;

  // Dados para gráfico de evolução com PIS/COFINS incluído
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

    const impostoAtualBase = totaisSaidas.icms + totaisSaidas.pisCofins - totaisEntradas.icms - totaisEntradas.pisCofins;

    return ANOS_PROJECAO.map((ano) => {
      const aliq = aliquotas.find((a) => a.ano === ano);
      
      if (!aliq) {
        return {
          ano,
          icmsProjetado: totaisSaidas.icms - totaisEntradas.icms,
          pisCofinsProjetado: totaisSaidas.pisCofins - totaisEntradas.pisCofins,
          ibsCbsProjetado: 0,
          totalReforma: totaisSaidas.icms - totaisEntradas.icms + totaisSaidas.pisCofins - totaisEntradas.pisCofins,
          impostoAtual: impostoAtualBase,
          reducaoIcms: 0,
        };
      }

      const icmsSaidas = totaisSaidas.icms * (1 - aliq.reduc_icms / 100);
      const pisCofinsProjetadoSaidas = totaisSaidas.pisCofins * (1 - aliq.reduc_piscofins / 100);
      const baseIbsCbsSaidas = totaisSaidas.valor - totaisSaidas.icms - totaisSaidas.pisCofins;
      const ibsSaidas = baseIbsCbsSaidas * ((aliq.ibs_estadual + aliq.ibs_municipal) / 100);
      const cbsSaidas = baseIbsCbsSaidas * (aliq.cbs / 100);

      const icmsEntradas = totaisEntradas.icms * (1 - aliq.reduc_icms / 100);
      const pisCofinsProjetadoEntradas = totaisEntradas.pisCofins * (1 - aliq.reduc_piscofins / 100);
      const baseIbsCbsEntradas = totaisEntradas.valor - totaisEntradas.icms - totaisEntradas.pisCofins;
      const ibsEntradas = baseIbsCbsEntradas * ((aliq.ibs_estadual + aliq.ibs_municipal) / 100);
      const cbsEntradas = baseIbsCbsEntradas * (aliq.cbs / 100);

      const icmsLiquido = icmsSaidas - icmsEntradas;
      const pisCofinsLiquido = pisCofinsProjetadoSaidas - pisCofinsProjetadoEntradas;
      const ibsCbsLiquido = (ibsSaidas + cbsSaidas) - (ibsEntradas + cbsEntradas);

      return {
        ano,
        icmsProjetado: icmsLiquido,
        pisCofinsProjetado: pisCofinsLiquido,
        ibsCbsProjetado: ibsCbsLiquido,
        totalReforma: icmsLiquido + pisCofinsLiquido + ibsCbsLiquido,
        impostoAtual: impostoAtualBase,
        reducaoIcms: aliq.reduc_icms,
      };
    });
  }, [aliquotas, stats]);

  // Encontrar ponto de inflexão (quando IBS+CBS supera ICMS projetado)
  const anoInflexao = useMemo(() => {
    return dadosEvolucao.find(d => d.ibsCbsProjetado > d.icmsProjetado)?.ano;
  }, [dadosEvolucao]);

  // Dados para o gráfico de composição empilhada
  const dadosComposicao = useMemo(() => {
    return dadosEvolucao.map(d => ({
      ano: d.ano,
      'ICMS (em extinção)': Math.max(0, d.icmsProjetado),
      'PIS/COFINS (em extinção)': Math.max(0, d.pisCofinsProjetado),
      'IBS+CBS (novos)': Math.max(0, d.ibsCbsProjetado),
    }));
  }, [dadosEvolucao]);

  // Composição percentual para o ano selecionado
  const composicaoAnoSelecionado = useMemo(() => {
    const dados = dadosEvolucao.find(d => d.ano === anoProjecao);
    if (!dados) return null;

    const total = Math.abs(dados.icmsProjetado) + Math.abs(dados.pisCofinsProjetado) + Math.abs(dados.ibsCbsProjetado);
    if (total === 0) return null;

    return {
      icms: { valor: dados.icmsProjetado, percentual: (Math.abs(dados.icmsProjetado) / total) * 100 },
      pisCofins: { valor: dados.pisCofinsProjetado, percentual: (Math.abs(dados.pisCofinsProjetado) / total) * 100 },
      ibsCbs: { valor: dados.ibsCbsProjetado, percentual: (Math.abs(dados.ibsCbsProjetado) / total) * 100 },
      total,
      reducaoIcms: dados.reducaoIcms,
    };
  }, [dadosEvolucao, anoProjecao]);

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
        <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-2">
          <Icon className="h-3.5 w-3.5" />
          {title}
          <span className="ml-auto text-[10px]">({totais.count} registros)</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        <div className="flex justify-between items-center">
          <span className="text-[10px] text-muted-foreground">Valor (VL_DOC):</span>
          <span className="text-xs font-semibold">{formatCurrency(totais.valor)}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-[10px] text-muted-foreground">ICMS:</span>
          <span className="text-xs font-semibold">{formatCurrency(totais.icms)}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-[10px] text-muted-foreground">ICMS Projetado ({anoProjecao}):</span>
          <span className="text-xs font-semibold">{formatCurrency(totais.icmsProjetado)}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-[10px] text-muted-foreground">PIS+COFINS:</span>
          <span className="text-xs font-semibold text-pis-cofins">{formatCurrency(totais.pisCofins)}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-[10px] text-muted-foreground">PIS+COFINS Projetado ({anoProjecao}):</span>
          <span className="text-xs font-semibold text-pis-cofins">{formatCurrency(totais.pisCofinsProjetado)}</span>
        </div>
        <div className="flex justify-between items-center bg-muted/30 -mx-2 px-2 py-0.5 rounded">
          <span className="text-[10px] font-medium">Tot. Impostos Atuais:</span>
          <span className="text-xs font-bold">{formatCurrency(totais.totalImpostosAtuais)}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-[10px] text-muted-foreground">Base IBS/CBS:</span>
          <span className="text-xs font-semibold">{formatCurrency(totais.baseIbsCbs)}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-[10px] text-muted-foreground">IBS Projetado ({anoProjecao}):</span>
          <span className="text-xs font-semibold text-ibs-cbs">{formatCurrency(totais.ibsProjetado)}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-[10px] text-muted-foreground">CBS Projetado ({anoProjecao}):</span>
          <span className="text-xs font-semibold text-ibs-cbs">{formatCurrency(totais.cbsProjetado)}</span>
        </div>
        <div className="flex justify-between items-center bg-muted/30 -mx-2 px-2 py-0.5 rounded">
          <span className="text-[10px] font-medium text-ibs-cbs">Total Reforma:</span>
          <span className="text-xs font-bold text-ibs-cbs">{formatCurrency(totais.totalReforma)}</span>
        </div>
        <div className="flex justify-between items-center pt-1 border-t">
          <span className="text-[10px] text-muted-foreground">Dif. deb/cred.:</span>
          <span className={`text-xs font-bold ${totais.diferencaReal < 0 ? 'text-destructive' : 'text-positive'}`}>
            {totais.diferencaReal >= 0 ? '+' : ''}{formatCurrency(totais.diferencaReal)}
          </span>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-foreground">Dashboard</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Visão consolidada da carga tributária 
            {periodoSelecionado && ` - ${formatPeriodo(periodoSelecionado)}`}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4 w-full sm:w-auto">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <CalendarDays className="h-3.5 w-3.5 text-muted-foreground hidden sm:block" />
            <Label className="text-xs font-medium whitespace-nowrap">Período:</Label>
            <Select value={periodoSelecionado} onValueChange={setPeriodoSelecionado}>
              <SelectTrigger className="w-full sm:w-[180px]">
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
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground hidden sm:block" />
            <Label className="text-xs font-medium whitespace-nowrap">Ano Projeção:</Label>
            <Select value={anoProjecao.toString()} onValueChange={(v) => setAnoProjecao(parseInt(v))}>
              <SelectTrigger className="w-full sm:w-[120px]">
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

      {/* Indicador de Ponto de Inflexão */}
      {anoInflexao && (
        <div className="flex items-center gap-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <span className="text-sm font-medium text-amber-700 dark:text-amber-400">
            Ponto de inflexão em {anoInflexao}: IBS/CBS supera ICMS
          </span>
          <Tooltip>
            <TooltipTrigger>
              <Info className="h-3.5 w-3.5 text-amber-600 cursor-help" />
            </TooltipTrigger>
            <TooltipContent side="right" className="max-w-xs">
              <p className="text-xs">A partir deste ano, os novos tributos (IBS+CBS) representam mais carga tributária que o ICMS em extinção. Momento estratégico para planejamento.</p>
            </TooltipContent>
          </Tooltip>
        </div>
      )}

      {/* Resumo Geral - Cards Melhorados */}
      <div className="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-2">
              Regime Atual
              <Tooltip>
                <TooltipTrigger>
                  <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">ICMS + PIS/COFINS líquidos (Débitos - Créditos)</p>
                </TooltipContent>
              </Tooltip>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold">{formatCurrency(impostoAtualTotal)}</div>
            <p className="text-[10px] text-muted-foreground">Carga tributária sem reforma</p>
          </CardContent>
        </Card>

        <Card className="border-border/50 border-l-4 border-l-ibs-cbs">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-2">
              Regime Reforma {anoProjecao}
              <Tooltip>
                <TooltipTrigger>
                  <Info className="h-3 w-3 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">ICMS reduzido + PIS/COFINS reduzido + IBS + CBS</p>
                  {aliquotaSelecionada && (
                    <p className="text-xs mt-1">Redução ICMS: {aliquotaSelecionada.reduc_icms}% | Redução PIS/COFINS: {aliquotaSelecionada.reduc_piscofins}%</p>
                  )}
                </TooltipContent>
              </Tooltip>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-ibs-cbs">{formatCurrency(impostoProjetadoTotal)}</div>
            <div className="flex items-center gap-1 mt-1">
              {variacaoPercentual !== 0 && (
                <Badge variant={variacaoPercentual < 0 ? "default" : "destructive"} className="text-[10px] px-1.5 py-0">
                  {variacaoPercentual > 0 ? '+' : ''}{formatPercent(variacaoPercentual)}
                </Badge>
              )}
              <span className="text-[10px] text-muted-foreground">vs regime atual</span>
            </div>
          </CardContent>
        </Card>

        <Card className={`border-border/50 ${diferencaImposto >= 0 ? 'bg-positive/10 border-l-4 border-l-positive' : 'bg-destructive/10 border-l-4 border-l-destructive'}`}>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-2">
              Impacto da Reforma {anoProjecao}
              {diferencaImposto >= 0 ? (
                <TrendingDown className="h-3.5 w-3.5 text-positive" />
              ) : (
                <TrendingUp className="h-3.5 w-3.5 text-destructive" />
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-xl font-bold ${diferencaImposto >= 0 ? 'text-positive' : 'text-destructive'}`}>
              {diferencaImposto >= 0 ? '+' : ''}{formatCurrency(diferencaImposto)}
            </div>
            <p className="text-[10px] text-muted-foreground">
              {diferencaImposto >= 0 ? 'Economia projetada' : 'Custo adicional projetado'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Card de Composição Tributária */}
      {composicaoAnoSelecionado && (
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              Composição Tributária em {anoProjecao}
              <Badge variant="outline" className="text-[10px]">
                Redução ICMS: {composicaoAnoSelecionado.reducaoIcms}%
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-[hsl(220,70%,50%)]" />
                  <span>ICMS (em extinção)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{formatCurrency(composicaoAnoSelecionado.icms.valor)}</span>
                  <span className="text-muted-foreground w-12 text-right">{formatPercent(composicaoAnoSelecionado.icms.percentual)}</span>
                </div>
              </div>
              <Progress value={composicaoAnoSelecionado.icms.percentual} className="h-2 [&>div]:bg-[hsl(220,70%,50%)]" />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-[hsl(280,60%,50%)]" />
                  <span>PIS/COFINS (em extinção)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{formatCurrency(composicaoAnoSelecionado.pisCofins.valor)}</span>
                  <span className="text-muted-foreground w-12 text-right">{formatPercent(composicaoAnoSelecionado.pisCofins.percentual)}</span>
                </div>
              </div>
              <Progress value={composicaoAnoSelecionado.pisCofins.percentual} className="h-2 [&>div]:bg-[hsl(280,60%,50%)]" />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-[hsl(142,71%,45%)]" />
                  <span>IBS + CBS (novos)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{formatCurrency(composicaoAnoSelecionado.ibsCbs.valor)}</span>
                  <span className="text-muted-foreground w-12 text-right">{formatPercent(composicaoAnoSelecionado.ibsCbs.percentual)}</span>
                </div>
              </div>
              <Progress value={composicaoAnoSelecionado.ibsCbs.percentual} className="h-2 [&>div]:bg-[hsl(142,71%,45%)]" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Gráfico de Área Empilhada - Transição Tributária */}
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            Transição Tributária: Extinção do ICMS/PIS/COFINS → IBS/CBS
          </CardTitle>
          <p className="text-xs text-muted-foreground">Visualização da substituição gradual dos tributos de 2027 a 2033</p>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={dadosComposicao}>
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
              <RechartsTooltip 
                formatter={(v: number, name: string) => [formatCurrency(v), name]}
                labelFormatter={(label) => `Ano: ${label}`}
                contentStyle={{ backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))' }}
              />
              <Legend />
              <Area 
                type="monotone" 
                dataKey="ICMS (em extinção)" 
                stackId="1"
                fill="hsl(220, 70%, 50%)" 
                stroke="hsl(220, 70%, 40%)"
                fillOpacity={0.8}
              />
              <Area 
                type="monotone" 
                dataKey="PIS/COFINS (em extinção)" 
                stackId="1"
                fill="hsl(280, 60%, 50%)" 
                stroke="hsl(280, 60%, 40%)"
                fillOpacity={0.8}
              />
              <Area 
                type="monotone" 
                dataKey="IBS+CBS (novos)" 
                stackId="1"
                fill="hsl(142, 71%, 45%)" 
                stroke="hsl(142, 71%, 35%)"
                fillOpacity={0.8}
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Gráfico de Linhas - Evolução Detalhada */}
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            Evolução da Carga Tributária Total
          </CardTitle>
          <p className="text-xs text-muted-foreground">Comparativo entre regime atual (linha tracejada) e projeção da reforma</p>
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
              <RechartsTooltip 
                formatter={(v: number) => formatCurrency(v)}
                labelFormatter={(label) => `Ano: ${label}`}
                contentStyle={{ backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))' }}
              />
              <Legend />
              {anoInflexao && (
                <ReferenceLine 
                  x={anoInflexao} 
                  stroke="hsl(var(--warning))" 
                  strokeDasharray="3 3"
                  label={{ value: 'Inflexão', position: 'top', fontSize: 10 }}
                />
              )}
              <Line 
                type="monotone" 
                dataKey="impostoAtual" 
                name="Regime Atual" 
                stroke="hsl(var(--muted-foreground))" 
                strokeDasharray="5 5"
                strokeWidth={2}
                dot={false}
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
                dataKey="pisCofinsProjetado" 
                name="PIS/COFINS Projetado" 
                stroke="hsl(280, 60%, 50%)" 
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
                dataKey="totalReforma" 
                name="Total Reforma" 
                stroke="hsl(24, 95%, 53%)" 
                strokeWidth={3}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Tabela Comparativa Expandível */}
      <Collapsible open={tabelaAberta} onOpenChange={setTabelaAberta}>
        <Card className="border-border/50">
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <CardTitle className="text-sm font-semibold flex items-center justify-between">
                <span className="flex items-center gap-2">
                  Tabela Comparativa por Ano
                </span>
                {tabelaAberta ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </CardTitle>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Ano</TableHead>
                      <TableHead className="text-xs text-right">Redução ICMS</TableHead>
                      <TableHead className="text-xs text-right">ICMS Proj.</TableHead>
                      <TableHead className="text-xs text-right">PIS/COFINS Proj.</TableHead>
                      <TableHead className="text-xs text-right">IBS+CBS</TableHead>
                      <TableHead className="text-xs text-right">Total Reforma</TableHead>
                      <TableHead className="text-xs text-right">vs Atual</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dadosEvolucao.map((dados) => {
                      const diferenca = dados.impostoAtual - dados.totalReforma;
                      const variacaoPct = dados.impostoAtual !== 0 
                        ? ((dados.totalReforma - dados.impostoAtual) / dados.impostoAtual) * 100 
                        : 0;
                      return (
                        <TableRow key={dados.ano} className={dados.ano === anoProjecao ? 'bg-muted/30' : ''}>
                          <TableCell className="text-xs font-medium">
                            {dados.ano}
                            {dados.ano === anoInflexao && (
                              <Badge variant="outline" className="ml-2 text-[9px] px-1">Inflexão</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-right">{dados.reducaoIcms}%</TableCell>
                          <TableCell className="text-xs text-right">{formatCurrency(dados.icmsProjetado)}</TableCell>
                          <TableCell className="text-xs text-right">{formatCurrency(dados.pisCofinsProjetado)}</TableCell>
                          <TableCell className="text-xs text-right text-ibs-cbs">{formatCurrency(dados.ibsCbsProjetado)}</TableCell>
                          <TableCell className="text-xs text-right font-semibold">{formatCurrency(dados.totalReforma)}</TableCell>
                          <TableCell className={`text-xs text-right font-semibold ${diferenca >= 0 ? 'text-positive' : 'text-destructive'}`}>
                            {diferenca >= 0 ? '+' : ''}{formatPercent(variacaoPct * -1)}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Mercadorias */}
      <div>
        <h2 className="text-base font-semibold text-foreground mb-3 flex items-center gap-2">
          <Package className="h-4 w-4" /> Mercadorias
        </h2>
        <div className="grid gap-3 sm:gap-4 grid-cols-1 md:grid-cols-2">
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
        <h2 className="text-base font-semibold text-foreground mb-3 flex items-center gap-2">
          <Truck className="h-4 w-4" /> Fretes
        </h2>
        <div className="grid gap-3 sm:gap-4 grid-cols-1 md:grid-cols-2">
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
        <h2 className="text-base font-semibold text-foreground mb-3 flex items-center gap-2">
          <Zap className="h-4 w-4" /> Energia/Água
        </h2>
        <div className="grid gap-3 sm:gap-4 grid-cols-1 md:grid-cols-2">
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
