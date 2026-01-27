import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from '@/components/ui/pagination';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Download, Users, HelpCircle, ChevronsUpDown, Check, ArrowDownRight, ArrowUpRight, RefreshCw, Upload } from 'lucide-react';
import { SimplesNacionalImport } from '@/components/SimplesNacionalImport';
import { exportToExcel } from '@/lib/exportToExcel';
import { cn } from '@/lib/utils';
import { formatDocumentoMasked } from '@/lib/formatFilial';

interface Aliquota {
  ano: number;
  ibs_estadual: number;
  ibs_municipal: number;
  cbs: number;
  reduc_icms: number;
  reduc_piscofins: number;
}

interface ParticipanteRow {
  filial_id: string;
  filial_cod_est?: string | null;
  filial_cnpj?: string | null;
  cod_part: string;
  participante_nome: string;
  participante_cnpj: string | null;
  mes_ano: string;
  valor: number;
  pis: number;
  cofins: number;
  icms: number;
  tipo: string;
  is_simples: boolean;
}

interface TotalsFromBackend {
  total_registros: number;
  total_valor: number;
  total_entradas_valor: number;
  total_entradas_pis: number;
  total_entradas_cofins: number;
  total_entradas_icms: number;
  total_saidas_valor: number;
  total_saidas_pis: number;
  total_saidas_cofins: number;
  total_saidas_icms: number;
}

// Formata moeda BRL
const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
};

// Formata documento (CPF ou CNPJ) - usa função centralizada
const formatDocumento = (doc: string | null) => {
  if (!doc) return '-';
  return formatDocumentoMasked(doc);
};

// Parse manual para evitar bug de timezone
const formatMesAno = (date: string) => {
  if (!date) return '-';
  const parts = date.split('-');
  if (parts.length >= 2) {
    return `${parts[1]}/${parts[0]}`;
  }
  return date;
};

// Componente de tabela por participante
interface ParticipanteTableProps {
  data: ParticipanteRow[];
  tipo: 'entrada' | 'saida';
  aliquotas: Aliquota[];
  selectedYear: number;
  isLoading: boolean;
}

function ParticipanteTable({ data, tipo, aliquotas, selectedYear, isLoading }: ParticipanteTableProps) {
  // Filtrar pelo tipo
  const filteredData = data.filter(row => row.tipo === tipo);
  
  // Ordenar por valor (maior para menor)
  const sortedData = useMemo(() => 
    [...filteredData].sort((a, b) => b.valor - a.valor),
    [filteredData]
  );

  // Buscar alíquota do ano selecionado
  const aliquota = aliquotas.find(a => a.ano === selectedYear);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  if (sortedData.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        Nenhum dado de {tipo === 'entrada' ? 'entradas' : 'saídas'} por participante encontrado.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="text-xs">
            <TableHead className="text-xs">Participante</TableHead>
            <TableHead className="text-xs whitespace-nowrap">Mês/Ano</TableHead>
            <TableHead className="text-center text-xs">Simples</TableHead>
            <TableHead className="text-right text-xs">Valor</TableHead>
            <TableHead className="text-right text-xs">ICMS</TableHead>
            <TableHead className="text-right text-xs whitespace-nowrap">
              ICMS Proj. {aliquota && <span className="text-muted-foreground font-normal">(-{aliquota.reduc_icms}%)</span>}
            </TableHead>
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
          {sortedData.map((row, idx) => {
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
              <TableRow key={`${row.cod_part}-${row.mes_ano}-${idx}`} className="text-xs">
                <TableCell className="py-1 px-2 max-w-[200px]">
                  <div className="flex items-center gap-1">
                    {row.cod_part === '9999999999' && (
                      <Badge variant="secondary" className="text-[8px] px-1 py-0 shrink-0 bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100">
                        CF
                      </Badge>
                    )}
                    {row.cod_part === '8888888888' && (
                      <Badge variant="secondary" className="text-[8px] px-1 py-0 shrink-0 bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100">
                        FNI
                      </Badge>
                    )}
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="block text-[10px] leading-tight truncate cursor-help">
                          {row.participante_nome}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="right" className="max-w-xs">
                        <p className="text-xs font-medium">{row.participante_nome}</p>
                        <p className="text-xs text-muted-foreground">
                          Código: {row.cod_part}
                        </p>
                        {row.participante_cnpj && row.cod_part !== '9999999999' && row.cod_part !== '8888888888' && (
                          <p className="text-xs text-muted-foreground">
                            CPF/CNPJ: {formatDocumento(row.participante_cnpj)}
                          </p>
                        )}
                        {row.cod_part === '9999999999' && (
                          <p className="text-xs text-amber-600 mt-1">
                            Vendas agregadas a consumidor final
                          </p>
                        )}
                        {row.cod_part === '8888888888' && (
                          <p className="text-xs text-blue-600 mt-1">
                            Compras com fornecedor não identificado no EFD
                          </p>
                        )}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </TableCell>
                <TableCell className="text-xs whitespace-nowrap">{formatMesAno(row.mes_ano)}</TableCell>
                <TableCell className="text-center text-xs">
                  {row.is_simples ? <Badge variant="secondary" className="text-[10px] h-4 px-1">Sim</Badge> : '-'}
                </TableCell>
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
                    {diferencaReal > 0 ? '+' : ''}{formatCurrency(diferencaReal)}
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

const PAGE_SIZE = 100;

// Componente principal
export default function MercadoriasParticipante() {
  const queryClient = useQueryClient();
  const [filterMesAno, setFilterMesAno] = useState<string>('all');
  const [filterParticipante, setFilterParticipante] = useState('');
  const [filterSimples, setFilterSimples] = useState<string>('all');
  const [selectedYear, setSelectedYear] = useState(2027);
  const [openCombobox, setOpenCombobox] = useState(false);
  const [page, setPage] = useState(1);

  // Buscar alíquotas
  const { data: aliquotas = [] } = useQuery({
    queryKey: ['aliquotas'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('aliquotas')
        .select('ano, ibs_estadual, ibs_municipal, cbs, reduc_icms, reduc_piscofins')
        .order('ano');
      if (error) throw error;
      return data as Aliquota[];
    }
  });

  // Parâmetros de filtro para as queries
  const mesAnoParam = filterMesAno === 'all' ? null : filterMesAno;
  const participanteParam = filterParticipante || null;
  const simplesParam = filterSimples === 'all' ? null : filterSimples === 'sim';

  // Buscar TOTAIS do backend (1 linha, sem limite)
  const { data: backendTotals, isLoading: isLoadingTotals } = useQuery({
    queryKey: ['mercadorias-participante-totals', mesAnoParam, participanteParam, simplesParam],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_mercadorias_participante_totals', {
        p_mes_ano: mesAnoParam,
        p_participante: participanteParam,
        p_only_simples: simplesParam
      });
      if (error) throw error;
      return (data && data.length > 0 ? data[0] : null) as TotalsFromBackend | null;
    }
  });

  // Buscar dados paginados para a listagem (máximo 1000 registros no backend)
  const { data: participanteData = [], isLoading: isLoadingPage } = useQuery({
    queryKey: ['mercadorias-participante-page', mesAnoParam, participanteParam, simplesParam, page],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_mercadorias_participante_page', {
        p_limit: PAGE_SIZE,
        p_offset: (page - 1) * PAGE_SIZE,
        p_mes_ano: mesAnoParam,
        p_participante: participanteParam,
        p_only_simples: simplesParam
      });
      if (error) throw error;
      // Mapear resultado para interface esperada (ordem diferente no backend)
      return ((data || []) as Array<{
        cod_part: string;
        cofins: number;
        filial_id: string;
        icms: number;
        mes_ano: string;
        participante_cnpj: string | null;
        participante_nome: string;
        pis: number;
        tipo: string;
        valor: number;
        is_simples: boolean;
      }>).map(row => ({
        filial_id: row.filial_id,
        filial_cod_est: (row as any).filial_cod_est || null,
        filial_cnpj: (row as any).filial_cnpj || null,
        cod_part: row.cod_part,
        participante_nome: row.participante_nome,
        participante_cnpj: row.participante_cnpj,
        mes_ano: row.mes_ano,
        valor: row.valor,
        pis: row.pis,
        cofins: row.cofins,
        icms: row.icms,
        tipo: row.tipo,
        is_simples: row.is_simples
      })) as ParticipanteRow[];
    }
  });

  // Buscar meses disponíveis (função otimizada - retorna apenas meses únicos)
  const { data: mesesDisponiveis = [] } = useQuery({
    queryKey: ['participante-meses'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_mercadorias_participante_meses');
      if (error) throw error;
      return (data || []).map((r: { mes_ano: string }) => r.mes_ano);
    }
  });

  // Buscar participantes únicos (função otimizada - retorna apenas participantes distintos)
  const { data: participantesUnicos = [] } = useQuery({
    queryKey: ['participante-lista'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_mercadorias_participante_lista');
      if (error) throw error;
      return (data || []) as { cod_part: string; nome: string; cnpj: string | null }[];
    }
  });

  // Anos disponíveis para projeção
  const anosDisponiveis = useMemo(() => aliquotas.map(a => a.ano), [aliquotas]);

  // Buscar alíquota selecionada
  const aliquotaSelecionada = useMemo(() => {
    return aliquotas.find((a) => a.ano === selectedYear) || null;
  }, [aliquotas, selectedYear]);

  // Totais calculados a partir do backend
  const totals = useMemo(() => {
    const calcTotals = (valor: number, icms: number, pis: number, cofins: number) => {
      const pisCofins = pis + cofins;
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
      
      return { 
        valor, 
        icms, 
        pisCofins, 
        icmsProjetado, 
        pisCofinsProjetado, 
        baseIbsCbs, 
        ibsProjetado, 
        cbsProjetado, 
        totalImpostosAtuais, 
        totalReforma, 
        totalImpostosPagar, 
        diferencaProjetado, 
        diferencaReal 
      };
    };
    
    if (!backendTotals) {
      return { 
        entradas: calcTotals(0, 0, 0, 0), 
        saidas: calcTotals(0, 0, 0, 0),
        totalRegistros: 0
      };
    }

    return { 
      entradas: calcTotals(
        backendTotals.total_entradas_valor,
        backendTotals.total_entradas_icms,
        backendTotals.total_entradas_pis,
        backendTotals.total_entradas_cofins
      ), 
      saidas: calcTotals(
        backendTotals.total_saidas_valor,
        backendTotals.total_saidas_icms,
        backendTotals.total_saidas_pis,
        backendTotals.total_saidas_cofins
      ),
      totalRegistros: backendTotals.total_registros
    };
  }, [backendTotals, aliquotaSelecionada]);

  // Total de páginas
  const totalPages = Math.ceil((totals.totalRegistros || 0) / PAGE_SIZE);

  // Reset page quando filtros mudam
  const handleFilterChange = (setter: (v: string) => void, value: string) => {
    setter(value);
    setPage(1);
  };

  // Exportar para Excel com todas as colunas (busca todos os dados)
  const handleExport = async () => {
    const aliquota = aliquotaSelecionada;
    
    // Buscar TODOS os dados para exportação (sem paginação)
    const { data: allData, error } = await supabase.rpc('get_mercadorias_participante_page', {
      p_limit: 100000,
      p_offset: 0,
      p_mes_ano: mesAnoParam,
      p_participante: participanteParam
    });
    
    if (error || !allData) {
      console.error('Erro ao exportar:', error);
      return;
    }

    const exportData = allData.map((row: ParticipanteRow) => {
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

      return {
        'Participante': row.participante_nome,
        'CPF/CNPJ': formatDocumento(row.participante_cnpj),
        'Tipo': row.tipo === 'entrada' ? 'Entrada' : 'Saída',
        'Mês/Ano': formatMesAno(row.mes_ano),
        'Valor': row.valor,
        'ICMS': vlIcms,
        'ICMS Proj.': vlIcmsProjetado,
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
    exportToExcel(exportData, 'mercadorias-participante');
  };

  // Contagem por tipo na página atual
  const entradasNaPagina = participanteData.filter(r => r.tipo === 'entrada').length;
  const saidasNaPagina = participanteData.filter(r => r.tipo === 'saida').length;

  const isLoading = isLoadingTotals || isLoadingPage;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="h-6 w-6" />
            Mercadorias por Participante
          </h1>
          <p className="text-muted-foreground text-sm">
            Comparativo PIS+COFINS vs IBS+CBS agregado por parceiro comercial
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ['mercadorias-participante-totals'] });
              queryClient.invalidateQueries({ queryKey: ['mercadorias-participante-page'] });
              queryClient.invalidateQueries({ queryKey: ['mercadorias-participante-meses'] });
            }}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Atualizar
          </Button>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Upload className="h-4 w-4 mr-2" />
                Importar Simples
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px]">
              <DialogHeader>
                <DialogTitle>Importar Simples Nacional</DialogTitle>
              </DialogHeader>
              <SimplesNacionalImport />
            </DialogContent>
          </Dialog>
          <Button variant="outline" onClick={handleExport} disabled={totals.totalRegistros === 0}>
            <Download className="h-4 w-4 mr-2" />
            Exportar Excel
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-end gap-4">
            {/* Filtro Mês/Ano */}
            <div className="space-y-1">
              <Label className="text-xs">Mês/Ano</Label>
              <Select value={filterMesAno} onValueChange={(v) => handleFilterChange(setFilterMesAno, v)}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {mesesDisponiveis.map(mes => (
                    <SelectItem key={mes} value={mes}>
                      {formatMesAno(mes)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Filtro Simples Nacional */}
            <div className="space-y-1">
              <Label className="text-xs">Simples Nacional</Label>
              <Select value={filterSimples} onValueChange={(v) => handleFilterChange(setFilterSimples, v)}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="sim">Sim</SelectItem>
                  <SelectItem value="nao">Não</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Filtro Participante - Combobox */}
            <div className="space-y-1 flex-1 min-w-[200px] max-w-[400px]">
              <Label className="text-xs">Participante</Label>
              <Popover open={openCombobox} onOpenChange={setOpenCombobox}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={openCombobox}
                    className="w-full justify-between font-normal"
                  >
                    <span className="truncate">
                      {filterParticipante || "Todos os participantes"}
                    </span>
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[400px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Buscar participante..." />
                    <CommandList>
                      <CommandEmpty>Nenhum participante encontrado.</CommandEmpty>
                      <CommandGroup>
                        <CommandItem 
                          value="todos"
                          onSelect={() => {
                            handleFilterChange(setFilterParticipante, '');
                            setOpenCombobox(false);
                          }}
                        >
                          <Check className={cn("mr-2 h-4 w-4", filterParticipante === '' ? "opacity-100" : "opacity-0")} />
                          Todos os participantes
                        </CommandItem>
                        {participantesUnicos.map((participante) => (
                          <CommandItem
                            key={participante.cod_part}
                            value={`${participante.nome} ${participante.cnpj || ''}`}
                            onSelect={() => {
                              handleFilterChange(setFilterParticipante, participante.nome);
                              setOpenCombobox(false);
                            }}
                          >
                            <Check className={cn("mr-2 h-4 w-4", filterParticipante === participante.nome ? "opacity-100" : "opacity-0")} />
                            <span className="truncate flex-1">{participante.nome}</span>
                            {participante.cnpj && (
                              <span className="ml-2 text-xs text-muted-foreground shrink-0">
                                {formatDocumento(participante.cnpj)}
                              </span>
                            )}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            {/* Ano de Projeção */}
            <div className="space-y-1">
              <Label className="text-xs">Ano Projeção</Label>
              <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(Number(v))}>
                <SelectTrigger className="w-[100px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {anosDisponiveis.map(ano => (
                    <SelectItem key={ano} value={String(ano)}>{ano}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cards de Resumo - Formato detalhado igual Mercadorias */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-2">
              <ArrowDownRight className="h-3.5 w-3.5" /> Total Entradas (Créditos) - Projeção {selectedYear}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-muted-foreground">Valor (VL_DOC):</span>
              <span className="text-sm font-bold">{formatCurrency(totals.entradas.valor)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-muted-foreground">ICMS:</span>
              <span className="text-sm font-bold">{formatCurrency(totals.entradas.icms)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-muted-foreground">ICMS Projetado:</span>
              <span className="text-sm font-bold">{formatCurrency(totals.entradas.icmsProjetado)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-muted-foreground">PIS+COFINS:</span>
              <span className="text-sm font-bold text-pis-cofins">{formatCurrency(totals.entradas.pisCofins)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-muted-foreground">PIS+COFINS Projetado:</span>
              <span className="text-sm font-bold text-pis-cofins">{formatCurrency(totals.entradas.pisCofinsProjetado)}</span>
            </div>
            <div className="flex justify-between items-center bg-muted/30 -mx-2 px-2 py-0.5 rounded">
              <span className="text-[10px] font-medium">Tot. Impostos Atuais:</span>
              <span className="text-sm font-bold">{formatCurrency(totals.entradas.totalImpostosAtuais)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-muted-foreground">Base IBS/CBS:</span>
              <span className="text-sm font-bold">{formatCurrency(totals.entradas.baseIbsCbs)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-muted-foreground">IBS Projetado:</span>
              <span className="text-sm font-bold text-ibs-cbs">{formatCurrency(totals.entradas.ibsProjetado)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-muted-foreground">CBS Projetado:</span>
              <span className="text-sm font-bold text-ibs-cbs">{formatCurrency(totals.entradas.cbsProjetado)}</span>
            </div>
            <div className="flex justify-between items-center bg-muted/30 -mx-2 px-2 py-0.5 rounded">
              <span className="text-[10px] font-medium text-ibs-cbs">Total Reforma:</span>
              <span className="text-sm font-bold text-ibs-cbs">{formatCurrency(totals.entradas.totalReforma)}</span>
            </div>
            <div className="flex justify-between items-center bg-muted/30 -mx-2 px-2 py-0.5 rounded">
              <span className="text-[10px] font-medium">Tot. Créditos:</span>
              <span className="text-sm font-bold">{formatCurrency(totals.entradas.totalImpostosPagar)}</span>
            </div>
            <div className="flex justify-between items-center pt-1 border-t">
              <span className="text-[10px] text-muted-foreground">Dif. deb/cred.:</span>
              <Badge variant={totals.entradas.diferencaReal > 0 ? 'destructive' : totals.entradas.diferencaReal < 0 ? 'default' : 'secondary'} className={totals.entradas.diferencaReal < 0 ? 'bg-positive text-positive-foreground' : ''}>
                {totals.entradas.diferencaReal > 0 ? '+' : ''}{formatCurrency(totals.entradas.diferencaReal)}
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-2">
              <ArrowUpRight className="h-3.5 w-3.5" /> Total Saídas (Débitos) - Projeção {selectedYear}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-muted-foreground">Valor (VL_DOC):</span>
              <span className="text-sm font-bold">{formatCurrency(totals.saidas.valor)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-muted-foreground">ICMS:</span>
              <span className="text-sm font-bold">{formatCurrency(totals.saidas.icms)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-muted-foreground">ICMS Projetado:</span>
              <span className="text-sm font-bold">{formatCurrency(totals.saidas.icmsProjetado)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-muted-foreground">PIS+COFINS:</span>
              <span className="text-sm font-bold text-pis-cofins">{formatCurrency(totals.saidas.pisCofins)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-muted-foreground">PIS+COFINS Projetado:</span>
              <span className="text-sm font-bold text-pis-cofins">{formatCurrency(totals.saidas.pisCofinsProjetado)}</span>
            </div>
            <div className="flex justify-between items-center bg-muted/30 -mx-2 px-2 py-0.5 rounded">
              <span className="text-[10px] font-medium">Tot. Impostos Atuais:</span>
              <span className="text-sm font-bold">{formatCurrency(totals.saidas.totalImpostosAtuais)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-muted-foreground">Base IBS/CBS:</span>
              <span className="text-sm font-bold">{formatCurrency(totals.saidas.baseIbsCbs)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-muted-foreground">IBS Projetado:</span>
              <span className="text-sm font-bold text-ibs-cbs">{formatCurrency(totals.saidas.ibsProjetado)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-muted-foreground">CBS Projetado:</span>
              <span className="text-sm font-bold text-ibs-cbs">{formatCurrency(totals.saidas.cbsProjetado)}</span>
            </div>
            <div className="flex justify-between items-center bg-muted/30 -mx-2 px-2 py-0.5 rounded">
              <span className="text-[10px] font-medium text-ibs-cbs">Total Reforma:</span>
              <span className="text-sm font-bold text-ibs-cbs">{formatCurrency(totals.saidas.totalReforma)}</span>
            </div>
            <div className="flex justify-between items-center bg-muted/30 -mx-2 px-2 py-0.5 rounded">
              <span className="text-[10px] font-medium">Tot. Débitos:</span>
              <span className="text-sm font-bold">{formatCurrency(totals.saidas.totalImpostosPagar)}</span>
            </div>
            <div className="flex justify-between items-center pt-1 border-t">
              <span className="text-[10px] text-muted-foreground">Dif. deb/cred.:</span>
              <Badge variant={totals.saidas.diferencaReal > 0 ? 'destructive' : totals.saidas.diferencaReal < 0 ? 'default' : 'secondary'} className={totals.saidas.diferencaReal < 0 ? 'bg-positive text-positive-foreground' : ''}>
                {totals.saidas.diferencaReal > 0 ? '+' : ''}{formatCurrency(totals.saidas.diferencaReal)}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabs Entradas/Saídas */}
      <Card>
        <CardContent className="pt-4">
          <Tabs defaultValue="entradas">
            <TabsList>
              <TabsTrigger value="entradas">
                Entradas ({entradasNaPagina} na página)
              </TabsTrigger>
              <TabsTrigger value="saidas">
                Saídas ({saidasNaPagina} na página)
              </TabsTrigger>
            </TabsList>
            <TabsContent value="entradas" className="mt-4">
              <ParticipanteTable
                data={participanteData}
                tipo="entrada"
                aliquotas={aliquotas}
                selectedYear={selectedYear}
                isLoading={isLoading}
              />
            </TabsContent>
            <TabsContent value="saidas" className="mt-4">
              <ParticipanteTable
                data={participanteData}
                tipo="saida"
                aliquotas={aliquotas}
                selectedYear={selectedYear}
                isLoading={isLoading}
              />
            </TabsContent>
          </Tabs>

          {/* Paginação */}
          {totalPages > 1 && (
            <div className="mt-4 flex justify-center">
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious 
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      className={page === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                    />
                  </PaginationItem>
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum: number;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (page <= 3) {
                      pageNum = i + 1;
                    } else if (page >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = page - 2 + i;
                    }
                    return (
                      <PaginationItem key={pageNum}>
                        <PaginationLink
                          onClick={() => setPage(pageNum)}
                          isActive={page === pageNum}
                          className="cursor-pointer"
                        >
                          {pageNum}
                        </PaginationLink>
                      </PaginationItem>
                    );
                  })}
                  <PaginationItem>
                    <PaginationNext 
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      className={page === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
