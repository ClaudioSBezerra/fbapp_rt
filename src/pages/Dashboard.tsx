import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Package, Truck, Zap, Building2, Loader2, TrendingUp, TrendingDown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface TotaisCategoria {
  valor: number;
  icms: number;
  icmsProjetado: number;
  pisCofins: number;
  ibsProjetado: number;
  cbsProjetado: number;
  count: number;
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
  icmsProjetado: 0,
  pisCofins: 0,
  ibsProjetado: 0,
  cbsProjetado: 0,
  count: 0,
};

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

function calcularTotais(
  items: { valor?: number; icms?: number; pis?: number; cofins?: number }[],
  aliquota: { reduc_icms: number; ibs_estadual: number; ibs_municipal: number; cbs: number } | null
): TotaisCategoria {
  const valor = items.reduce((acc, i) => acc + (i.valor || 0), 0);
  const icms = items.reduce((acc, i) => acc + (i.icms || 0), 0);
  const pisCofins = items.reduce((acc, i) => acc + (i.pis || 0) + (i.cofins || 0), 0);

  const icmsProjetado = aliquota ? icms * (1 - aliquota.reduc_icms / 100) : icms;
  const ibsProjetado = aliquota ? valor * ((aliquota.ibs_estadual + aliquota.ibs_municipal) / 100) : 0;
  const cbsProjetado = aliquota ? valor * (aliquota.cbs / 100) : 0;

  return { valor, icms, icmsProjetado, pisCofins, ibsProjetado, cbsProjetado, count: items.length };
}

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    mercadorias: { entradas: { ...emptyTotais }, saidas: { ...emptyTotais } },
    fretes: { entradas: { ...emptyTotais }, saidas: { ...emptyTotais } },
    energiaAgua: { creditos: { ...emptyTotais }, debitos: { ...emptyTotais } },
    totalEmpresas: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadStats = async () => {
      try {
        const [
          { data: mercadorias },
          { data: fretes },
          { data: energiaAgua },
          { data: empresas },
          { data: aliquotas },
        ] = await Promise.all([
          supabase.from('mercadorias').select('tipo, valor, icms, pis, cofins'),
          supabase.from('fretes').select('tipo, valor, icms, pis, cofins'),
          supabase.from('energia_agua').select('tipo_operacao, valor, icms, pis, cofins'),
          supabase.from('empresas').select('id'),
          supabase.from('aliquotas').select('*').eq('is_active', true).order('ano', { ascending: false }).limit(1),
        ]);

        const aliquota = aliquotas?.[0] || null;

        const mercadoriasEntradas = (mercadorias || []).filter((m) => m.tipo === 'entrada');
        const mercadoriasSaidas = (mercadorias || []).filter((m) => m.tipo === 'saida');

        const fretesEntradas = (fretes || []).filter((f) => f.tipo === 'entrada');
        const fretesSaidas = (fretes || []).filter((f) => f.tipo === 'saida');

        const energiaCreditos = (energiaAgua || []).filter((e) => e.tipo_operacao === 'credito');
        const energiaDebitos = (energiaAgua || []).filter((e) => e.tipo_operacao === 'debito');

        setStats({
          mercadorias: {
            entradas: calcularTotais(mercadoriasEntradas, aliquota),
            saidas: calcularTotais(mercadoriasSaidas, aliquota),
          },
          fretes: {
            entradas: calcularTotais(fretesEntradas, aliquota),
            saidas: calcularTotais(fretesSaidas, aliquota),
          },
          energiaAgua: {
            creditos: calcularTotais(energiaCreditos, aliquota),
            debitos: calcularTotais(energiaDebitos, aliquota),
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
  }, []);

  // Calcular totais consolidados
  const totaisConsolidados = {
    entradas: {
      valor: stats.mercadorias.entradas.valor + stats.fretes.entradas.valor + stats.energiaAgua.creditos.valor,
      icms: stats.mercadorias.entradas.icms + stats.fretes.entradas.icms + stats.energiaAgua.creditos.icms,
      icmsProjetado: stats.mercadorias.entradas.icmsProjetado + stats.fretes.entradas.icmsProjetado + stats.energiaAgua.creditos.icmsProjetado,
      pisCofins: stats.mercadorias.entradas.pisCofins + stats.fretes.entradas.pisCofins + stats.energiaAgua.creditos.pisCofins,
      ibsProjetado: stats.mercadorias.entradas.ibsProjetado + stats.fretes.entradas.ibsProjetado + stats.energiaAgua.creditos.ibsProjetado,
      cbsProjetado: stats.mercadorias.entradas.cbsProjetado + stats.fretes.entradas.cbsProjetado + stats.energiaAgua.creditos.cbsProjetado,
    },
    saidas: {
      valor: stats.mercadorias.saidas.valor + stats.fretes.saidas.valor + stats.energiaAgua.debitos.valor,
      icms: stats.mercadorias.saidas.icms + stats.fretes.saidas.icms + stats.energiaAgua.debitos.icms,
      icmsProjetado: stats.mercadorias.saidas.icmsProjetado + stats.fretes.saidas.icmsProjetado + stats.energiaAgua.debitos.icmsProjetado,
      pisCofins: stats.mercadorias.saidas.pisCofins + stats.fretes.saidas.pisCofins + stats.energiaAgua.debitos.pisCofins,
      ibsProjetado: stats.mercadorias.saidas.ibsProjetado + stats.fretes.saidas.ibsProjetado + stats.energiaAgua.debitos.ibsProjetado,
      cbsProjetado: stats.mercadorias.saidas.cbsProjetado + stats.fretes.saidas.cbsProjetado + stats.energiaAgua.debitos.cbsProjetado,
    },
  };

  const impostoAtualTotal = totaisConsolidados.saidas.icms + totaisConsolidados.saidas.pisCofins - (totaisConsolidados.entradas.icms + totaisConsolidados.entradas.pisCofins);
  const impostoProjetadoTotal = totaisConsolidados.saidas.icmsProjetado + totaisConsolidados.saidas.ibsProjetado + totaisConsolidados.saidas.cbsProjetado - (totaisConsolidados.entradas.icmsProjetado + totaisConsolidados.entradas.ibsProjetado + totaisConsolidados.entradas.cbsProjetado);
  const diferencaImposto = impostoProjetadoTotal - impostoAtualTotal;

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
    totais: TotaisCategoria;
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
          <span className="text-xs text-muted-foreground">ICMS Projetado:</span>
          <span className="text-sm font-semibold">{formatCurrency(totais.icmsProjetado)}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-xs text-muted-foreground">PIS+COFINS:</span>
          <span className="text-sm font-semibold text-pis-cofins">{formatCurrency(totais.pisCofins)}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-xs text-muted-foreground">IBS Projetado:</span>
          <span className="text-sm font-semibold text-ibs-cbs">{formatCurrency(totais.ibsProjetado)}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-xs text-muted-foreground">CBS Projetado:</span>
          <span className="text-sm font-semibold text-ibs-cbs">{formatCurrency(totais.cbsProjetado)}</span>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground">Visão geral consolidada da carga tributária atual vs projetada</p>
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
            <CardTitle className="text-sm font-medium text-muted-foreground">Imposto Projetado (Líquido)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-ibs-cbs">{formatCurrency(impostoProjetadoTotal)}</div>
            <p className="text-xs text-muted-foreground">ICMS Proj + IBS + CBS (Débitos - Créditos)</p>
          </CardContent>
        </Card>

        <Card className={`border-border/50 ${diferencaImposto < 0 ? 'bg-green-500/10' : diferencaImposto > 0 ? 'bg-red-500/10' : ''}`}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Diferença</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${diferencaImposto < 0 ? 'text-green-600' : diferencaImposto > 0 ? 'text-red-600' : ''}`}>
              {diferencaImposto >= 0 ? '+' : ''}{formatCurrency(diferencaImposto)}
            </div>
            <p className="text-xs text-muted-foreground">{diferencaImposto < 0 ? 'Economia projetada' : diferencaImposto > 0 ? 'Aumento projetado' : 'Sem alteração'}</p>
          </CardContent>
        </Card>
      </div>

      {/* Mercadorias */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
          <Package className="h-5 w-5" /> Mercadorias
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          <TotaisCard
            title="Entradas (Créditos)"
            icon={TrendingDown}
            totais={stats.mercadorias.entradas}
            variant="entrada"
          />
          <TotaisCard
            title="Saídas (Débitos)"
            icon={TrendingUp}
            totais={stats.mercadorias.saidas}
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
            totais={stats.fretes.entradas}
            variant="entrada"
          />
          <TotaisCard
            title="Saídas (Débitos)"
            icon={TrendingUp}
            totais={stats.fretes.saidas}
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
            totais={stats.energiaAgua.creditos}
            variant="entrada"
          />
          <TotaisCard
            title="Débitos"
            icon={TrendingUp}
            totais={stats.energiaAgua.debitos}
            variant="saida"
          />
        </div>
      </div>
    </div>
  );
}
