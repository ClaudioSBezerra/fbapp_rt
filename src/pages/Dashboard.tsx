import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer } from "recharts";
import { Loader2, TrendingDown, TrendingUp, AlertCircle, RefreshCw, DollarSign, Settings } from "lucide-react";
import { formatFilialDisplayFormatted } from "@/lib/formatFilial";


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

const ANOS_PROJECAO = [2027, 2028, 2029, 2030, 2031, 2032, 2033];

const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);

const formatCompact = (value: number) =>
  new Intl.NumberFormat("pt-BR", { notation: "compact", compactDisplay: "short" }).format(value);

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [aliquotas, setAliquotas] = useState<Aliquota[]>([]);
  const [periodosDisponiveis, setPeriodosDisponiveis] = useState<string[]>([]);
  const [periodoSelecionado, setPeriodoSelecionado] = useState<string>("");
  const [anoProjecao, setAnoProjecao] = useState<number>(2027);
  const [filiais, setFiliais] = useState<Filial[]>([]);
  const [filialSelecionada, setFilialSelecionada] = useState<string>("todas");
  const [totais, setTotais] = useState({ icms: 0, pis: 0, cofins: 0, valor: 0 });

  const [loadError, setLoadError] = useState<string | null>(null);

  // Carregar dados iniciais: períodos, filiais e alíquotas
  useEffect(() => {
    const fetchInitialData = async () => {
      console.log('[Dashboard] Iniciando fetch inicial...');
      
      let hasError = false;
      
      try {
        // Buscar períodos a partir da view materializada (muito mais leve)
        const { data: statsData, error: statsError } = await supabase.rpc('get_mv_dashboard_stats');
        
        if (statsError) {
          console.error('[Dashboard] Erro ao carregar stats iniciais:', statsError);
          hasError = true;
        }
        
        const periodosSet = new Set<string>();
        statsData?.forEach((s: { mes_ano: string | Date }) => {
          // Handle mes_ano as Date object or ISO string from database
          const mesAnoStr = typeof s.mes_ano === 'string' 
            ? s.mes_ano 
            : new Date(s.mes_ano).toISOString().slice(0, 10);
          const [year, month] = mesAnoStr.split('-').map(Number);
          if (year && month) {
            periodosSet.add(`${year}-${String(month).padStart(2, "0")}`);
          }
        });

        const periodos = Array.from(periodosSet).sort().reverse();
        setPeriodosDisponiveis(periodos);
        if (periodos.length > 0) {
          setPeriodoSelecionado(periodos[0]);
        } else {
          // Sem períodos disponíveis - parar o loading
          console.log('[Dashboard] Nenhum período disponível');
          setLoading(false);
        }
        console.log('[Dashboard] Períodos carregados:', periodos.length);
      } catch (err) {
        console.error('[Dashboard] Erro ao carregar períodos:', err);
        hasError = true;
        setLoading(false);
        setLoadError('Erro ao carregar períodos. Verifique se há dados importados.');
      }

      // Buscar filiais
      try {
        const { data: filiaisData } = await supabase.from("filiais").select("id, nome_fantasia, razao_social, cnpj, cod_est");

        const filialsList = filiaisData?.map((f) => ({
          id: f.id,
          nome: f.nome_fantasia || f.razao_social || "Sem nome",
          cnpj: f.cnpj || "",
          cod_est: f.cod_est || null,
        })) || [];
        setFiliais(filialsList);
      } catch (err) {
        console.error('[Dashboard] Erro ao carregar filiais:', err);
      }

      // Buscar alíquotas
      try {
        const { data: aliquotasData } = await supabase.from("aliquotas").select("*").eq("is_active", true).order("ano");
        setAliquotas(aliquotasData || []);
      } catch (err) {
        console.error('[Dashboard] Erro ao carregar alíquotas:', err);
      }
      
      console.log('[Dashboard] Fetch inicial concluído, hasError:', hasError);
    };

    fetchInitialData();
  }, []);

  // Carregar totais do período selecionado usando view materializada - COM TIMEOUT
  useEffect(() => {
    if (!periodoSelecionado) return;

    let isCancelled = false;
    let timeoutId: ReturnType<typeof setTimeout>;

    const fetchTotais = async () => {
      setLoading(true);
      setLoadError(null);
      
      console.log('[Dashboard] Iniciando fetchTotais para:', periodoSelecionado, filialSelecionada);

      // Timeout de 30 segundos para evitar loading infinito
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error('Timeout: consulta demorou mais de 30 segundos'));
        }, 30000);
      });

      try {
        const [ano, mes] = periodoSelecionado.split("-").map(Number);
        // Construir string diretamente para evitar conversão UTC
        const mesAno = `${ano}-${String(mes).padStart(2, '0')}-01`;
        
        console.log('[Dashboard] Chamando get_mv_dashboard_stats com:', { mesAno, filial: filialSelecionada });

        // Race entre a consulta e o timeout
        const result = await Promise.race([
          supabase.rpc('get_mv_dashboard_stats', {
            _mes_ano: mesAno,
            _filial_id: filialSelecionada !== 'todas' ? filialSelecionada : null
          }),
          timeoutPromise
        ]);

        clearTimeout(timeoutId);
        
        if (isCancelled) return;

        const { data: stats, error } = result;
        
        console.log('[Dashboard] Resultado get_mv_dashboard_stats:', { 
          hasData: !!stats, 
          count: stats?.length, 
          error 
        });

        if (error) {
          console.error('Erro ao carregar dashboard stats:', error);
          setLoadError('Erro ao carregar dados. Tente novamente.');
          setLoading(false);
          return;
        }

        // Somar apenas saídas (débitos) para exibir o volume tributário real
        let icmsTotal = 0, pisTotal = 0, cofinsTotal = 0, valorTotal = 0;

        stats?.forEach((s: { subtipo: string; icms: number; pis: number; cofins: number; valor: number }) => {
          if (s.subtipo === 'saida') {
            icmsTotal += s.icms || 0;
            pisTotal += s.pis || 0;
            cofinsTotal += s.cofins || 0;
            valorTotal += s.valor || 0;
          }
        });

        setTotais({
          icms: icmsTotal,
          pis: pisTotal,
          cofins: cofinsTotal,
          valor: valorTotal,
        });

        setLoading(false);
      } catch (err: any) {
        clearTimeout(timeoutId);
        if (isCancelled) return;
        
        console.error('[Dashboard] Erro/Timeout ao carregar totais:', err);
        setLoadError(err.message?.includes('Timeout') 
          ? 'A consulta demorou muito. As views podem estar atualizando. Tente novamente em alguns segundos.'
          : 'Erro ao carregar dados. Tente novamente.');
        setLoading(false);
      }
    };

    fetchTotais();

    return () => {
      isCancelled = true;
      clearTimeout(timeoutId);
    };
  }, [periodoSelecionado, filialSelecionada]);

  const aliquotaSelecionada = useMemo(
    () => aliquotas.find((a) => a.ano === anoProjecao),
    [aliquotas, anoProjecao]
  );

  // Dados para o gráfico de evolução
  const dadosEvolucao = useMemo(() => {
    const pisCofins = totais.pis + totais.cofins;

    return ANOS_PROJECAO.map((ano) => {
      const aliq = aliquotas.find((a) => a.ano === ano);
      if (!aliq) return { ano, icmsProjetado: 0, ibsProjetado: 0, cbsProjetado: 0, pisCofinsProjetado: 0 };

      const reducIcms = aliq.reduc_icms / 100;
      const reducPisCofins = aliq.reduc_piscofins / 100;
      const ibsTotal = aliq.ibs_estadual + aliq.ibs_municipal;

      const icmsProjetado = totais.icms * (1 - reducIcms);
      const pisCofinsProjetado = pisCofins * (1 - reducPisCofins);
      const ibsProjetado = (totais.valor * ibsTotal) / 100;
      const cbsProjetado = (totais.valor * aliq.cbs) / 100;

      return {
        ano,
        icmsProjetado,
        pisCofinsProjetado,
        ibsProjetado,
        cbsProjetado,
      };
    });
  }, [totais, aliquotas]);

  // Valores projetados para o ano selecionado
  const projecaoAno = useMemo(() => {
    return dadosEvolucao.find((d) => d.ano === anoProjecao) || {
      icmsProjetado: 0,
      ibsProjetado: 0,
      cbsProjetado: 0,
      pisCofinsProjetado: 0,
    };
  }, [dadosEvolucao, anoProjecao]);

  if (loading && !periodoSelecionado) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Handler para retry manual
  const handleRetry = () => {
    // Force re-fetch by updating a dummy state or just trigger useEffect
    setLoadError(null);
    setLoading(true);
    // Trick to re-trigger the useEffect
    setPeriodoSelecionado(prev => prev);
  };

  return (
    <div className="space-y-6">
      {/* Alerta de erro/timeout */}
      {loadError && (
        <Alert variant="destructive" className="mb-4">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="flex items-center justify-between">
            <span>{loadError}</span>
            <Button variant="outline" size="sm" onClick={handleRetry} className="ml-4">
              <RefreshCw className="h-4 w-4 mr-2" />
              Tentar novamente
            </Button>
          </AlertDescription>
        </Alert>
      )}
      
      {/* Header com filtros */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Transição tributária ICMS → IBS/CBS</p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Select value={periodoSelecionado} onValueChange={setPeriodoSelecionado}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Período" />
            </SelectTrigger>
            <SelectContent>
              {periodosDisponiveis.map((p) => (
                <SelectItem key={p} value={p}>
                  {p.split("-").reverse().join("/")}
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
              {filiais.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {formatFilialDisplayFormatted(f.cod_est, f.cnpj)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={String(anoProjecao)} onValueChange={(v) => setAnoProjecao(Number(v))}>
            <SelectTrigger className="w-[100px]">
              <SelectValue placeholder="Ano" />
            </SelectTrigger>
            <SelectContent>
              {ANOS_PROJECAO.map((ano) => (
                <SelectItem key={ano} value={String(ano)}>
                  {ano}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Alerta de alíquotas não configuradas */}
      {aliquotas.length === 0 && !loading && (
        <Alert variant="default" className="border-amber-500 bg-amber-50 dark:bg-amber-950/20">
          <Settings className="h-4 w-4 text-amber-600" />
          <AlertTitle className="text-amber-800 dark:text-amber-200">Alíquotas de transição não configuradas</AlertTitle>
          <AlertDescription className="text-amber-700 dark:text-amber-300">
            As projeções para 2027–2033 não podem ser calculadas. Configure as alíquotas na página{" "}
            <Link to="/aliquotas" className="underline font-medium hover:text-amber-900 dark:hover:text-amber-100">
              Alíquotas
            </Link>.
          </AlertDescription>
        </Alert>
      )}

      {/* Cards de base do período (dados reais) */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-muted bg-muted/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-slate-500" />
              Valor Base (Saídas)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {formatCurrency(totais.valor)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Período atual
            </p>
          </CardContent>
        </Card>

        <Card className="border-muted bg-muted/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-blue-500" />
              ICMS Base
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {formatCurrency(totais.icms)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Período atual
            </p>
          </CardContent>
        </Card>

        <Card className="border-muted bg-muted/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-purple-500" />
              PIS Base
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {formatCurrency(totais.pis)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Período atual
            </p>
          </CardContent>
        </Card>

        <Card className="border-muted bg-muted/30">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-purple-500" />
              COFINS Base
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {formatCurrency(totais.cofins)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Período atual
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Cards de projeção */}
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
              <TrendingDown className="h-4 w-4 text-purple-500" />
              PIS/COFINS Projetado {anoProjecao}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">
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
              <TrendingUp className="h-4 w-4 text-green-500" />
              IBS Projetado {anoProjecao}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
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

      {/* Gráfico de evolução */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Evolução Tributária 2027-2033</CardTitle>
          <p className="text-xs text-muted-foreground">
            ICMS em extinção gradual, IBS e CBS em ascensão
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
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
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
                  activeDot={{ r: 6 }}
                />
                <Line
                  type="monotone"
                  dataKey="ibsProjetado"
                  name="IBS"
                  stroke="hsl(142, 71%, 35%)"
                  strokeWidth={3}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                />
                <Line
                  type="monotone"
                  dataKey="cbsProjetado"
                  name="CBS"
                  stroke="hsl(25, 95%, 53%)"
                  strokeWidth={3}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
