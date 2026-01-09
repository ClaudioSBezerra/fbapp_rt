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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Download, FileText, TrendingUp, TrendingDown, Building2, HelpCircle } from 'lucide-react';
import { exportToExcel } from '@/lib/exportToExcel';
import { format, parse } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { formatFilialDisplayFormatted, formatFilialFromRow } from '@/lib/formatFilial';

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
  cod_est: string | null;
}

interface AggregatedRow {
  filial_id: string;
  filial_nome: string;
  filial_cod_est?: string | null;
  filial_cnpj?: string | null;
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

// Parse manual para evitar bug de timezone
const formatMonthYear = (dateStr: string) => {
  if (!dateStr) return '-';
  const parts = dateStr.split('-');
  if (parts.length >= 2) {
    return `${parts[1]}/${parts[0]}`;
  }
  return dateStr;
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

  const aliquota = aliquotaMap[selectedYear];

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
          <TableRow className="text-xs">
            <TableHead className="text-xs">Filial</TableHead>
            <TableHead className="text-xs whitespace-nowrap">Mês/Ano</TableHead>
            <TableHead className="text-right text-xs">Valor</TableHead>
            <TableHead className="text-right text-xs">ISS</TableHead>
            <TableHead className="text-right text-xs whitespace-nowrap">ISS Proj.</TableHead>
            <TableHead className="text-right text-xs text-pis-cofins">PIS+COFINS</TableHead>
            <TableHead className="text-right text-xs text-pis-cofins whitespace-nowrap">
              PIS+COFINS Proj. {aliquota && <span className="text-muted-foreground font-normal">(-{aliquota.reduc_piscofins}%)</span>}
            </TableHead>
            <TableHead className="text-right text-xs font-semibold bg-muted/30 whitespace-nowrap">Tot. Imp. Atuais</TableHead>
            <TableHead className="text-right text-xs whitespace-nowrap">Base IBS/CBS</TableHead>
            <TableHead className="text-right text-xs text-ibs-cbs whitespace-nowrap">
              IBS Proj. {aliquota && <span className="text-muted-foreground font-normal">({(aliquota.ibs_estadual + aliquota.ibs_municipal).toFixed(1)}%)</span>}
            </TableHead>
            <TableHead className="text-right text-xs text-ibs-cbs whitespace-nowrap">
              CBS Proj. {aliquota && <span className="text-muted-foreground font-normal">({aliquota.cbs.toFixed(1)}%)</span>}
            </TableHead>
            <TableHead className="text-right text-xs font-semibold text-ibs-cbs bg-muted/30 whitespace-nowrap">Total Reforma</TableHead>
<TableHead className="text-right text-xs font-semibold bg-muted/30">
                  <Tooltip>
                    <TooltipTrigger className="cursor-help underline decoration-dotted decoration-muted-foreground inline-flex items-center gap-1 whitespace-nowrap">
                      Tot.Imposto Reforma
                      <HelpCircle className="h-3 w-3 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs">
                      <p className="font-semibold mb-1">Fórmula:</p>
                      <p className="font-mono text-xs">ISS Proj. + PIS/COFINS Proj. + IBS + CBS</p>
                      <p className="text-muted-foreground text-xs mt-1">Total de impostos a pagar com a Reforma Tributária (impostos em transição + novos tributos)</p>
                    </TooltipContent>
                  </Tooltip>
                </TableHead>
            <TableHead className="text-right text-xs">
              <Tooltip>
                <TooltipTrigger className="cursor-help underline decoration-dotted decoration-muted-foreground inline-flex items-center gap-1 whitespace-nowrap">
                  Dif. deb/cred.
                  <HelpCircle className="h-3 w-3 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  <p className="font-semibold mb-1">Fórmula:</p>
                  <p className="font-mono text-xs">(ISS + PIS/COFINS) − (ISS Proj. + PIS/COFINS Proj. + IBS + CBS)</p>
                </TooltipContent>
              </Tooltip>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredData.map((row, idx) => {
            // ISS não tem redução no período de transição
            const vlIss = row.iss;
            const vlIssProjetado = vlIss;

            // PIS/COFINS tem redução normal
            const vlPisCofins = row.pis + row.cofins;
            const vlPisCofinsProjetado = aliquota 
              ? vlPisCofins * (1 - (aliquota.reduc_piscofins / 100)) 
              : vlPisCofins;

            // Total impostos atuais
            const totalImpostosAtuais = vlIss + vlPisCofins;

            // Base para IBS/CBS
            const baseIbsCbs = row.valor - vlIss - vlPisCofins;

            // Projeções IBS/CBS
            const vlIbsProjetado = aliquota 
              ? baseIbsCbs * ((aliquota.ibs_estadual + aliquota.ibs_municipal) / 100) 
              : 0;
            const vlCbsProjetado = aliquota 
              ? baseIbsCbs * (aliquota.cbs / 100) 
              : 0;

            const totalReforma = vlIbsProjetado + vlCbsProjetado;
            const totalImpostosPagar = vlIssProjetado + vlPisCofinsProjetado + totalReforma;
            const diferencaProjetado = totalImpostosAtuais - totalReforma;
            const diferencaReal = totalImpostosPagar - totalImpostosAtuais;

            return (
              <TableRow key={`${row.filial_id}-${row.mes_ano}-${idx}`} className="text-xs">
                <TableCell className="font-medium text-xs whitespace-nowrap py-1 px-2">
                  {formatFilialFromRow(row)}
                </TableCell>
                <TableCell className="text-xs whitespace-nowrap py-1 px-2">{formatMonthYear(row.mes_ano)}</TableCell>
                <TableCell className="text-right font-mono text-xs py-1 px-2">{formatCurrency(row.valor)}</TableCell>
                <TableCell className="text-right font-mono text-xs py-1 px-2">{formatCurrency(vlIss)}</TableCell>
                <TableCell className="text-right font-mono text-xs py-1 px-2">{formatCurrency(vlIssProjetado)}</TableCell>
                <TableCell className="text-right font-mono text-xs text-pis-cofins py-1 px-2">{formatCurrency(vlPisCofins)}</TableCell>
                <TableCell className="text-right font-mono text-xs text-pis-cofins py-1 px-2">{formatCurrency(vlPisCofinsProjetado)}</TableCell>
                <TableCell className="text-right font-mono text-xs font-semibold bg-muted/30 py-1 px-2">{formatCurrency(totalImpostosAtuais)}</TableCell>
                <TableCell className="text-right font-mono text-xs py-1 px-2">{formatCurrency(baseIbsCbs)}</TableCell>
                <TableCell className="text-right font-mono text-xs text-ibs-cbs py-1 px-2">{formatCurrency(vlIbsProjetado)}</TableCell>
                <TableCell className="text-right font-mono text-xs text-ibs-cbs py-1 px-2">{formatCurrency(vlCbsProjetado)}</TableCell>
                <TableCell className="text-right font-mono text-xs font-semibold text-ibs-cbs bg-muted/30 py-1 px-2">{formatCurrency(totalReforma)}</TableCell>
                <TableCell className="text-right font-mono text-xs font-semibold bg-muted/30 py-1 px-2">{formatCurrency(totalImpostosPagar)}</TableCell>
                <TableCell className="text-right py-1 px-2">
                  <Badge 
                    variant={diferencaReal < 0 ? 'destructive' : 'default'}
                    className={`text-xs ${diferencaReal >= 0 ? 'bg-positive text-positive-foreground' : ''}`}
                  >
                    {diferencaReal >= 0 ? '+' : ''}{formatCurrency(diferencaReal)}
                  </Badge>
                </TableCell>
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
        .select('id, razao_social, nome_fantasia, cnpj, cod_est')
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
      return (data || []).map((row: any) => ({
        filial_id: row.filial_id,
        filial_nome: row.filial_nome || '',
        filial_cod_est: row.filial_cod_est || null,
        filial_cnpj: row.filial_cnpj || null,
        mes_ano: row.mes_ano,
        valor: Number(row.valor) || 0,
        pis: Number(row.pis) || 0,
        cofins: Number(row.cofins) || 0,
        iss: Number(row.iss) || 0,
        tipo: row.tipo,
      })) as AggregatedRow[];
    },
  });

  // Enriquece os dados agregados com cod_est e cnpj da tabela filiais
  const enrichedServicosData = useMemo(() => {
    if (filiais.length === 0) return servicosData;
    
    const filiaisById = new Map(filiais.map(f => [f.id, f]));
    
    return servicosData.map(row => {
      const filial = filiaisById.get(row.filial_id);
      if (filial) {
        return {
          ...row,
          filial_cod_est: filial.cod_est || row.filial_cod_est,
          filial_cnpj: filial.cnpj || row.filial_cnpj,
        };
      }
      return row;
    });
  }, [servicosData, filiais]);

  // Get unique months
  const uniqueMonths = useMemo(() => {
    const months = new Set<string>();
    enrichedServicosData.forEach(row => months.add(row.mes_ano));
    return Array.from(months).sort().reverse();
  }, [enrichedServicosData]);

  // Filter data
  const filteredData = useMemo(() => {
    return enrichedServicosData.filter(row => {
      if (selectedFilial !== 'all' && row.filial_id !== selectedFilial) return false;
      if (selectedMonthYear !== 'all' && row.mes_ano !== selectedMonthYear) return false;
      return true;
    });
  }, [enrichedServicosData, selectedFilial, selectedMonthYear]);

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
    const aliquota = aliquotas.find(a => a.ano === selectedYear);
    
    const exportData = filteredData.map(row => {
      const vlIss = row.iss;
      const vlIssProjetado = vlIss;
      const vlPisCofins = row.pis + row.cofins;
      const vlPisCofinsProjetado = aliquota 
        ? vlPisCofins * (1 - (aliquota.reduc_piscofins / 100)) 
        : vlPisCofins;
      const totalImpostosAtuais = vlIss + vlPisCofins;
      const baseIbsCbs = row.valor - vlIss - vlPisCofins;
      const vlIbsProjetado = aliquota 
        ? baseIbsCbs * ((aliquota.ibs_estadual + aliquota.ibs_municipal) / 100) 
        : 0;
      const vlCbsProjetado = aliquota 
        ? baseIbsCbs * (aliquota.cbs / 100) 
        : 0;
      const totalReforma = vlIbsProjetado + vlCbsProjetado;
      const totalImpostosPagar = vlIssProjetado + vlPisCofinsProjetado + totalReforma;
      const diferencaProjetado = totalImpostosAtuais - totalReforma;
      const diferencaReal = totalImpostosPagar - totalImpostosAtuais;

      return {
        'Filial': formatFilialFromRow(row),
        'Mês/Ano': formatMonthYear(row.mes_ano),
        'Tipo': row.tipo === 'entrada' ? 'Aquisição' : 'Prestação',
        'Valor': row.valor,
        'ISS': vlIss,
        'ISS Proj.': vlIssProjetado,
        'PIS+COFINS': vlPisCofins,
        'PIS+COFINS Proj.': vlPisCofinsProjetado,
        'Tot. Imp. Atuais': totalImpostosAtuais,
        'Base IBS/CBS': baseIbsCbs,
        'IBS Proj.': vlIbsProjetado,
        'CBS Proj.': vlCbsProjetado,
        'Total Reforma': totalReforma,
        'Tot.Imposto Reforma': totalImpostosPagar,
        'Dif. deb/cred.': diferencaReal,
      };
    });
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
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 sm:gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-foreground">Serviços</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">Análise de aquisição e prestação de serviços (Bloco A - EFD Contribuições)</p>
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
                      {formatFilialDisplayFormatted(f.cod_est, f.cnpj)}
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
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
                  ((totals.saidas.ibsCbsProj - totals.entradas.ibsCbsProj) - 
                   (totals.saidas.pisCofins - totals.entradas.pisCofins)) < 0
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

      {/* Data Tables */}
      <Card>
        <CardContent className="pt-6">
          <Tabs defaultValue="aquisicoes" className="w-full">
            <TabsList className="mb-4 grid w-full grid-cols-2 sm:w-auto sm:inline-flex">
              <TabsTrigger value="aquisicoes">Aquisições de Serviços</TabsTrigger>
              <TabsTrigger value="prestacoes">Prestações de Serviços</TabsTrigger>
            </TabsList>
            <TabsContent value="aquisicoes">
              <ServicosTable 
                data={filteredData} 
                tipo="entrada" 
                aliquotas={aliquotas}
                selectedYear={selectedYear}
              />
            </TabsContent>
            <TabsContent value="prestacoes">
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
