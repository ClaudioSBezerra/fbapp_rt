import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowDownRight, ArrowUpRight, Zap, Filter, Calendar, HelpCircle, Download } from 'lucide-react';
import { exportToExcel } from '@/lib/exportToExcel';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';

interface AggregatedRow {
  filial_id: string;
  filial_nome: string;
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

function cleanFilialName(nome: string): string {
  return nome.replace(/^Filial\s+/i, '');
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${month}/${year}`;
}

function formatCNPJ(cnpj: string): string {
  const cleaned = cnpj.replace(/\D/g, '');
  return cleaned.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
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
          .select('id, cnpj, razao_social, nome_fantasia');

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
    const unique = [...new Set(aggregatedData.map(i => i.mes_ano))];
    return unique.sort((a, b) => b.localeCompare(a));
  }, [aggregatedData]);

  // Filter aggregated data
  const filteredData = useMemo(() => {
    return aggregatedData.filter(i => {
      if (filterFilial !== 'all' && i.filial_id !== filterFilial) return false;
      if (filterMesAno !== 'all' && i.mes_ano !== filterMesAno) return false;
      return true;
    });
  }, [aggregatedData, filterFilial, filterMesAno]);

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
    const baseIbsCbs = valor - icmsProjetado - pisCofinsProjetado;
    const ibsProjetado = aliquota ? baseIbsCbs * ((aliquota.ibs_estadual + aliquota.ibs_municipal) / 100) : 0;
    const cbsProjetado = aliquota ? baseIbsCbs * (aliquota.cbs / 100) : 0;
    
    const totalImpostosAtuais = icms + pisCofins;
    const totalReforma = ibsProjetado + cbsProjetado;
    const diferencaProjetado = totalImpostosAtuais - totalReforma;
    const diferencaReal = (icms + pisCofins) - (icmsProjetado + pisCofinsProjetado + ibsProjetado + cbsProjetado);
    
    return { valor, icms, pisCofins, icmsProjetado, pisCofinsProjetado, baseIbsCbs, ibsProjetado, cbsProjetado, totalImpostosAtuais, totalReforma, diferencaProjetado, diferencaReal };
  }, [creditosAgregados, aliquotaSelecionada]);

  const totaisDebitos = useMemo(() => {
    const valor = debitosAgregados.reduce((acc, i) => acc + i.valor, 0);
    const icms = debitosAgregados.reduce((acc, i) => acc + i.icms, 0);
    const pisCofins = debitosAgregados.reduce((acc, i) => acc + i.pis + i.cofins, 0);
    
    const aliquota = aliquotaSelecionada;
    const icmsProjetado = aliquota ? icms * (1 - (aliquota.reduc_icms / 100)) : icms;
    const pisCofinsProjetado = aliquota ? pisCofins * (1 - (aliquota.reduc_piscofins / 100)) : pisCofins;
    const baseIbsCbs = valor - icmsProjetado - pisCofinsProjetado;
    const ibsProjetado = aliquota ? baseIbsCbs * ((aliquota.ibs_estadual + aliquota.ibs_municipal) / 100) : 0;
    const cbsProjetado = aliquota ? baseIbsCbs * (aliquota.cbs / 100) : 0;
    const totalImpostosAtuais = icms + pisCofins;
    const totalReforma = ibsProjetado + cbsProjetado;
    const diferencaProjetado = totalImpostosAtuais - totalReforma;
    const diferencaReal = (icms + pisCofins) - (icmsProjetado + pisCofinsProjetado + ibsProjetado + cbsProjetado);
    
    return { valor, icms, pisCofins, icmsProjetado, pisCofinsProjetado, baseIbsCbs, ibsProjetado, cbsProjetado, totalImpostosAtuais, totalReforma, diferencaProjetado, diferencaReal };
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
      const baseIbsCbs = row.valor - vlIcmsProjetado - vlPisCofinsProjetado;
      const vlIbsProjetado = aliquota ? baseIbsCbs * ((aliquota.ibs_estadual + aliquota.ibs_municipal) / 100) : 0;
      const vlCbsProjetado = aliquota ? baseIbsCbs * (aliquota.cbs / 100) : 0;
      const totalReforma = vlIbsProjetado + vlCbsProjetado;
      const diferencaProjetado = totalImpostosAtuais - totalReforma;
      const diferencaReal = (vlIcms + vlPisCofins) - (vlIcmsProjetado + vlPisCofinsProjetado + vlIbsProjetado + vlCbsProjetado);

      return {
        'Tipo Operação': row.tipo_operacao === 'credito' ? 'Crédito' : 'Débito',
        'Tipo Serviço': row.tipo_servico === 'energia' ? 'Energia' : 'Água',
        'Filial': cleanFilialName(row.filial_nome),
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
        'Diferença Projetado': diferencaProjetado,
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
              <TableHead className="text-right text-xs">
                <Tooltip>
                  <TooltipTrigger className="cursor-help underline decoration-dotted decoration-muted-foreground inline-flex items-center gap-1 whitespace-nowrap">
                    Dif. Projetado
                    <HelpCircle className="h-3 w-3 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs">
                    <p className="font-semibold mb-1">Fórmula:</p>
                    <p className="font-mono text-xs">(ICMS + PIS/COFINS) − (IBS + CBS)</p>
                    <p className="text-muted-foreground text-xs mt-1">Compara impostos atuais com os novos impostos da reforma</p>
                  </TooltipContent>
                </Tooltip>
              </TableHead>
              <TableHead className="text-right text-xs">
                <Tooltip>
                  <TooltipTrigger className="cursor-help underline decoration-dotted decoration-muted-foreground inline-flex items-center gap-1 whitespace-nowrap">
                    Dif. Real
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
              const baseIbsCbs = row.valor - vlIcmsProjetado - vlPisCofinsProjetado;
              const vlIbsProjetado = aliquota ? baseIbsCbs * ((aliquota.ibs_estadual + aliquota.ibs_municipal) / 100) : 0;
              const vlCbsProjetado = aliquota ? baseIbsCbs * (aliquota.cbs / 100) : 0;
              const totalReforma = vlIbsProjetado + vlCbsProjetado;
              const diferencaProjetado = totalImpostosAtuais - totalReforma;
              const diferencaReal = (vlIcms + vlPisCofins) - (vlIcmsProjetado + vlPisCofinsProjetado + vlIbsProjetado + vlCbsProjetado);

              return (
                <TableRow key={`${row.filial_id}-${row.mes_ano}-${index}`} className="text-xs">
                  <TableCell className="font-medium text-xs whitespace-nowrap py-1 px-2">{cleanFilialName(row.filial_nome)}</TableCell>
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
                  <TableCell className="text-right">
                    <Badge
                      variant={diferencaProjetado > 0 ? 'destructive' : diferencaProjetado < 0 ? 'default' : 'secondary'}
                      className={`text-xs ${diferencaProjetado < 0 ? 'bg-positive text-positive-foreground' : ''}`}
                    >
                      {diferencaProjetado > 0 ? '+' : ''}
                      {formatCurrency(diferencaProjetado)}
                    </Badge>
                  </TableCell>
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
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Energia e Água</h1>
          <p className="text-muted-foreground">
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
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Filtros:</span>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-sm">Filial:</Label>
              <Select value={filterFilial} onValueChange={setFilterFilial}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {filiais.map((filial) => (
                    <SelectItem key={filial.id} value={filial.id}>
                      {filial.nome_fantasia || filial.razao_social}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-sm">Mês/Ano:</Label>
              <Select value={filterMesAno} onValueChange={setFilterMesAno}>
                <SelectTrigger className="w-[150px]">
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
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <Label className="text-sm">Ano Projeção:</Label>
              <Select value={anoProjecao.toString()} onValueChange={(v) => setAnoProjecao(parseInt(v))}>
                <SelectTrigger className="w-[120px]">
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

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <ArrowDownRight className="h-4 w-4" />
              Total Créditos - Projeção {anoProjecao}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Valor (VL_DOC):</span>
              <span className="text-lg font-bold">{formatCurrency(totaisCreditos.valor)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">ICMS:</span>
              <span className="text-lg font-bold">{formatCurrency(totaisCreditos.icms)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">ICMS Projetado:</span>
              <span className="text-lg font-bold">{formatCurrency(totaisCreditos.icmsProjetado)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">PIS+COFINS:</span>
              <span className="text-lg font-bold text-pis-cofins">{formatCurrency(totaisCreditos.pisCofins)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">PIS+COFINS Projetado:</span>
              <span className="text-lg font-bold text-pis-cofins">{formatCurrency(totaisCreditos.pisCofinsProjetado)}</span>
            </div>
            <div className="flex justify-between items-center bg-muted/30 -mx-2 px-2 py-1 rounded">
              <span className="text-sm font-medium">Tot. Impostos Atuais:</span>
              <span className="text-lg font-bold">{formatCurrency(totaisCreditos.totalImpostosAtuais)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Base IBS/CBS:</span>
              <span className="text-lg font-bold">{formatCurrency(totaisCreditos.baseIbsCbs)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">IBS Projetado:</span>
              <span className="text-lg font-bold text-ibs-cbs">{formatCurrency(totaisCreditos.ibsProjetado)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">CBS Projetado:</span>
              <span className="text-lg font-bold text-ibs-cbs">{formatCurrency(totaisCreditos.cbsProjetado)}</span>
            </div>
            <div className="flex justify-between items-center bg-muted/30 -mx-2 px-2 py-1 rounded">
              <span className="text-sm font-medium text-ibs-cbs">Total Reforma:</span>
              <span className="text-lg font-bold text-ibs-cbs">{formatCurrency(totaisCreditos.totalReforma)}</span>
            </div>
            <div className="flex justify-between items-center pt-2 border-t">
              <span className="text-sm text-muted-foreground">Dif. Projetado:</span>
              <Badge variant={totaisCreditos.diferencaProjetado > 0 ? 'destructive' : totaisCreditos.diferencaProjetado < 0 ? 'default' : 'secondary'} className={totaisCreditos.diferencaProjetado < 0 ? 'bg-positive text-positive-foreground' : ''}>
                {totaisCreditos.diferencaProjetado > 0 ? '+' : ''}{formatCurrency(totaisCreditos.diferencaProjetado)}
              </Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Dif. Real:</span>
              <Badge variant={totaisCreditos.diferencaReal > 0 ? 'destructive' : totaisCreditos.diferencaReal < 0 ? 'default' : 'secondary'} className={totaisCreditos.diferencaReal < 0 ? 'bg-positive text-positive-foreground' : ''}>
                {totaisCreditos.diferencaReal > 0 ? '+' : ''}{formatCurrency(totaisCreditos.diferencaReal)}
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <ArrowUpRight className="h-4 w-4" />
              Total Débitos - Projeção {anoProjecao}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Valor (VL_DOC):</span>
              <span className="text-lg font-bold">{formatCurrency(totaisDebitos.valor)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">ICMS:</span>
              <span className="text-lg font-bold">{formatCurrency(totaisDebitos.icms)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">ICMS Projetado:</span>
              <span className="text-lg font-bold">{formatCurrency(totaisDebitos.icmsProjetado)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">PIS+COFINS:</span>
              <span className="text-lg font-bold text-pis-cofins">{formatCurrency(totaisDebitos.pisCofins)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">PIS+COFINS Projetado:</span>
              <span className="text-lg font-bold text-pis-cofins">{formatCurrency(totaisDebitos.pisCofinsProjetado)}</span>
            </div>
            <div className="flex justify-between items-center bg-muted/30 -mx-2 px-2 py-1 rounded">
              <span className="text-sm font-medium">Tot. Impostos Atuais:</span>
              <span className="text-lg font-bold">{formatCurrency(totaisDebitos.totalImpostosAtuais)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Base IBS/CBS:</span>
              <span className="text-lg font-bold">{formatCurrency(totaisDebitos.baseIbsCbs)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">IBS Projetado:</span>
              <span className="text-lg font-bold text-ibs-cbs">{formatCurrency(totaisDebitos.ibsProjetado)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">CBS Projetado:</span>
              <span className="text-lg font-bold text-ibs-cbs">{formatCurrency(totaisDebitos.cbsProjetado)}</span>
            </div>
            <div className="flex justify-between items-center bg-muted/30 -mx-2 px-2 py-1 rounded">
              <span className="text-sm font-medium text-ibs-cbs">Total Reforma:</span>
              <span className="text-lg font-bold text-ibs-cbs">{formatCurrency(totaisDebitos.totalReforma)}</span>
            </div>
            <div className="flex justify-between items-center pt-2 border-t">
              <span className="text-sm text-muted-foreground">Dif. Projetado:</span>
              <Badge variant={totaisDebitos.diferencaProjetado > 0 ? 'destructive' : totaisDebitos.diferencaProjetado < 0 ? 'default' : 'secondary'} className={totaisDebitos.diferencaProjetado < 0 ? 'bg-positive text-positive-foreground' : ''}>
                {totaisDebitos.diferencaProjetado > 0 ? '+' : ''}{formatCurrency(totaisDebitos.diferencaProjetado)}
              </Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Dif. Real:</span>
              <Badge variant={totaisDebitos.diferencaReal > 0 ? 'destructive' : totaisDebitos.diferencaReal < 0 ? 'default' : 'secondary'} className={totaisDebitos.diferencaReal < 0 ? 'bg-positive text-positive-foreground' : ''}>
                {totaisDebitos.diferencaReal > 0 ? '+' : ''}{formatCurrency(totaisDebitos.diferencaReal)}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="creditos" className="w-full">
        <TabsList className="grid w-full grid-cols-2 max-w-md">
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
              <CardTitle className="text-lg">Créditos de Energia e Água</CardTitle>
              <CardDescription>Agregado por Filial e Mês/Ano</CardDescription>
            </CardHeader>
            <CardContent>
              {renderTable(creditosAgregados, 'credito')}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="debitos" className="mt-4">
          <Card className="border-border/50">
            <CardHeader>
              <CardTitle className="text-lg">Débitos de Energia e Água</CardTitle>
              <CardDescription>Agregado por Filial e Mês/Ano</CardDescription>
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
