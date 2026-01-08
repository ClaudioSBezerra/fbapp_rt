import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
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
import { Download, Users, HelpCircle, ChevronsUpDown, Check, ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { exportToExcel } from '@/lib/exportToExcel';
import { cn } from '@/lib/utils';

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
  cod_part: string;
  participante_nome: string;
  participante_cnpj: string | null;
  mes_ano: string;
  valor: number;
  pis: number;
  cofins: number;
  icms: number;
  tipo: string;
}

// Formata moeda BRL
const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
};

// Formata CNPJ
const formatCNPJ = (cnpj: string | null) => {
  if (!cnpj) return '-';
  return cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
};

// Formata data para MM/YYYY
const formatMesAno = (date: string) => {
  const d = new Date(date);
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
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
            <TableHead className="text-right text-xs font-semibold bg-muted/30 whitespace-nowrap">Tot. Imp. a pagar</TableHead>
            <TableHead className="text-right text-xs">
              <Tooltip>
                <TooltipTrigger className="cursor-help underline decoration-dotted decoration-muted-foreground inline-flex items-center gap-1 whitespace-nowrap">
                  Dif. Imp. Atual e Imp. Proj.
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
                  Dif. a pagar
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
            const baseIbsCbs = row.valor - vlIcmsProjetado - vlPisCofinsProjetado;
            const vlIbsProjetado = aliquota ? baseIbsCbs * ((aliquota.ibs_estadual + aliquota.ibs_municipal) / 100) : 0;
            const vlCbsProjetado = aliquota ? baseIbsCbs * (aliquota.cbs / 100) : 0;
            const totalReforma = vlIbsProjetado + vlCbsProjetado;
            const totalImpostosPagar = vlIcmsProjetado + vlPisCofinsProjetado + vlIbsProjetado + vlCbsProjetado;
            const diferencaProjetado = totalImpostosAtuais - totalReforma;
            const diferencaReal = totalImpostosPagar - (vlIcms + vlPisCofins);

            return (
              <TableRow key={`${row.cod_part}-${row.mes_ano}-${idx}`} className="text-xs">
                <TableCell className="py-1 px-2 max-w-[200px]">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="block text-[10px] leading-tight truncate cursor-help">
                        {row.participante_nome}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-xs">
                      <p className="text-xs">{row.participante_nome}</p>
                      {row.participante_cnpj && (
                        <p className="text-xs text-muted-foreground mt-1">
                          CNPJ: {formatCNPJ(row.participante_cnpj)}
                        </p>
                      )}
                    </TooltipContent>
                  </Tooltip>
                </TableCell>
                <TableCell className="text-xs whitespace-nowrap">{formatMesAno(row.mes_ano)}</TableCell>
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
                    variant={diferencaProjetado > 0 ? 'destructive' : diferencaProjetado < 0 ? 'default' : 'secondary'}
                    className={`text-xs ${diferencaProjetado < 0 ? 'bg-positive text-positive-foreground' : ''}`}
                  >
                    {diferencaProjetado > 0 ? '+' : ''}{formatCurrency(diferencaProjetado)}
                  </Badge>
                </TableCell>
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

// Componente principal
export default function MercadoriasParticipante() {
  const [filterMesAno, setFilterMesAno] = useState<string>('all');
  const [filterParticipante, setFilterParticipante] = useState('');
  const [selectedYear, setSelectedYear] = useState(2027);
  const [openCombobox, setOpenCombobox] = useState(false);

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

  // Buscar dados agregados por participante
  const { data: participanteData = [], isLoading } = useQuery({
    queryKey: ['mercadorias-participante'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_mv_mercadorias_participante');
      if (error) throw error;
      return (data || []) as ParticipanteRow[];
    }
  });

  // Extrair meses/anos únicos para filtro
  const mesesDisponiveis = useMemo(() => {
    const unique = [...new Set(participanteData.map(r => r.mes_ano))];
    return unique.sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
  }, [participanteData]);

  // Anos disponíveis para projeção
  const anosDisponiveis = useMemo(() => aliquotas.map(a => a.ano), [aliquotas]);

  // Participantes únicos para o combobox
  const participantesUnicos = useMemo(() => {
    const map = new Map<string, { cod_part: string; nome: string; cnpj: string | null }>();
    participanteData.forEach(row => {
      if (!map.has(row.participante_nome)) {
        map.set(row.participante_nome, {
          cod_part: row.cod_part,
          nome: row.participante_nome,
          cnpj: row.participante_cnpj
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [participanteData]);

  // Filtrar dados
  const filteredData = useMemo(() => {
    return participanteData.filter(row => {
      // Filtro por mês/ano
      if (filterMesAno !== 'all' && row.mes_ano !== filterMesAno) return false;
      
      // Filtro por participante (nome ou CNPJ)
      if (filterParticipante) {
        const search = filterParticipante.toLowerCase();
        const matchNome = row.participante_nome?.toLowerCase().includes(search);
        const matchCnpj = row.participante_cnpj?.includes(filterParticipante.replace(/\D/g, ''));
        if (!matchNome && !matchCnpj) return false;
      }
      
      return true;
    });
  }, [participanteData, filterMesAno, filterParticipante]);

  // Buscar alíquota selecionada
  const aliquotaSelecionada = useMemo(() => {
    return aliquotas.find((a) => a.ano === selectedYear) || null;
  }, [aliquotas, selectedYear]);

  // Totais por tipo com cálculos completos
  const totals = useMemo(() => {
    const entradas = filteredData.filter(r => r.tipo === 'entrada');
    const saidas = filteredData.filter(r => r.tipo === 'saida');
    
    const calcTotals = (rows: ParticipanteRow[]) => {
      const valor = rows.reduce((s, r) => s + r.valor, 0);
      const icms = rows.reduce((s, r) => s + r.icms, 0);
      const pisCofins = rows.reduce((s, r) => s + r.pis + r.cofins, 0);
      
      const aliquota = aliquotaSelecionada;
      const icmsProjetado = aliquota ? icms * (1 - (aliquota.reduc_icms / 100)) : icms;
      const pisCofinsProjetado = aliquota ? pisCofins * (1 - (aliquota.reduc_piscofins / 100)) : pisCofins;
      const baseIbsCbs = valor - icmsProjetado - pisCofinsProjetado;
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
    
    return { 
      entradas: calcTotals(entradas), 
      saidas: calcTotals(saidas) 
    };
  }, [filteredData, aliquotaSelecionada]);

  // Exportar para Excel com todas as colunas
  const handleExport = () => {
    const aliquota = aliquotaSelecionada;
    const exportData = filteredData.map(row => {
      const vlIcms = row.icms;
      const vlIcmsProjetado = aliquota ? vlIcms * (1 - (aliquota.reduc_icms / 100)) : vlIcms;
      const vlPisCofins = row.pis + row.cofins;
      const vlPisCofinsProjetado = aliquota ? vlPisCofins * (1 - (aliquota.reduc_piscofins / 100)) : vlPisCofins;
      const totalImpostosAtuais = vlIcms + vlPisCofins;
      const baseIbsCbs = row.valor - vlIcmsProjetado - vlPisCofinsProjetado;
      const vlIbsProjetado = aliquota ? baseIbsCbs * ((aliquota.ibs_estadual + aliquota.ibs_municipal) / 100) : 0;
      const vlCbsProjetado = aliquota ? baseIbsCbs * (aliquota.cbs / 100) : 0;
      const totalReforma = vlIbsProjetado + vlCbsProjetado;
      const totalImpostosPagar = vlIcmsProjetado + vlPisCofinsProjetado + vlIbsProjetado + vlCbsProjetado;
      const diferencaProjetado = totalImpostosAtuais - totalReforma;
      const diferencaReal = totalImpostosPagar - (vlIcms + vlPisCofins);

      return {
        'Participante': row.participante_nome,
        'CNPJ': formatCNPJ(row.participante_cnpj),
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
        'Tot. Imp. a pagar': totalImpostosPagar,
        'Dif. Imp. Atual e Proj.': diferencaProjetado,
        'Dif. a pagar': diferencaReal,
      };
    });
    exportToExcel(exportData, 'mercadorias-participante');
  };

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
        <Button variant="outline" onClick={handleExport} disabled={filteredData.length === 0}>
          <Download className="h-4 w-4 mr-2" />
          Exportar Excel
        </Button>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-wrap items-end gap-4">
            {/* Filtro Mês/Ano */}
            <div className="space-y-1">
              <Label className="text-xs">Mês/Ano</Label>
              <Select value={filterMesAno} onValueChange={setFilterMesAno}>
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
                            setFilterParticipante('');
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
                              setFilterParticipante(participante.nome);
                              setOpenCombobox(false);
                            }}
                          >
                            <Check className={cn("mr-2 h-4 w-4", filterParticipante === participante.nome ? "opacity-100" : "opacity-0")} />
                            <span className="truncate flex-1">{participante.nome}</span>
                            {participante.cnpj && (
                              <span className="ml-2 text-xs text-muted-foreground shrink-0">
                                {formatCNPJ(participante.cnpj)}
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

      {/* Debug: Totais Brutos Carregados */}
      <Card className="border-dashed border-muted-foreground/30 bg-muted/10">
        <CardContent className="py-3">
          <div className="flex flex-wrap gap-4 text-xs">
            <span className="text-muted-foreground font-medium">Debug - Totais Brutos (antes de filtros):</span>
            <span>Registros: <strong>{participanteData.length}</strong></span>
            <span>Valor Total: <strong>{formatCurrency(participanteData.reduce((s, r) => s + r.valor, 0))}</strong></span>
            <span>Entradas: <strong>{formatCurrency(participanteData.filter(r => r.tipo === 'entrada').reduce((s, r) => s + r.valor, 0))}</strong></span>
            <span>Saídas: <strong>{formatCurrency(participanteData.filter(r => r.tipo === 'saida').reduce((s, r) => s + r.valor, 0))}</strong></span>
            {filterMesAno !== 'all' && <Badge variant="outline">Filtro: {formatMesAno(filterMesAno)}</Badge>}
            {filterParticipante && <Badge variant="outline">Participante: {filterParticipante}</Badge>}
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
              <span className="text-[10px] font-medium">Tot. Imp. a pagar:</span>
              <span className="text-sm font-bold">{formatCurrency(totals.entradas.totalImpostosPagar)}</span>
            </div>
            <div className="flex justify-between items-center pt-1 border-t">
              <span className="text-[10px] text-muted-foreground">Dif. Imp. Atual e Imp. Proj.:</span>
              <Badge variant={totals.entradas.diferencaProjetado > 0 ? 'destructive' : totals.entradas.diferencaProjetado < 0 ? 'default' : 'secondary'} className={totals.entradas.diferencaProjetado < 0 ? 'bg-positive text-positive-foreground' : ''}>
                {totals.entradas.diferencaProjetado > 0 ? '+' : ''}{formatCurrency(totals.entradas.diferencaProjetado)}
              </Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-muted-foreground">Dif. a pagar:</span>
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
              <span className="text-[10px] font-medium">Tot. Imp. a pagar:</span>
              <span className="text-sm font-bold">{formatCurrency(totals.saidas.totalImpostosPagar)}</span>
            </div>
            <div className="flex justify-between items-center pt-1 border-t">
              <span className="text-[10px] text-muted-foreground">Dif. Imp. Atual e Imp. Proj.:</span>
              <Badge variant={totals.saidas.diferencaProjetado > 0 ? 'destructive' : totals.saidas.diferencaProjetado < 0 ? 'default' : 'secondary'} className={totals.saidas.diferencaProjetado < 0 ? 'bg-positive text-positive-foreground' : ''}>
                {totals.saidas.diferencaProjetado > 0 ? '+' : ''}{formatCurrency(totals.saidas.diferencaProjetado)}
              </Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-muted-foreground">Dif. a pagar:</span>
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
                Entradas ({filteredData.filter(r => r.tipo === 'entrada').length})
              </TabsTrigger>
              <TabsTrigger value="saidas">
                Saídas ({filteredData.filter(r => r.tipo === 'saida').length})
              </TabsTrigger>
            </TabsList>
            <TabsContent value="entradas" className="mt-4">
              <ParticipanteTable
                data={filteredData}
                tipo="entrada"
                aliquotas={aliquotas}
                selectedYear={selectedYear}
                isLoading={isLoading}
              />
            </TabsContent>
            <TabsContent value="saidas" className="mt-4">
              <ParticipanteTable
                data={filteredData}
                tipo="saida"
                aliquotas={aliquotas}
                selectedYear={selectedYear}
                isLoading={isLoading}
              />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
