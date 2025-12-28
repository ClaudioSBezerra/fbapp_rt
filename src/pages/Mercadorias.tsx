import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Plus, Download, Upload, ArrowUpRight, ArrowDownRight } from 'lucide-react';
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
  tenant_id: string;
}

interface Aliquota {
  ano: number;
  ibs_estadual: number;
  ibs_municipal: number;
  cbs: number;
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

function calculateIbsCbs(valor: number, aliquota: Aliquota | null): number {
  if (!aliquota) return 0;
  const totalAliquota = (aliquota.ibs_estadual + aliquota.ibs_municipal + aliquota.cbs) / 100;
  return valor * totalAliquota;
}

interface MercadoriasTableProps {
  mercadorias: Mercadoria[];
  aliquotas: Aliquota[];
  tipo: 'entrada' | 'saida';
}

function MercadoriasTable({ mercadorias, aliquotas, tipo }: MercadoriasTableProps) {
  const filtered = mercadorias.filter((m) => m.tipo === tipo);
  const currentYear = new Date().getFullYear();
  const aliquotaAtual = aliquotas.find((a) => a.ano === currentYear) || aliquotas[0];

  if (filtered.length === 0) {
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
            <TableHead>Mês/Ano</TableHead>
            <TableHead>NCM</TableHead>
            <TableHead>Descrição</TableHead>
            <TableHead className="text-right">Valor</TableHead>
            <TableHead className="text-right text-pis-cofins">PIS+COFINS</TableHead>
            <TableHead className="text-right text-ibs-cbs">IBS+CBS</TableHead>
            <TableHead className="text-right">Diferença</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((m) => {
            const pisCofins = m.pis + m.cofins;
            const ibsCbs = calculateIbsCbs(m.valor, aliquotaAtual);
            const diferenca = ibsCbs - pisCofins;

            return (
              <TableRow key={m.id}>
                <TableCell>{formatDate(m.mes_ano)}</TableCell>
                <TableCell>
                  <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                    {m.ncm || '-'}
                  </code>
                </TableCell>
                <TableCell className="max-w-[200px] truncate">
                  {m.descricao || '-'}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {formatCurrency(m.valor)}
                </TableCell>
                <TableCell className="text-right font-mono text-pis-cofins">
                  {formatCurrency(pisCofins)}
                </TableCell>
                <TableCell className="text-right font-mono text-ibs-cbs">
                  {formatCurrency(ibsCbs)}
                </TableCell>
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
}

export default function Mercadorias() {
  const [mercadorias, setMercadorias] = useState<Mercadoria[]>([]);
  const [aliquotas, setAliquotas] = useState<Aliquota[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  useEffect(() => {
    async function fetchData() {
      try {
        // Fetch aliquotas (public access)
        const { data: aliquotasData } = await supabase
          .from('aliquotas')
          .select('ano, ibs_estadual, ibs_municipal, cbs')
          .order('ano');

        if (aliquotasData) {
          setAliquotas(aliquotasData);
        }

        // Fetch mercadorias (RLS filtered)
        const { data: mercadoriasData } = await supabase
          .from('mercadorias')
          .select('*')
          .order('mes_ano', { ascending: false });

        if (mercadoriasData) {
          setMercadorias(mercadoriasData);
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

  const totalEntradas = mercadorias
    .filter((m) => m.tipo === 'entrada')
    .reduce((acc, m) => acc + m.pis + m.cofins, 0);

  const totalSaidas = mercadorias
    .filter((m) => m.tipo === 'saida')
    .reduce((acc, m) => acc + m.pis + m.cofins, 0);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Painel de Mercadorias</h1>
          <p className="text-muted-foreground">
            Comparativo PIS+COFINS vs IBS+CBS por operação
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            <Upload className="h-4 w-4 mr-2" />
            Importar EFD
          </Button>
          <Button size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Nova Mercadoria
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <ArrowDownRight className="h-4 w-4" />
              Total Entradas (Créditos)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-pis-cofins">
              {formatCurrency(totalEntradas)}
            </p>
            <p className="text-xs text-muted-foreground">PIS+COFINS acumulado</p>
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <ArrowUpRight className="h-4 w-4" />
              Total Saídas (Débitos)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-pis-cofins">
              {formatCurrency(totalSaidas)}
            </p>
            <p className="text-xs text-muted-foreground">PIS+COFINS acumulado</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/50">
        <Tabs defaultValue="entradas" className="w-full">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Operações</CardTitle>
                <CardDescription>
                  Visualize entradas e saídas com comparativo tributário
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
                <div className="py-12 text-center text-muted-foreground">
                  Carregando...
                </div>
              ) : (
                <MercadoriasTable
                  mercadorias={mercadorias}
                  aliquotas={aliquotas}
                  tipo="entrada"
                />
              )}
            </TabsContent>
            <TabsContent value="saidas" className="mt-0">
              {loading ? (
                <div className="py-12 text-center text-muted-foreground">
                  Carregando...
                </div>
              ) : (
                <MercadoriasTable
                  mercadorias={mercadorias}
                  aliquotas={aliquotas}
                  tipo="saida"
                />
              )}
            </TabsContent>
          </CardContent>
        </Tabs>
      </Card>
    </div>
  );
}
