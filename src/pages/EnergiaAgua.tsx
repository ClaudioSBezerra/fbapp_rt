import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowDownRight, ArrowUpRight, Zap, HelpCircle, Download } from 'lucide-react';
import { exportToExcel } from '@/lib/exportToExcel';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { formatFilialDisplayFormatted, formatFilialFromRow } from '@/lib/formatFilial';

interface AggregatedRow {
  filial_id: string;
  filial_nome: string;
  filial_cod_est?: string | null;
  filial_cnpj?: string | null;
  mes_ano: string;
  tipo_operacao: string;
  tipo_servico: string;
  valor: number;
  pis: number;
  cofins: number;
  icms: number;
}

interface Filial {
  id: string;
  cnpj: string;
  razao_social: string;
  nome_fantasia: string | null;
  cod_est: string | null;
}

interface Aliquota {
  ano: number;
  ibs_estadual: number;
  ibs_municipal: number;
  cbs: number;
  reduc_icms: number;
  reduc_piscofins: number;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
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


export default function EnergiaAgua() {
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

  const fetchAggregatedData = async () => {
    const { data, error } = await supabase.rpc('get_mv_energia_agua_aggregated');
    if (error) {
      console.error('Error fetching aggregated data:', error);
      return;
    }
    if (data) {
      setAggregatedData(data.map((row: any) => ({
        filial_id: row.filial_id,
        filial_nome: row.filial_nome,
        filial_cod_est: row.filial_cod_est || null,
        filial_cnpj: row.filial_cnpj || null,
        mes_ano: row.mes_ano,
        tipo_operacao: row.tipo_operacao,
        tipo_servico: row.tipo_servico,
        valor: Number(row.valor) || 0,
        pis: Number(row.pis) || 0,
        cofins: Number(row.cofins) || 0,
        icms: Number(row.icms) || 0,
      })));
    }
  };

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

  useEffect(() => {
    async function fetchData() {
      try {
        const { data: aliquotasData } = await supabase
          .from('aliquotas')
          .select('ano, ibs_estadual, ibs_municipal, cbs, reduc_icms, reduc_piscofins')
          .order('ano');

        if (aliquotasData) setAliquotas(aliquotasData);

        await fetchAggregatedData();

        const { data: filiaisData } = await supabase
          .from('filiais')
          .select('id, cnpj, razao_social, nome_fantasia, cod_est');

        if (filiaisData) {
          setFiliais(filiaisData);
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

  // Get unique mes_ano options from aggregated data
  const mesAnoOptions = useMemo(() => {
    const unique = [...new Set(enrichedAggregatedData.map(i => i.mes_ano))];
    return unique.sort((a, b) => b.localeCompare(a));
  }, [enrichedAggregatedData]);

  // Filter aggregated data
  const filteredData = useMemo(() => {
    return enrichedAggregatedData.filter(i => {
      if (filterFilial !== 'all' && i.filial_id !== filterFilial) return false;
      if (filterMesAno !== 'all' && i.mes_ano !== filterMesAno) return false;
      return true;
    });
  }, [enrichedAggregatedData, filterFilial, filterMesAno]);

  const creditosAgregados = useMemo(() => 
    filteredData.filter(i => i.tipo_operacao === 'credito'), 
    [filteredData]
  );

  const debitosAgregados = useMemo(() => 
    filteredData.filter(i => i.tipo_operacao === 'debito'), 
    [filteredData]
  );

  const aliquotaSelecionada = useMemo(() => {
    return aliquotas.find((a) => a.ano === anoProjecao) || null;
  }, [aliquotas, anoProjecao]);

  const totaisCreditos = useMemo(() => {
    const valor = creditosAgregados.reduce((acc, i) => acc + i.valor, 0);
    const icms = creditosAgregados.reduce((acc, i) => acc + i.icms, 0);
    const pisCofins = creditosAgregados.reduce((acc, i) => acc + i.pis + i.cofins, 0);
    
    const aliquota = aliquotaSelecionada;
    const icmsProjetado = aliquota ? icms * (1 - (aliquota.reduc_icms / 100)) : icms;
    const pisCofinsProjetado = aliquota ? pisCofins * (1 - (aliquota.reduc_piscofins / 100)) : pisCofins;
    const baseIbsCbs = valor - icms - pisCofins;
    const ibsProjetado = aliquota ? baseIbsCbs * ((aliquota.ibs_estadual + aliquota.ibs_municipal) / 100) : 0;
    const cbsProjetado = aliquota ? baseIbsCbs * (aliquota.cbs / 100) : 0;
    
    const totalImpostosAtuais = icms + pisCofins;
    const totalReforma = ibsProjetado + cbsProjetado;
    const totalImpostosPagar = icmsProjetado + pisCofinsProjetado + ibsProjetado + cbsProjetado;
    const diferencaProjetado = totalImpostosAtuais - totalReforma;
    const diferencaReal = totalImpostosPagar - (icms + pisCofins);
    
    return { valor, icms, pisCofins, icmsProjetado, pisCofinsProjetado, baseIbsCbs, ibsProjetado, cbsProjetado, totalImpostosAtuais, totalReforma, totalImpostosPagar, diferencaProjetado, diferencaReal };
  }, [creditosAgregados, aliquotaSelecionada]);

  const totaisDebitos = useMemo(() => {
    const valor = debitosAgregados.reduce((acc, i) => acc + i.valor, 0);
    const icms = debitosAgregados.reduce((acc, i) => acc + i.icms, 0);
    const pisCofins = debitosAgregados.reduce((acc, i) => acc + i.pis + i.cofins, 0);
    
    const aliquota = aliquotaSelecionada;
    const icmsProjetado = aliquota ? icms * (1 - (aliquota.reduc_icms / 100)) : icms;
    const pisCofinsProjetado = aliquota ? pisCofins * (1 - (aliquota.reduc_piscofins / 100)) : pisCofins;
    const baseIbsCbs = valor - icms - pisCofins;
    const ibsProjetado = aliquota ? baseIbsCbs * ((aliquota.ibs_estadual + aliquota.ibs_municipal) / 100) : 0;
    const cbsProjetado = aliquota ? baseIbsCbs * (aliquota.cbs / 100) : 0;
    const totalImpostosAtuais = icms + pisCofins;
    const totalReforma = ibsProjetado + cbsProjetado;
    const totalImpostosPagar = icmsProjetado + pisCofinsProjetado + ibsProjetado + cbsProjetado;
    const diferencaProjetado = totalImpostosAtuais - totalReforma;
    const diferencaReal = totalImpostosPagar - (icms + pisCofins);
    
    return { valor, icms, pisCofins, icmsProjetado, pisCofinsProjetado, baseIbsCbs, ibsProjetado, cbsProjetado, totalImpostosAtuais, totalReforma, totalImpostosPagar, diferencaProjetado, diferencaReal };
  }, [debitosAgregados, aliquotaSelecionada]);

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
        'Tipo Operação': row.tipo_operacao === 'credito' ? 'Crédito' : 'Débito',
        'Tipo Serviço': row.tipo_servico === 'energia' ? 'Energia' : 'Água',
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

    exportToExcel(dataToExport, `energia_agua_${anoProjecao}`, 'Energia e Água');
    toast.success('Arquivo Excel exportado com sucesso!');
  };

  const renderTable = (data: AggregatedRow[], tipo: 'credito' | 'debito') => {
    if (data.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Zap className="h-12 w-12 text-muted-foreground/30 mb-4" />
          <p className="text-muted-foreground">Nenhum registro encontrado</p>
          <p className="text-sm text-muted-foreground/60 mt-1">
            Adicione registros de energia ou água
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
                    <p className="font-mono text-xs">(ICMS Proj. + PIS/COFINS Proj. + IBS + CBS) − (ICMS + PIS/COFINS)</p>
                    <p className="text-muted-foreground text-xs mt-1">
                      Diferença entre impostos projetados e atuais.<br/>
                      <span className="text-green-600 dark:text-green-400">Negativo = Economia</span> | <span className="text-red-600 dark:text-red-400">Positivo = Aumento</span>
                    </p>
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
                      variant={diferencaReal > 0 ? 'destructive' : diferencaReal < 0 ? 'default' : 'secondary'}
                      className={`text-xs ${diferencaReal < 0 ? 'bg-positive text-positive-foreground' : ''}`}
                    >
                      {diferencaReal > 0 ? '+' : ''}
                      {formatCurrency(diferencaReal)}
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

  return (
    <div className="space-y-4 sm:space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-foreground">Energia e Água</h1>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Comparativo PIS+COFINS vs IBS+CBS agregado por Filial e Mês
          </p>
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

      {/* Filters */}
      <Card className="border-border/50">
        <CardContent className="pt-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Filial</Label>
              <Select value={filterFilial} onValueChange={setFilterFilial}>
                <SelectTrigger className="w-[220px]">
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

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Período</Label>
              <Select value={filterMesAno} onValueChange={setFilterMesAno}>
                <SelectTrigger className="w-[140px]">
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

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Ano Projeção</Label>
              <Select value={anoProjecao.toString()} onValueChange={(v) => setAnoProjecao(parseInt(v))}>
                <SelectTrigger className="w-[100px]">
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

      <div className="grid gap-3 sm:gap-4 grid-cols-1 md:grid-cols-2">
        {loading ? (
          <>
            <Card className="border-border/50">
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-48" />
              </CardHeader>
              <CardContent className="space-y-2">
                {Array.from({ length: 12 }).map((_, i) => (
                  <Skeleton key={i} className="h-5 w-full" />
                ))}
              </CardContent>
            </Card>
            <Card className="border-border/50">
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-48" />
              </CardHeader>
              <CardContent className="space-y-2">
                {Array.from({ length: 12 }).map((_, i) => (
                  <Skeleton key={i} className="h-5 w-full" />
                ))}
              </CardContent>
            </Card>
          </>
        ) : (
          <>
            <Card className="border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-2">
                  <ArrowDownRight className="h-3.5 w-3.5" />
                  Total Créditos - Projeção {anoProjecao}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-muted-foreground">Valor (VL_DOC):</span>
                  <span className="text-sm font-bold">{formatCurrency(totaisCreditos.valor)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-muted-foreground">ICMS:</span>
                  <span className="text-sm font-bold">{formatCurrency(totaisCreditos.icms)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-muted-foreground">ICMS Projetado:</span>
                  <span className="text-sm font-bold">{formatCurrency(totaisCreditos.icmsProjetado)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-muted-foreground">PIS+COFINS:</span>
                  <span className="text-sm font-bold text-pis-cofins">{formatCurrency(totaisCreditos.pisCofins)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-muted-foreground">PIS+COFINS Projetado:</span>
                  <span className="text-sm font-bold text-pis-cofins">{formatCurrency(totaisCreditos.pisCofinsProjetado)}</span>
                </div>
                <div className="flex justify-between items-center bg-muted/30 -mx-2 px-2 py-0.5 rounded">
                  <span className="text-[10px] font-medium">Tot. Impostos Atuais:</span>
                  <span className="text-sm font-bold">{formatCurrency(totaisCreditos.totalImpostosAtuais)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-muted-foreground">Base IBS/CBS:</span>
                  <span className="text-sm font-bold">{formatCurrency(totaisCreditos.baseIbsCbs)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-muted-foreground">IBS Projetado:</span>
                  <span className="text-sm font-bold text-ibs-cbs">{formatCurrency(totaisCreditos.ibsProjetado)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-muted-foreground">CBS Projetado:</span>
                  <span className="text-sm font-bold text-ibs-cbs">{formatCurrency(totaisCreditos.cbsProjetado)}</span>
                </div>
                <div className="flex justify-between items-center bg-muted/30 -mx-2 px-2 py-0.5 rounded">
                  <span className="text-[10px] font-medium text-ibs-cbs">Total Reforma:</span>
                  <span className="text-sm font-bold text-ibs-cbs">{formatCurrency(totaisCreditos.totalReforma)}</span>
                </div>
                <div className="flex justify-between items-center bg-muted/30 -mx-2 px-2 py-0.5 rounded">
                  <span className="text-[10px] font-medium">Tot. Créditos:</span>
                  <span className="text-sm font-bold">{formatCurrency(totaisCreditos.totalImpostosPagar)}</span>
                </div>
                <div className="flex justify-between items-center pt-1 border-t">
                  <span className="text-[10px] text-muted-foreground">Dif. deb/cred.:</span>
                  <Badge variant={totaisCreditos.diferencaReal > 0 ? 'destructive' : totaisCreditos.diferencaReal < 0 ? 'default' : 'secondary'} className={totaisCreditos.diferencaReal < 0 ? 'bg-positive text-positive-foreground' : ''}>
                    {totaisCreditos.diferencaReal > 0 ? '+' : ''}{formatCurrency(totaisCreditos.diferencaReal)}
                  </Badge>
                </div>
              </CardContent>
            </Card>

            <Card className="border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-2">
                  <ArrowUpRight className="h-3.5 w-3.5" />
                  Total Débitos - Projeção {anoProjecao}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-muted-foreground">Valor (VL_DOC):</span>
                  <span className="text-sm font-bold">{formatCurrency(totaisDebitos.valor)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-muted-foreground">ICMS:</span>
                  <span className="text-sm font-bold">{formatCurrency(totaisDebitos.icms)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-muted-foreground">ICMS Projetado:</span>
                  <span className="text-sm font-bold">{formatCurrency(totaisDebitos.icmsProjetado)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-muted-foreground">PIS+COFINS:</span>
                  <span className="text-sm font-bold text-pis-cofins">{formatCurrency(totaisDebitos.pisCofins)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-muted-foreground">PIS+COFINS Projetado:</span>
                  <span className="text-sm font-bold text-pis-cofins">{formatCurrency(totaisDebitos.pisCofinsProjetado)}</span>
                </div>
                <div className="flex justify-between items-center bg-muted/30 -mx-2 px-2 py-0.5 rounded">
                  <span className="text-[10px] font-medium">Tot. Impostos Atuais:</span>
                  <span className="text-sm font-bold">{formatCurrency(totaisDebitos.totalImpostosAtuais)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-muted-foreground">Base IBS/CBS:</span>
                  <span className="text-sm font-bold">{formatCurrency(totaisDebitos.baseIbsCbs)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-muted-foreground">IBS Projetado:</span>
                  <span className="text-sm font-bold text-ibs-cbs">{formatCurrency(totaisDebitos.ibsProjetado)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-muted-foreground">CBS Projetado:</span>
                  <span className="text-sm font-bold text-ibs-cbs">{formatCurrency(totaisDebitos.cbsProjetado)}</span>
                </div>
                <div className="flex justify-between items-center bg-muted/30 -mx-2 px-2 py-0.5 rounded">
                  <span className="text-[10px] font-medium text-ibs-cbs">Total Reforma:</span>
                  <span className="text-sm font-bold text-ibs-cbs">{formatCurrency(totaisDebitos.totalReforma)}</span>
                </div>
                <div className="flex justify-between items-center bg-muted/30 -mx-2 px-2 py-0.5 rounded">
                  <span className="text-[10px] font-medium">Tot. Débitos:</span>
                  <span className="text-sm font-bold">{formatCurrency(totaisDebitos.totalImpostosPagar)}</span>
                </div>
                <div className="flex justify-between items-center pt-1 border-t">
                  <span className="text-[10px] text-muted-foreground">Dif. deb/cred.:</span>
                  <Badge variant={totaisDebitos.diferencaReal > 0 ? 'destructive' : totaisDebitos.diferencaReal < 0 ? 'default' : 'secondary'} className={totaisDebitos.diferencaReal < 0 ? 'bg-positive text-positive-foreground' : ''}>
                    {totaisDebitos.diferencaReal > 0 ? '+' : ''}{formatCurrency(totaisDebitos.diferencaReal)}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      <Tabs defaultValue="creditos" className="w-full">
        <TabsList className="grid w-full grid-cols-2 sm:w-auto sm:inline-flex">
          <TabsTrigger value="creditos" className="flex items-center gap-2">
            <ArrowDownRight className="h-4 w-4" />
            Créditos ({creditosAgregados.length})
          </TabsTrigger>
          <TabsTrigger value="debitos" className="flex items-center gap-2">
            <ArrowUpRight className="h-4 w-4" />
            Débitos ({debitosAgregados.length})
          </TabsTrigger>
        </TabsList>
        <TabsContent value="creditos" className="mt-4">
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="text-sm">Créditos de Energia e Água</CardTitle>
              <CardDescription className="text-xs">Agregado por Filial e Mês/Ano</CardDescription>
            </CardHeader>
            <CardContent>
              {renderTable(creditosAgregados, 'credito')}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="debitos" className="mt-4">
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="text-sm">Débitos de Energia e Água</CardTitle>
              <CardDescription className="text-xs">Agregado por Filial e Mês/Ano</CardDescription>
            </CardHeader>
            <CardContent>
              {renderTable(debitosAgregados, 'debito')}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

    </div>
  );
}
