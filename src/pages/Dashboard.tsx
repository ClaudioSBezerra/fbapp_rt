import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, TrendingDown, Package, Building2 } from 'lucide-react';

const stats = [
  {
    title: 'Total Entradas',
    value: 'R$ 0,00',
    description: 'PIS+COFINS acumulado',
    icon: TrendingDown,
    trend: 'neutral',
  },
  {
    title: 'Total Saídas',
    value: 'R$ 0,00',
    description: 'PIS+COFINS acumulado',
    icon: TrendingUp,
    trend: 'neutral',
  },
  {
    title: 'Mercadorias',
    value: '0',
    description: 'Registros cadastrados',
    icon: Package,
    trend: 'neutral',
  },
  {
    title: 'Empresas',
    value: '0',
    description: 'Tenants ativos',
    icon: Building2,
    trend: 'neutral',
  },
];

export default function Dashboard() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground">
          Visão geral da carga tributária atual vs projetada
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
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
            <p className="text-muted-foreground text-sm">
              Adicione mercadorias para visualizar o comparativo
            </p>
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
            <p className="text-muted-foreground text-sm">
              Importe dados EFD para visualizar a evolução
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
