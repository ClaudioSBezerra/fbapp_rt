import { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { Loader2, TrendingDown, TrendingUp, AlertCircle, RefreshCw, Settings, Package, Wrench } from 'lucide-react';
import { formatFilialDisplayFormatted } from '@/lib/formatFilial';

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
  nome: string;
  cnpj: string;
  cod_est: string | null;
}

interface AggregatedRow {
  filial_id: string;
  filial_nome: string;
  cfop: string;
  tipo_operacao: string;
  mes_ano: string;
  valor: number;
  icms: number;
  pis: number;
  cofins: number;
  participante_nome: string;
  participante_cnpj: string;
}

const ANOS_PROJECAO = [2027, 2028, 2029, 2030, 2031, 2032, 2033];

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

const formatCompact = (value: number) =>
  new Intl.NumberFormat('pt-BR', { notation: 'compact', compactDisplay: 'short' }).format(value);

export default function DashboardUsoConsumo() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AggregatedRow[]>([]);
  const [aliquotas, setAliquotas] = useState<Aliquota[]>([]);
  const [filiais, setFiliais] = useState<Filial[]>([]);
  const [periodosDisponiveis, setPeriodosDisponiveis] = useState<string[]>([]);
  const [periodoSelecionado, setPeriodoSelecionado] = useState<string>('');
  const [filialSelecionada, setFilialSelecionada] = useState<string>('todas');
  const [participanteSelecionado, setParticipanteSelecionado] = useState<string>('todos');
  const [anoProjecao, setAnoProjecao] = useState<number>(2027);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Carregar dados iniciais
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setLoadError(null);

      try {
        // Carregar dados agregados
        const { data: aggregatedData, error: aggError } = await supabase.rpc('get_mv_uso_consumo_aggregated' as any);
        
        if (aggError) {
          console.error('Error fetching data:', aggError);
          setLoadError('Erro ao carregar dados. Verifique se há dados importados.');
          setData([]);
        } else {
          const formattedData = (aggregatedData || []).map((row: any) => ({
            ...row,
            mes_ano: typeof row.mes_ano === 'string' ? row.mes_ano : new Date(row.mes_ano).toISOString().slice(0, 10),
          }));
          setData(formattedData);
          
          // Extrair períodos únicos
          const periodos = [...new Set(formattedData.map((r: AggregatedRow) => r.mes_ano.substring(0, 7)))].sort().reverse() as string[];
          setPeriodosDisponiveis(periodos);
          if (periodos.length > 0) {
            setPeriodoSelecionado(periodos[0] as string);
          }
        }

        // Carregar filiais
        const { data: filiaisData } = await supabase.from('filiais').select('id, nome_fantasia, razao_social, cnpj, cod_est');
        setFiliais(filiaisData?.map(f => ({
          id: f.id,
          nome: f.nome_fantasia || f.razao_social || 'Sem nome',
          cnpj: f.cnpj || '',
          cod_est: f.cod_est || null,
        })) || []);

        // Carregar alíquotas
        const { data: aliquotasData } = await supabase.from('aliquotas').select('*').eq('is_active', true).order('ano');
        setAliquotas(aliquotasData || []);
      } catch (err) {
        console.error('Error loading data:', err);
        setLoadError('Erro ao carregar dados.');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Filtrar dados pelo período, filial e participante
  const dadosFiltrados = useMemo(() => {
    return data.filter(row => {
      if (periodoSelecionado && !row.mes_ano.startsWith(periodoSelecionado)) return false;
      if (filialSelecionada !== 'todas' && row.filial_id !== filialSelecionada) return false;
      if (participanteSelecionado !== 'todos' && row.participante_nome !== participanteSelecionado) return false;
      return true;
    });
  }, [data, periodoSelecionado, filialSelecionada, participanteSelecionado]);

  // Extrair lista de participantes únicos
  const participantesUnicos = useMemo(() => {
    const parts = new Set(data.map(r => r.participante_nome).filter(Boolean));
    return Array.from(parts).sort();
  }, [data]);

  // Calcular totais
  const totais = useMemo(() => {
    const result = {
      imobilizado: { valor: 0, icms: 0, pis: 0, cofins: 0 },
      usoConsumo: { valor: 0, icms: 0, pis: 0, cofins: 0 },
    };

    dadosFiltrados.forEach(r => {
      if (r.tipo_operacao === 'imobilizado') {
        result.imobilizado.valor += r.valor;
        result.imobilizado.icms += r.icms;
        result.imobilizado.pis += r.pis;
        result.imobilizado.cofins += r.cofins;
      } else {
        result.usoConsumo.valor += r.valor;
        result.usoConsumo.icms += r.icms;
        result.usoConsumo.pis += r.pis;
        result.usoConsumo.cofins += r.cofins;
      }
    });

    return {
      ...result,
      total: {
        valor: result.imobilizado.valor + result.usoConsumo.valor,
        icms: result.imobilizado.icms + result.usoConsumo.icms,
        pis: result.imobilizado.pis + result.usoConsumo.pis,
        cofins: result.imobilizado.cofins + result.usoConsumo.cofins,
      }
    };
  }, [dadosFiltrados]);

  // Alíquota selecionada
  const aliquotaSelecionada = useMemo(
    () => aliquotas.find(a => a.ano === anoProjecao),
    [aliquotas, anoProjecao]
  );

  // Dados de evolução 2027-2033
  const dadosEvolucao = useMemo(() => {
    const pisCofins = totais.total.pis + totais.total.cofins;

    return ANOS_PROJECAO.map(ano => {
      const aliq = aliquotas.find(a => a.ano === ano);
      if (!aliq) return { ano, icmsProjetado: 0, ibsProjetado: 0, cbsProjetado: 0, pisCofinsProjetado: 0 };

      const reducIcms = aliq.reduc_icms / 100;
      const reducPisCofins = aliq.reduc_piscofins / 100;
      const ibsTotal = aliq.ibs_estadual + aliq.ibs_municipal;

      return {
        ano,
        icmsProjetado: totais.total.icms * (1 - reducIcms),
        pisCofinsProjetado: pisCofins * (1 - reducPisCofins),
        ibsProjetado: (totais.total.valor * ibsTotal) / 100,
        cbsProjetado: (totais.total.valor * aliq.cbs) / 100,
      };
    });
  }, [totais, aliquotas]);

  // Projeção para o ano selecionado
  const projecaoAno = useMemo(() => {
    return dadosEvolucao.find(d => d.ano === anoProjecao) || {
      icmsProjetado: 0,
      ibsProjetado: 0,
      cbsProjetado: 0,
      pisCofinsProjetado: 0,
    };
  }, [dadosEvolucao, anoProjecao]);

  // Dados para gráfico de barras comparativo
  const dadosComparativo = useMemo(() => [
    {
      name: 'Ativo Imobilizado',
      valor: totais.imobilizado.valor,
      icms: totais.imobilizado.icms,
      pisCofins: totais.imobilizado.pis + totais.imobilizado.cofins,
    },
    {
      name: 'Uso e Consumo',
      valor: totais.usoConsumo.valor,
      icms: totais.usoConsumo.icms,
      pisCofins: totais.usoConsumo.pis + totais.usoConsumo.cofins,
    },
  ], [totais]);

  if (loading && !periodoSelecionado) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Alerta de erro */}
      {loadError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard Uso Consumo</h1>
          <p className="text-sm text-muted-foreground">Transição tributária para Uso e Consumo / Imobilizado</p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Select value={periodoSelecionado} onValueChange={setPeriodoSelecionado}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Período" />
            </SelectTrigger>
            <SelectContent>
              {periodosDisponiveis.map(p => (
                <SelectItem key={p} value={p}>
                  {p.split('-').reverse().join('/')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filialSelecionada} onValueChange={setFilialSelecionada}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Filial" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as filiais</SelectItem>
              {filiais.map(f => (
                <SelectItem key={f.id} value={f.id}>
                  {formatFilialDisplayFormatted(f.cod_est, f.cnpj)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={participanteSelecionado} onValueChange={setParticipanteSelecionado}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Participante" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os participantes</SelectItem>
              {participantesUnicos.map(p => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={String(anoProjecao)} onValueChange={v => setAnoProjecao(Number(v))}>
            <SelectTrigger className="w-[100px]">
              <SelectValue placeholder="Ano" />
            </SelectTrigger>
            <SelectContent>
              {ANOS_PROJECAO.map(ano => (
                <SelectItem key={ano} value={String(ano)}>{ano}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Alerta sem alíquotas */}
      {aliquotas.length === 0 && !loading && (
        <Alert variant="default" className="border-amber-500 bg-amber-50 dark:bg-amber-950/20">
          <Settings className="h-4 w-4 text-amber-600" />
          <AlertTitle className="text-amber-800 dark:text-amber-200">Alíquotas não configuradas</AlertTitle>
          <AlertDescription className="text-amber-700 dark:text-amber-300">
            Configure as alíquotas na página{' '}
            <Link to="/aliquotas" className="underline font-medium">Alíquotas</Link>.
          </AlertDescription>
        </Alert>
      )}

      {/* Cards de Projeção */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-blue-500" />
              ICMS Projetado {anoProjecao}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {formatCurrency(projecaoAno.icmsProjetado)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Redução: {aliquotaSelecionada?.reduc_icms || 0}%
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-green-500" />
              PIS/COFINS Projetado {anoProjecao}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(projecaoAno.pisCofinsProjetado)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Redução: {aliquotaSelecionada?.reduc_piscofins || 0}%
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-purple-500" />
              IBS Projetado {anoProjecao}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">
              {formatCurrency(projecaoAno.ibsProjetado)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Alíquota: {((aliquotaSelecionada?.ibs_estadual || 0) + (aliquotaSelecionada?.ibs_municipal || 0)).toFixed(2)}%
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-orange-500" />
              CBS Projetado {anoProjecao}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {formatCurrency(projecaoAno.cbsProjetado)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Alíquota: {aliquotaSelecionada?.cbs || 0}%
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Cards por tipo */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Wrench className="h-5 w-5 text-blue-500" />
              Ativo Imobilizado
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Valor Total:</span>
              <span className="font-semibold">{formatCurrency(totais.imobilizado.valor)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">ICMS:</span>
              <span>{formatCurrency(totais.imobilizado.icms)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">PIS+COFINS:</span>
              <span>{formatCurrency(totais.imobilizado.pis + totais.imobilizado.cofins)}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Package className="h-5 w-5 text-green-500" />
              Uso e Consumo
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Valor Total:</span>
              <span className="font-semibold">{formatCurrency(totais.usoConsumo.valor)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">ICMS:</span>
              <span>{formatCurrency(totais.usoConsumo.icms)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">PIS+COFINS:</span>
              <span>{formatCurrency(totais.usoConsumo.pis + totais.usoConsumo.cofins)}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Gráfico de Evolução */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Evolução Tributária 2027-2033</CardTitle>
          <p className="text-xs text-muted-foreground">
            Projeção da transição de ICMS/PIS/COFINS para IBS/CBS
          </p>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center h-[350px]">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={350}>
              <LineChart data={dadosEvolucao} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="ano" className="text-xs" />
                <YAxis tickFormatter={formatCompact} className="text-xs" />
                <RechartsTooltip
                  formatter={(value: number) => formatCurrency(value)}
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="icmsProjetado"
                  name="ICMS"
                  stroke="hsl(220, 70%, 50%)"
                  strokeWidth={3}
                  dot={{ r: 4 }}
                />
                <Line
                  type="monotone"
                  dataKey="ibsProjetado"
                  name="IBS"
                  stroke="hsl(280, 65%, 50%)"
                  strokeWidth={3}
                  dot={{ r: 4 }}
                />
                <Line
                  type="monotone"
                  dataKey="cbsProjetado"
                  name="CBS"
                  stroke="hsl(25, 95%, 53%)"
                  strokeWidth={3}
                  dot={{ r: 4 }}
                />
                <Line
                  type="monotone"
                  dataKey="pisCofinsProjetado"
                  name="PIS/COFINS"
                  stroke="hsl(142, 76%, 36%)"
                  strokeWidth={3}
                  dot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Gráfico Comparativo */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Comparativo por Tipo</CardTitle>
          <p className="text-xs text-muted-foreground">
            Imobilizado vs Uso e Consumo
          </p>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={dadosComparativo} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="name" className="text-xs" />
              <YAxis tickFormatter={formatCompact} className="text-xs" />
              <RechartsTooltip
                formatter={(value: number) => formatCurrency(value)}
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                }}
              />
              <Legend />
              <Bar dataKey="valor" name="Valor" fill="hsl(220, 70%, 50%)" />
              <Bar dataKey="icms" name="ICMS" fill="hsl(280, 65%, 50%)" />
              <Bar dataKey="pisCofins" name="PIS+COFINS" fill="hsl(142, 76%, 36%)" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
