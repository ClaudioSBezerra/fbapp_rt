import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, TrendingDown, Package, Building2, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface DashboardStats {
  totalEntradas: number;
  totalSaidas: number;
  totalMercadorias: number;
  totalEmpresas: number;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

export default function Dashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    totalEntradas: 0,
    totalSaidas: 0,
    totalMercadorias: 0,
    totalEmpresas: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadStats = async () => {
      try {
        // Fetch mercadorias to calculate PIS+COFINS totals
        const { data: mercadorias } = await supabase
          .from('mercadorias')
          .select('tipo, pis, cofins');

        // Fetch empresas count
        const { data: empresas } = await supabase
          .from('empresas')
          .select('id');

        if (mercadorias) {
          const entradas = mercadorias
            .filter(m => m.tipo === 'entrada')
            .reduce((acc, m) => acc + (m.pis || 0) + (m.cofins || 0), 0);

          const saidas = mercadorias
            .filter(m => m.tipo === 'saida')
            .reduce((acc, m) => acc + (m.pis || 0) + (m.cofins || 0), 0);

          setStats({
            totalEntradas: entradas,
            totalSaidas: saidas,
            totalMercadorias: mercadorias.length,
            totalEmpresas: empresas?.length || 0,
          });
        }
      } catch (error) {
        console.error('Error loading dashboard stats:', error);
      } finally {
        setLoading(false);
      }
    };

    loadStats();
  }, []);

  const statsCards = [
    {
      title: 'Total Entradas',
      value: formatCurrency(stats.totalEntradas),
      description: 'PIS+COFINS acumulado',
      icon: TrendingDown,
      trend: stats.totalEntradas > 0 ? 'up' : 'neutral',
    },
    {
      title: 'Total Saídas',
      value: formatCurrency(stats.totalSaidas),
      description: 'PIS+COFINS acumulado',
      icon: TrendingUp,
      trend: stats.totalSaidas > 0 ? 'up' : 'neutral',
    },
    {
      title: 'Mercadorias',
      value: stats.totalMercadorias.toLocaleString('pt-BR'),
      description: 'Registros cadastrados',
      icon: Package,
      trend: stats.totalMercadorias > 0 ? 'up' : 'neutral',
    },
    {
      title: 'Empresas',
      value: stats.totalEmpresas.toLocaleString('pt-BR'),
      description: 'Empresas ativas',
      icon: Building2,
      trend: stats.totalEmpresas > 0 ? 'up' : 'neutral',
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground">
          Visão geral da carga tributária atual vs projetada
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statsCards.map((stat) => (
          <Card key={stat.title} className="border-border/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <stat.icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">{stat.value}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {stat.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle>Comparativo Tributário</CardTitle>
            <CardDescription>
              PIS+COFINS (Atual) vs IBS+CBS (Projetado)
            </CardDescription>
          </CardHeader>
          <CardContent className="h-64 flex items-center justify-center">
            {stats.totalMercadorias > 0 ? (
              <p className="text-muted-foreground text-sm">
                {stats.totalMercadorias} mercadorias importadas. Visualize os dados completos no painel de Mercadorias.
              </p>
            ) : (
              <p className="text-muted-foreground text-sm">
                Adicione mercadorias para visualizar o comparativo
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardHeader>
            <CardTitle>Evolução Mensal</CardTitle>
            <CardDescription>
              Variação da carga tributária ao longo do tempo
            </CardDescription>
          </CardHeader>
          <CardContent className="h-64 flex items-center justify-center">
            {stats.totalMercadorias > 0 ? (
              <p className="text-muted-foreground text-sm">
                Dados disponíveis. Visualize a evolução no painel de Mercadorias.
              </p>
            ) : (
              <p className="text-muted-foreground text-sm">
                Importe dados EFD para visualizar a evolução
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
