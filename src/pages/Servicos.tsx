import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Download, FileText, TrendingUp, TrendingDown, Building2 } from 'lucide-react';
import { exportToExcel } from '@/lib/exportToExcel';
import { format, parse } from 'date-fns';
import { ptBR } from 'date-fns/locale';

// Types
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
  razao_social: string;
  nome_fantasia: string | null;
  cnpj: string;
}

interface AggregatedRow {
  filial_id: string;
  filial_nome: string;
  mes_ano: string;
  valor: number;
  pis: number;
  cofins: number;
  iss: number;
  tipo: string;
}

// Helpers
const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
};

const cleanFilialName = (name: string) => {
  if (!name) return 'Filial';
  return name
    .replace(/^(FILIAL\s*[-:]?\s*)/i, '')
    .replace(/\s+/g, ' ')
    .trim() || 'Filial';
};

const formatMonthYear = (dateStr: string) => {
  try {
    const date = parse(dateStr, 'yyyy-MM-dd', new Date());
    return format(date, 'MMM/yyyy', { locale: ptBR });
  } catch {
    return dateStr;
  }
};

const formatCNPJ = (cnpj: string) => {
  const cleaned = cnpj.replace(/\D/g, '');
  return cleaned.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
};

const extractYear = (dateStr: string): number => {
  try {
    return parseInt(dateStr.substring(0, 4), 10);
  } catch {
    return new Date().getFullYear();
  }
};

// ServicosTable Component
interface ServicosTableProps {
  data: AggregatedRow[];
  tipo: 'entrada' | 'saida';
  aliquotas: Aliquota[];
  selectedYear: number;
}

const ServicosTable = ({ data, tipo, aliquotas, selectedYear }: ServicosTableProps) => {
  const filteredData = data.filter(row => row.tipo === tipo);
  
  const aliquotaMap = useMemo(() => {
    const map: Record<number, Aliquota> = {};
    aliquotas.forEach(a => { map[a.ano] = a; });
    return map;
  }, [aliquotas]);

  const selectedAliquota = aliquotaMap[selectedYear];

  if (filteredData.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>Nenhum dado de {tipo === 'entrada' ? 'aquisição de serviços' : 'prestação de serviços'} encontrado.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Filial</TableHead>
            <TableHead>Período</TableHead>
            <TableHead className="text-right">Valor</TableHead>
            <TableHead className="text-right">PIS</TableHead>
            <TableHead className="text-right">COFINS</TableHead>
            <TableHead className="text-right">ISS</TableHead>
            <TableHead className="text-right">PIS/COFINS Total</TableHead>
            {selectedAliquota && (
              <>
                <TableHead className="text-right">IBS Proj.</TableHead>
                <TableHead className="text-right">CBS Proj.</TableHead>
                <TableHead className="text-right">IBS+CBS Proj.</TableHead>
              </>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredData.map((row, idx) => {
            const pisCofinsTotal = row.pis + row.cofins;
            
            // Projeção: ISS não tem redução no período de transição
            // IBS/CBS incidem sobre o valor da operação
            const ibsProj = selectedAliquota 
              ? row.valor * (selectedAliquota.ibs_estadual + selectedAliquota.ibs_municipal) / 100
              : 0;
            const cbsProj = selectedAliquota 
              ? row.valor * selectedAliquota.cbs / 100
              : 0;
            const ibsCbsTotal = ibsProj + cbsProj;

            return (
              <TableRow key={`${row.filial_id}-${row.mes_ano}-${idx}`}>
                <TableCell className="font-medium">{cleanFilialName(row.filial_nome)}</TableCell>
                <TableCell>{formatMonthYear(row.mes_ano)}</TableCell>
                <TableCell className="text-right">{formatCurrency(row.valor)}</TableCell>
                <TableCell className="text-right">{formatCurrency(row.pis)}</TableCell>
                <TableCell className="text-right">{formatCurrency(row.cofins)}</TableCell>
                <TableCell className="text-right">{formatCurrency(row.iss)}</TableCell>
                <TableCell className="text-right font-medium">{formatCurrency(pisCofinsTotal)}</TableCell>
                {selectedAliquota && (
                  <>
                    <TableCell className="text-right text-primary">{formatCurrency(ibsProj)}</TableCell>
                    <TableCell className="text-right text-primary">{formatCurrency(cbsProj)}</TableCell>
                    <TableCell className="text-right font-medium text-primary">{formatCurrency(ibsCbsTotal)}</TableCell>
                  </>
                )}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
};

// Main Component
export default function Servicos() {
  const [selectedFilial, setSelectedFilial] = useState<string>('all');
  const [selectedMonthYear, setSelectedMonthYear] = useState<string>('all');
  const [selectedYear, setSelectedYear] = useState<number>(2027);

  // Fetch aliquotas
  const { data: aliquotas = [] } = useQuery({
    queryKey: ['aliquotas'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('aliquotas')
        .select('*')
        .eq('is_active', true)
        .order('ano');
      if (error) throw error;
      return data as Aliquota[];
    },
  });

  // Fetch filiais
  const { data: filiais = [] } = useQuery({
    queryKey: ['filiais'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('filiais')
        .select('id, razao_social, nome_fantasia, cnpj')
        .order('razao_social');
      if (error) throw error;
      return data as Filial[];
    },
  });

  // Fetch aggregated servicos data
  const { data: servicosData = [], isLoading } = useQuery({
    queryKey: ['servicos-aggregated'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_mv_servicos_aggregated');
      if (error) throw error;
      return (data || []) as AggregatedRow[];
    },
  });

  // Get unique months
  const uniqueMonths = useMemo(() => {
    const months = new Set<string>();
    servicosData.forEach(row => months.add(row.mes_ano));
    return Array.from(months).sort().reverse();
  }, [servicosData]);

  // Filter data
  const filteredData = useMemo(() => {
    return servicosData.filter(row => {
      if (selectedFilial !== 'all' && row.filial_id !== selectedFilial) return false;
      if (selectedMonthYear !== 'all' && row.mes_ano !== selectedMonthYear) return false;
      return true;
    });
  }, [servicosData, selectedFilial, selectedMonthYear]);

  // Calculate totals
  const totals = useMemo(() => {
    const entradas = filteredData.filter(r => r.tipo === 'entrada');
    const saidas = filteredData.filter(r => r.tipo === 'saida');

    const sumEntradas = {
      valor: entradas.reduce((acc, r) => acc + r.valor, 0),
      pis: entradas.reduce((acc, r) => acc + r.pis, 0),
      cofins: entradas.reduce((acc, r) => acc + r.cofins, 0),
      iss: entradas.reduce((acc, r) => acc + r.iss, 0),
    };

    const sumSaidas = {
      valor: saidas.reduce((acc, r) => acc + r.valor, 0),
      pis: saidas.reduce((acc, r) => acc + r.pis, 0),
      cofins: saidas.reduce((acc, r) => acc + r.cofins, 0),
      iss: saidas.reduce((acc, r) => acc + r.iss, 0),
    };

    const aliquota = aliquotas.find(a => a.ano === selectedYear);
    
    // Projeção IBS/CBS para entradas (créditos)
    const entradasIbsProj = aliquota 
      ? sumEntradas.valor * (aliquota.ibs_estadual + aliquota.ibs_municipal) / 100 
      : 0;
    const entradasCbsProj = aliquota 
      ? sumEntradas.valor * aliquota.cbs / 100 
      : 0;

    // Projeção IBS/CBS para saídas (débitos)
    const saidasIbsProj = aliquota 
      ? sumSaidas.valor * (aliquota.ibs_estadual + aliquota.ibs_municipal) / 100 
      : 0;
    const saidasCbsProj = aliquota 
      ? sumSaidas.valor * aliquota.cbs / 100 
      : 0;

    return {
      entradas: {
        ...sumEntradas,
        pisCofins: sumEntradas.pis + sumEntradas.cofins,
        ibsProj: entradasIbsProj,
        cbsProj: entradasCbsProj,
        ibsCbsProj: entradasIbsProj + entradasCbsProj,
      },
      saidas: {
        ...sumSaidas,
        pisCofins: sumSaidas.pis + sumSaidas.cofins,
        ibsProj: saidasIbsProj,
        cbsProj: saidasCbsProj,
        ibsCbsProj: saidasIbsProj + saidasCbsProj,
      },
    };
  }, [filteredData, aliquotas, selectedYear]);

  // Export to Excel
  const handleExport = () => {
    const exportData = filteredData.map(row => ({
      'Filial': cleanFilialName(row.filial_nome),
      'Período': formatMonthYear(row.mes_ano),
      'Tipo': row.tipo === 'entrada' ? 'Aquisição' : 'Prestação',
      'Valor': row.valor,
      'PIS': row.pis,
      'COFINS': row.cofins,
      'ISS': row.iss,
      'PIS/COFINS Total': row.pis + row.cofins,
    }));
    exportToExcel(exportData, 'servicos');
  };

  if (isLoading) {
    return (
      <div className="space-y-6 p-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Serviços</h1>
          <p className="text-muted-foreground">Análise de aquisição e prestação de serviços (Bloco A - EFD Contribuições)</p>
        </div>
        <Button onClick={handleExport} variant="outline" size="sm">
          <Download className="h-4 w-4 mr-2" />
          Exportar Excel
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Filial</label>
              <Select value={selectedFilial} onValueChange={setSelectedFilial}>
                <SelectTrigger>
                  <SelectValue placeholder="Todas as filiais" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as filiais</SelectItem>
                  {filiais.map(f => (
                    <SelectItem key={f.id} value={f.id}>
                      {cleanFilialName(f.nome_fantasia || f.razao_social)} - {formatCNPJ(f.cnpj)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Período</label>
              <Select value={selectedMonthYear} onValueChange={setSelectedMonthYear}>
                <SelectTrigger>
                  <SelectValue placeholder="Todos os períodos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os períodos</SelectItem>
                  {uniqueMonths.map(m => (
                    <SelectItem key={m} value={m}>{formatMonthYear(m)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Ano Projeção</label>
              <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(parseInt(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {aliquotas.map(a => (
                    <SelectItem key={a.ano} value={a.ano.toString()}>{a.ano}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end">
              <Badge variant="outline" className="h-10 px-4 flex items-center gap-2">
                <Building2 className="h-4 w-4" />
                {filteredData.length} registros
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Aquisições (Entradas) */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingDown className="h-4 w-4 text-blue-500" />
              Aquisições de Serviços
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totals.entradas.valor)}</div>
            <div className="text-sm text-muted-foreground mt-2 space-y-1">
              <div className="flex justify-between">
                <span>PIS/COFINS:</span>
                <span className="font-medium">{formatCurrency(totals.entradas.pisCofins)}</span>
              </div>
              <div className="flex justify-between">
                <span>ISS:</span>
                <span className="font-medium">{formatCurrency(totals.entradas.iss)}</span>
              </div>
              <div className="flex justify-between text-primary">
                <span>IBS/CBS Proj. ({selectedYear}):</span>
                <span className="font-medium">{formatCurrency(totals.entradas.ibsCbsProj)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Prestações (Saídas) */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-green-500" />
              Prestações de Serviços
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totals.saidas.valor)}</div>
            <div className="text-sm text-muted-foreground mt-2 space-y-1">
              <div className="flex justify-between">
                <span>PIS/COFINS:</span>
                <span className="font-medium">{formatCurrency(totals.saidas.pisCofins)}</span>
              </div>
              <div className="flex justify-between">
                <span>ISS:</span>
                <span className="font-medium">{formatCurrency(totals.saidas.iss)}</span>
              </div>
              <div className="flex justify-between text-primary">
                <span>IBS/CBS Proj. ({selectedYear}):</span>
                <span className="font-medium">{formatCurrency(totals.saidas.ibsCbsProj)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Diferença Projetada */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Impacto Projetado ({selectedYear})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Atual (PIS/COFINS líquido):</span>
                <span className="font-medium">
                  {formatCurrency(totals.saidas.pisCofins - totals.entradas.pisCofins)}
                </span>
              </div>
              <div className="flex justify-between text-sm text-primary">
                <span>Projetado (IBS/CBS líquido):</span>
                <span className="font-medium">
                  {formatCurrency(totals.saidas.ibsCbsProj - totals.entradas.ibsCbsProj)}
                </span>
              </div>
              <div className="border-t pt-2 flex justify-between text-sm font-medium">
                <span>Diferença:</span>
                <span className={
                  (totals.saidas.ibsCbsProj - totals.entradas.ibsCbsProj) > 
                  (totals.saidas.pisCofins - totals.entradas.pisCofins)
                    ? 'text-destructive'
                    : 'text-green-600'
                }>
                  {formatCurrency(
                    (totals.saidas.ibsCbsProj - totals.entradas.ibsCbsProj) - 
                    (totals.saidas.pisCofins - totals.entradas.pisCofins)
                  )}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Data Tabs */}
      <Card>
        <CardContent className="pt-6">
          <Tabs defaultValue="entradas">
            <TabsList className="mb-4">
              <TabsTrigger value="entradas">Aquisições de Serviços</TabsTrigger>
              <TabsTrigger value="saidas">Prestações de Serviços</TabsTrigger>
            </TabsList>
            <TabsContent value="entradas">
              <ServicosTable 
                data={filteredData} 
                tipo="entrada" 
                aliquotas={aliquotas}
                selectedYear={selectedYear}
              />
            </TabsContent>
            <TabsContent value="saidas">
              <ServicosTable 
                data={filteredData} 
                tipo="saida" 
                aliquotas={aliquotas}
                selectedYear={selectedYear}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
