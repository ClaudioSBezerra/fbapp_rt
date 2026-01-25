import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Filter, Download, TrendingUp, TrendingDown, DollarSign } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from 'recharts';

interface Aliquota {
  ano: number;
  ibs_estadual: number;
  ibs_municipal: number;
  cbs: number;
  reduc_icms: number;
  reduc_piscofins: number;
}

interface AggregatedRow {
  filial_id: string;
  mes_ano: string;
  valor: number;
  pis: number;
  cofins: number;
  icms: number;
  tipo: string; // 'entrada' | 'saida'
}

interface TaxSummary {
  name: string;
  debits: number; // Saídas
  credits: number; // Entradas
  result: number; // Débitos - Créditos
  color: string;
}

const formatCurrency = (value: number) => 
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

export default function PrevisaoApuracao() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AggregatedRow[]>([]);
  const [aliquotas, setAliquotas] = useState<Aliquota[]>([]);
  const [anosDisponiveis, setAnosDisponiveis] = useState<string[]>([]);
  
  // Filters
  const [selectedYear, setSelectedYear] = useState<string>(new Date().getFullYear().toString());
  const [anoProjecao, setAnoProjecao] = useState<number>(2027);
  const ANOS_PROJECAO = [2027, 2028, 2029, 2030, 2031, 2032, 2033];

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Fetch Aliquotas
      const { data: aliquotasData } = await supabase
        .from('aliquotas')
        .select('*')
        .order('ano');
      if (aliquotasData) setAliquotas(aliquotasData);

      // Fetch Aggregated Data
      const { data: result, error } = await supabase.rpc('get_mv_mercadorias_aggregated');
      
      if (error) throw error;

      if (result) {
        const formattedData: AggregatedRow[] = result.map((item: any) => ({
          filial_id: item.filial_id,
          mes_ano: item.mes_ano,
          valor: Number(item.valor) || 0,
          pis: Number(item.pis) || 0,
          cofins: Number(item.cofins) || 0,
          icms: Number(item.icms) || 0,
          tipo: item.tipo,
        }));
        setData(formattedData);

        // Extract available years from data
        const years = Array.from(new Set(formattedData.map(d => d.mes_ano.split('-')[0]))).sort().reverse();
        setAnosDisponiveis(years);
        if (years.length > 0 && !years.includes(selectedYear)) {
          setSelectedYear(years[0]);
        }
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Erro ao carregar dados de apuração');
    } finally {
      setLoading(false);
    }
  };

  const summary = useMemo(() => {
    const filteredData = data.filter(d => d.mes_ano.startsWith(selectedYear));
    const aliquota = aliquotas.find(a => a.ano === anoProjecao);

    // Initialize sums
    let sums = {
      icms: { debits: 0, credits: 0 },
      pis: { debits: 0, credits: 0 },
      cofins: { debits: 0, credits: 0 },
      icmsProj: { debits: 0, credits: 0 },
      pisProj: { debits: 0, credits: 0 },
      cofinsProj: { debits: 0, credits: 0 },
      ibs: { debits: 0, credits: 0 },
      cbs: { debits: 0, credits: 0 },
    };

    filteredData.forEach(row => {
      const isDebit = row.tipo === 'saida'; // Saída = Débito
      const target = isDebit ? 'debits' : 'credits';

      // Current Taxes
      sums.icms[target] += row.icms;
      sums.pis[target] += row.pis;
      sums.cofins[target] += row.cofins;

      // Projected Calculation
      if (aliquota) {
        // Reductions
        const icmsProj = row.icms * (1 - (aliquota.reduc_icms / 100));
        const pisProj = row.pis * (1 - (aliquota.reduc_piscofins / 100)); // Assuming PIS/COFINS reduce same rate
        const cofinsProj = row.cofins * (1 - (aliquota.reduc_piscofins / 100));

        sums.icmsProj[target] += icmsProj;
        sums.pisProj[target] += pisProj;
        sums.cofinsProj[target] += cofinsProj;

        // IBS/CBS Base
        const baseIbsCbs = row.valor - row.icms - (row.pis + row.cofins);
        
        // IBS/CBS Values
        const ibsRate = (aliquota.ibs_estadual + aliquota.ibs_municipal) / 100;
        const cbsRate = aliquota.cbs / 100;

        sums.ibs[target] += baseIbsCbs * ibsRate;
        sums.cbs[target] += baseIbsCbs * cbsRate;
      }
    });

    // Build Result Array
    return [
      { name: 'ICMS', ...sums.icms, result: sums.icms.debits - sums.icms.credits, color: '#2563eb' },
      { name: 'PIS', ...sums.pis, result: sums.pis.debits - sums.pis.credits, color: '#16a34a' },
      { name: 'COFINS', ...sums.cofins, result: sums.cofins.debits - sums.cofins.credits, color: '#ea580c' },
      // Projeção
      { name: `ICMS (${anoProjecao})`, ...sums.icmsProj, result: sums.icmsProj.debits - sums.icmsProj.credits, color: '#60a5fa' },
      { name: `PIS (${anoProjecao})`, ...sums.pisProj, result: sums.pisProj.debits - sums.pisProj.credits, color: '#4ade80' },
      { name: `COFINS (${anoProjecao})`, ...sums.cofinsProj, result: sums.cofinsProj.debits - sums.cofinsProj.credits, color: '#fb923c' },
      { name: `IBS (${anoProjecao})`, ...sums.ibs, result: sums.ibs.debits - sums.ibs.credits, color: '#9333ea' },
      { name: `CBS (${anoProjecao})`, ...sums.cbs, result: sums.cbs.debits - sums.cbs.credits, color: '#d946ef' },
    ];
  }, [data, selectedYear, anoProjecao, aliquotas]);

  const totalResult = summary.reduce((acc, item) => acc + item.result, 0);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={() => navigate('/mercadorias')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Previsão Apuração</h1>
            <p className="text-muted-foreground">Comparativo Débitos vs Créditos</p>
          </div>
        </div>
        
        <div className="flex gap-3">
           <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder="Ano Base" />
            </SelectTrigger>
            <SelectContent>
              {anosDisponiveis.map(ano => (
                <SelectItem key={ano} value={ano}>{ano}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={String(anoProjecao)} onValueChange={(v) => setAnoProjecao(Number(v))}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Ano Projeção" />
            </SelectTrigger>
            <SelectContent>
              {ANOS_PROJECAO.map(ano => (
                <SelectItem key={ano} value={String(ano)}>{ano}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Table Section */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Detalhamento por Imposto</CardTitle>
            <CardDescription>Valores acumulados para o ano {selectedYear}</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Imposto</TableHead>
                  <TableHead className="text-right">Débitos (Saídas)</TableHead>
                  <TableHead className="text-right">Créditos (Entradas)</TableHead>
                  <TableHead className="text-right">Resultado (A Pagar)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.map((item) => (
                  <TableRow key={item.name}>
                    <TableCell className="font-medium">{item.name}</TableCell>
                    <TableCell className="text-right text-red-600">{formatCurrency(item.debits)}</TableCell>
                    <TableCell className="text-right text-blue-600">{formatCurrency(item.credits)}</TableCell>
                    <TableCell className="text-right">
                      <Badge 
                        variant={item.result > 0 ? 'destructive' : 'default'}
                        className={item.result <= 0 ? 'bg-green-600 hover:bg-green-700' : ''}
                      >
                        {formatCurrency(item.result)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {/* Total Row */}
                <TableRow className="bg-muted/50 font-bold">
                  <TableCell>Total Geral</TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(summary.reduce((acc, item) => acc + item.debits, 0))}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(summary.reduce((acc, item) => acc + item.credits, 0))}
                  </TableCell>
                  <TableCell className="text-right">
                    <span className={totalResult > 0 ? "text-red-600" : "text-green-600"}>
                      {formatCurrency(totalResult)}
                    </span>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Chart Section */}
        <Card>
          <CardHeader>
            <CardTitle>Resultado da Apuração</CardTitle>
            <CardDescription>Saldo (Débitos - Créditos)</CardDescription>
          </CardHeader>
          <CardContent className="h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={summary} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" width={100} tick={{fontSize: 10}} />
                <Tooltip 
                  formatter={(value: number) => formatCurrency(value)}
                  cursor={{fill: 'transparent'}}
                />
                <Bar dataKey="result" name="Resultado">
                  {summary.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.result > 0 ? '#ef4444' : '#16a34a'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
