import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowUpRight, ArrowDownRight, Building2, Filter, Calendar, HelpCircle, Download, RefreshCw } from 'lucide-react';
import { exportToExcel } from '@/lib/exportToExcel';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatFilialDisplayFormatted, formatFilialFromRow } from '@/lib/formatFilial';
import { IbsCbsProjectionPanel } from '@/components/IbsCbsProjectionPanel';

import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';


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
  cnpj: string;
  razao_social: string;
  nome_fantasia: string | null;
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
  icms: number;
  tipo: string;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}


// Parse manual para evitar bug de timezone
function formatDate(dateStr: string): string {
  if (!dateStr) return '-';
  const parts = dateStr.split('-');
  if (parts.length >= 2) {
    return `${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}


function getYearFromMesAno(mesAno: string): number {
  if (!mesAno) return new Date().getFullYear();
  const parts = mesAno.split('-');
  return parts.length >= 1 ? parseInt(parts[0], 10) : new Date().getFullYear();
}

interface MercadoriasTableProps {
  data: AggregatedRow[];
  aliquotas: Aliquota[];
  tipo: 'entrada' | 'saida';
  anoProjecao: number;
}

function MercadoriasTable({ data, aliquotas, tipo, anoProjecao }: MercadoriasTableProps) {
  const aliquotaSelecionada = aliquotas.find((a) => a.ano === anoProjecao) || aliquotas[0];
  if (data.length === 0) {
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
          <TableRow className="text-xs">
            <TableHead className="text-xs">Filial</TableHead>
            <TableHead className="text-xs whitespace-nowrap">Mês/Ano</TableHead>
            <TableHead className="text-right text-xs">Valor</TableHead>
            <TableHead className="text-right text-xs">ICMS</TableHead>
            <TableHead className="text-right text-xs whitespace-nowrap">
              ICMS Proj. {aliquotaSelecionada && <span className="text-muted-foreground font-normal">(-{aliquotaSelecionada.reduc_icms}%)</span>}
            </TableHead>
            <TableHead className="text-right text-xs text-pis-cofins">PIS+COFINS</TableHead>
            <TableHead className="text-right text-xs text-pis-cofins whitespace-nowrap">
              PIS+COFINS Proj. {aliquotaSelecionada && <span className="text-muted-foreground font-normal">(-{aliquotaSelecionada.reduc_piscofins}%)</span>}
            </TableHead>
            <TableHead className="text-right text-xs font-semibold bg-muted/30 whitespace-nowrap">Tot. Imp. Atuais</TableHead>
            <TableHead className="text-right text-xs whitespace-nowrap">Base IBS/CBS</TableHead>
            <TableHead className="text-right text-xs text-ibs-cbs whitespace-nowrap">
              IBS Proj. {aliquotaSelecionada && <span className="text-muted-foreground font-normal">({(aliquotaSelecionada.ibs_estadual + aliquotaSelecionada.ibs_municipal).toFixed(1)}%)</span>}
            </TableHead>
            <TableHead className="text-right text-xs text-ibs-cbs whitespace-nowrap">
              CBS Proj. {aliquotaSelecionada && <span className="text-muted-foreground font-normal">({aliquotaSelecionada.cbs.toFixed(1)}%)</span>}
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
                      <p className="font-mono text-xs">ICMS Proj. + PIS/COFINS Proj. + IBS + CBS</p>
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
                  <p className="font-mono text-xs">(ICMS + PIS/COFINS) − (ICMS Proj. + PIS/COFINS Proj. + IBS + CBS)</p>
                  <p className="text-muted-foreground text-xs mt-1">Compara impostos atuais com TODOS os impostos projetados (transição + novos)</p>
                </TooltipContent>
              </Tooltip>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row, index) => {
            const aliquota = aliquotaSelecionada;
            
            const vlIcms = row.icms;
            const vlIcmsProjetado = aliquota ? vlIcms * (1 - (aliquota.reduc_icms / 100)) : vlIcms;
            const vlPisCofins = row.pis + row.cofins;
            const vlPisCofinsProjetado = aliquota ? vlPisCofins * (1 - (aliquota.reduc_piscofins / 100)) : vlPisCofins;
            const totalImpostosAtuais = vlIcms + vlPisCofins;
            const baseIbsCbs = row.valor - vlIcms - vlPisCofins;
            const vlIbsProjetado = aliquota ? baseIbsCbs * ((aliquota.ibs_estadual + aliquota.ibs_municipal) / 100) : 0;
            const vlCbsProjetado = aliquota ? baseIbsCbs * (aliquota.cbs / 100) : 0;
            const totalReforma = vlIbsProjetado + vlCbsProjetado;
            const totalImpostosPagar = vlIcmsProjetado + vlPisCofinsProjetado + vlIbsProjetado + vlCbsProjetado;
            const diferencaProjetado = totalImpostosAtuais - totalReforma;
            const diferencaReal = totalImpostosPagar - (vlIcms + vlPisCofins);

            return (
              <TableRow key={`${row.filial_id}-${row.mes_ano}-${index}`} className="text-xs">
                <TableCell className="font-medium text-xs whitespace-nowrap py-1 px-2">{formatFilialFromRow(row)}</TableCell>
                <TableCell className="text-xs whitespace-nowrap">{formatDate(row.mes_ano)}</TableCell>
                <TableCell className="text-right font-mono text-xs">{formatCurrency(row.valor)}</TableCell>
                <TableCell className="text-right font-mono text-xs">{formatCurrency(vlIcms)}</TableCell>
                <TableCell className="text-right font-mono text-xs">{formatCurrency(vlIcmsProjetado)}</TableCell>
                <TableCell className="text-right font-mono text-xs text-pis-cofins">{formatCurrency(vlPisCofins)}</TableCell>
                <TableCell className="text-right font-mono text-xs text-pis-cofins">{formatCurrency(vlPisCofinsProjetado)}</TableCell>
                <TableCell className="text-right font-mono text-xs font-semibold bg-muted/30">{formatCurrency(totalImpostosAtuais)}</TableCell>
                <TableCell className="text-right font-mono text-xs">{formatCurrency(baseIbsCbs)}</TableCell>
                <TableCell className="text-right font-mono text-xs text-ibs-cbs">{formatCurrency(vlIbsProjetado)}</TableCell>
                <TableCell className="text-right font-mono text-xs text-ibs-cbs">{formatCurrency(vlCbsProjetado)}</TableCell>
                <TableCell className="text-right font-mono text-xs font-semibold text-ibs-cbs bg-muted/30">{formatCurrency(totalReforma)}</TableCell>
                <TableCell className="text-right font-mono text-xs font-semibold bg-muted/30">{formatCurrency(totalImpostosPagar)}</TableCell>
                <TableCell className="text-right">
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
}

export default function Mercadorias() {
  const [aggregatedData, setAggregatedData] = useState<AggregatedRow[]>([]);
  const [aliquotas, setAliquotas] = useState<Aliquota[]>([]);
  const [filiais, setFiliais] = useState<Filial[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  // Filters
  const [filterFilial, setFilterFilial] = useState<string>('all');
  const [filterMesAno, setFilterMesAno] = useState<string>('all');
  const [anoProjecao, setAnoProjecao] = useState<number>(2027);
  const ANOS_PROJECAO = [2027, 2028, 2029, 2030, 2031, 2032, 2033];
  const [refreshingViews, setRefreshingViews] = useState(false);

  const handleRefreshViews = async () => {
    console.log('Initiating refresh views...');
    setRefreshingViews(true);
    
    try {
      toast.info('Atualizando painéis... Isso pode levar alguns segundos.');
      
      // Call the dedicated edge function for refresh with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000);
      
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/refresh-views`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          signal: controller.signal,
        }
      );
      
      clearTimeout(timeoutId);
      
      const result = await response.json();
      
      if (!response.ok || !result.success) {
        console.error('Refresh failed:', result);
        toast.error(result.error || 'Falha ao atualizar views.');
        return;
      }
      
      console.log('Refresh completed:', result);
      toast.success(`Painéis atualizados com sucesso! (${result.duration_ms}ms)`);
      
      // Reload local data
      await fetchAggregatedData();
      
    } catch (err: any) {
      console.error('Failed to refresh views:', err);
      
      if (err.name === 'AbortError') {
        toast.error('A atualização está demorando muito. Tente novamente em alguns minutos.');
      } else {
        toast.error('Falha ao atualizar views. Tente novamente.');
      }
    } finally {
      setRefreshingViews(false);
    }
  };

  // Fetch aggregated data directly from DB
  const fetchAggregatedData = async () => {
    try {
      setLoading(true);
      
      // Fetch aliquotas
      const { data: aliquotasData } = await supabase
        .from('aliquotas')
        .select('ano, ibs_estadual, ibs_municipal, cbs, reduc_icms, reduc_piscofins')
        .order('ano');
      if (aliquotasData) setAliquotas(aliquotasData);

      // Fetch filiais
      const { data: filiaisData } = await supabase
        .from('filiais')
        .select('id, cnpj, razao_social, nome_fantasia, cod_est');
      if (filiaisData) {
        setFiliais(filiaisData);
      }

      // Use Materialized View for aggregated data (instant load)
      // Pass user.id explicitly to ensure RLS context is correct
      // Handle potential undefined user.id by passing null explicitly if needed, 
      // but Supabase handles undefined params by ignoring them or sending null usually.
      // We force null to be safe if user is not fully loaded yet.
      
      // @ts-ignore: Types not yet generated for this RPC function
      const { data: aggregatedResult, error } = await supabase.rpc('get_mv_mercadorias_aggregated');
      
      if (error) {
        console.error('Error fetching aggregated mercadorias:', error);
        toast.error(`Erro ao carregar dados: ${error.message}`);
        return;
      }

      console.log('Aggregated Data Loaded:', aggregatedResult?.length || 0, 'records');

      if (aggregatedResult) {
        setAggregatedData(aggregatedResult.map((item: any) => ({
          filial_id: item.filial_id,
          filial_nome: item.filial_nome || 'Filial',
          filial_cod_est: item.filial_cod_est || null,
          filial_cnpj: item.filial_cnpj || null,
          mes_ano: item.mes_ano,
          valor: Number(item.valor) || 0,
          pis: Number(item.pis) || 0,
          cofins: Number(item.cofins) || 0,
          icms: Number(item.icms) || 0,
          tipo: item.tipo,
        })));

        if (aggregatedResult.length === 0) {
           console.warn('No aggregated data found for user.');
        }
      } else {
        setAggregatedData([]);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAggregatedData();
  }, [user]);

  // Enriquece os dados agregados com cod_est e cnpj da tabela filiais
  const enrichedAggregatedData = useMemo(() => {
    if (filiais.length === 0) return aggregatedData;
    
    const filiaisById = new Map(filiais.map(f => [f.id, f]));
    
    return aggregatedData.map(row => {
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
  }, [aggregatedData, filiais]);

  // Get unique mes_ano options from aggregated data
  const mesAnoOptions = useMemo(() => {
    const unique = [...new Set(enrichedAggregatedData.map(m => m.mes_ano))];
    return unique.sort((a, b) => b.localeCompare(a));
  }, [enrichedAggregatedData]);

  // Filter aggregated data
  const filteredData = useMemo(() => {
    return enrichedAggregatedData.filter(m => {
      if (filterFilial !== 'all' && m.filial_id !== filterFilial) return false;
      if (filterMesAno !== 'all' && m.mes_ano !== filterMesAno) return false;
      return true;
    });
  }, [enrichedAggregatedData, filterFilial, filterMesAno]);

  const entradasAgregadas = useMemo(() => 
    filteredData.filter(m => m.tipo?.toLowerCase() === 'entrada').sort((a, b) => b.mes_ano.localeCompare(a.mes_ano)), 
    [filteredData]
  );

  const saidasAgregadas = useMemo(() => 
    filteredData.filter(m => m.tipo?.toLowerCase() === 'saida').sort((a, b) => b.mes_ano.localeCompare(a.mes_ano)), 
    [filteredData]
  );

  const aliquotaSelecionada = useMemo(() => {
    return aliquotas.find((a) => a.ano === anoProjecao) || null;
  }, [aliquotas, anoProjecao]);

  const hasFiliais = filiais.length > 0;

  const handleExportExcel = () => {
    const aliquota = aliquotaSelecionada;
    const dataToExport = filteredData.map(row => {
      const vlIcms = row.icms;
      const vlIcmsProjetado = aliquota ? vlIcms * (1 - (aliquota.reduc_icms / 100)) : vlIcms;
      const vlPisCofins = row.pis + row.cofins;
      const vlPisCofinsProjetado = aliquota ? vlPisCofins * (1 - (aliquota.reduc_piscofins / 100)) : vlPisCofins;
      const totalImpostosAtuais = vlIcms + vlPisCofins;
      const baseIbsCbs = row.valor - vlIcms - vlPisCofins;
      const vlIbsProjetado = aliquota ? baseIbsCbs * ((aliquota.ibs_estadual + aliquota.ibs_municipal) / 100) : 0;
      const vlCbsProjetado = aliquota ? baseIbsCbs * (aliquota.cbs / 100) : 0;
      const totalReforma = vlIbsProjetado + vlCbsProjetado;
      const diferencaProjetado = totalImpostosAtuais - totalReforma;
      const diferencaReal = (vlIcmsProjetado + vlPisCofinsProjetado + vlIbsProjetado + vlCbsProjetado) - (vlIcms + vlPisCofins);

      return {
        'Tipo': row.tipo === 'entrada' ? 'Entrada' : 'Saída',
        'Filial': formatFilialFromRow(row),
        'Mês/Ano': formatDate(row.mes_ano),
        'Valor': row.valor,
        'ICMS': vlIcms,
        'ICMS Projetado': vlIcmsProjetado,
        'PIS+COFINS': vlPisCofins,
        'PIS+COFINS Projetado': vlPisCofinsProjetado,
        'Total Impostos Atuais': totalImpostosAtuais,
        'Base IBS/CBS': baseIbsCbs,
        'IBS Projetado': vlIbsProjetado,
        'CBS Projetado': vlCbsProjetado,
        'Total Reforma': totalReforma,
        'Diferença Real': diferencaReal,
      };
    });

    exportToExcel(dataToExport, `mercadorias_${anoProjecao}`, 'Mercadorias');
    toast.success('Arquivo Excel exportado com sucesso!');
  };




  return (
    <div className="space-y-4 p-2 sm:p-4 pb-24">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Operações Principais</h1>
          <p className="text-muted-foreground">
            Gerencie e visualize as operações de mercadorias por filial
          </p>
          <div className="mt-2">
            <Button 
              variant="default" 
              size="sm"
              onClick={handleRefreshViews}
              disabled={refreshingViews}
              className="bg-blue-600 hover:bg-blue-700 text-white px-3"
            >
              <RefreshCw className={`h-3.5 w-3.5 mr-2 ${refreshingViews ? 'animate-spin' : ''}`} />
              Atualizar a VIEW de resultados
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm"
            onClick={handleExportExcel}
            disabled={filteredData.length === 0}
          >
            <Download className="h-4 w-4 mr-2" />
            Exportar Excel
          </Button>
        </div>
      </div>

      {!hasFiliais && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <Building2 className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <p className="text-sm font-medium">Nenhuma filial cadastrada</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Para começar, importe um arquivo EFD Contribuições. As filiais serão cadastradas automaticamente.
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Use o botão "Importar EFD" no cabeçalho para criar automaticamente a filial.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card className="border-border/50">
        <CardContent className="pt-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4 w-full">
            <div className="flex items-center gap-2">
              <Filter className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-medium">Filtros:</span>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Label className="text-xs whitespace-nowrap">Filial:</Label>
              <Select value={filterFilial} onValueChange={setFilterFilial}>
                <SelectTrigger className="w-full sm:w-[220px]">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {filiais.map((filial) => (
                    <SelectItem key={filial.id} value={filial.id}>
                      {formatFilialDisplayFormatted(filial.cod_est, filial.cnpj)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Label className="text-xs whitespace-nowrap">Mês/Ano:</Label>
              <Select value={filterMesAno} onValueChange={setFilterMesAno}>
                <SelectTrigger className="w-full sm:w-[150px]">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {mesAnoOptions.map((mesAno) => (
                    <SelectItem key={mesAno} value={mesAno}>
                      {formatDate(mesAno)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Calendar className="h-3.5 w-3.5 text-muted-foreground hidden sm:block" />
              <Label className="text-xs whitespace-nowrap">Ano Projeção:</Label>
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
        </CardContent>
      </Card>

      <IbsCbsProjectionPanel 
        filteredData={filteredData} 
        aliquotas={aliquotas} 
        anoProjecao={anoProjecao} 
      />

      <Card className="border-border/50">
        <Tabs defaultValue="entradas" className="w-full">
          <CardHeader>
            <CardTitle>Operações Agregadas</CardTitle>
            <CardDescription>Visualize entradas e saídas agregadas por Filial e Mês/Ano</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-4">
              <TabsList className="grid w-full grid-cols-2 sm:w-auto sm:inline-flex">
                <TabsTrigger value="entradas">Entradas</TabsTrigger>
                <TabsTrigger value="saidas">Saídas</TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="entradas" className="mt-0">
              {loading ? <div className="py-12 text-center text-muted-foreground">Carregando...</div> : <MercadoriasTable data={entradasAgregadas} aliquotas={aliquotas} tipo="entrada" anoProjecao={anoProjecao} />}
            </TabsContent>
            <TabsContent value="saidas" className="mt-0">
              {loading ? <div className="py-12 text-center text-muted-foreground">Carregando...</div> : <MercadoriasTable data={saidasAgregadas} aliquotas={aliquotas} tipo="saida" anoProjecao={anoProjecao} />}
            </TabsContent>
          </CardContent>
        </Tabs>
      </Card>

    </div>
  );
}
