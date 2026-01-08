import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Download, Search, Users } from 'lucide-react';
import { exportToExcel } from '@/lib/exportToExcel';

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
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
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

// Extrai ano de uma data
const extractYear = (date: string) => new Date(date).getFullYear();

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
          <TableRow>
            <TableHead className="min-w-[200px]">Participante</TableHead>
            <TableHead className="w-[100px]">CNPJ</TableHead>
            <TableHead className="w-[80px] text-center">Mês/Ano</TableHead>
            <TableHead className="text-right">Valor</TableHead>
            <TableHead className="text-right">ICMS</TableHead>
            <TableHead className="text-right">PIS+COFINS</TableHead>
            {aliquota && (
              <>
                <TableHead className="text-right text-primary">IBS+CBS Proj.</TableHead>
                <TableHead className="text-right text-primary">Diferença</TableHead>
              </>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedData.map((row, idx) => {
            const pisCofins = row.pis + row.cofins;
            const impostoAtual = row.icms + pisCofins;
            
            // Projeção IBS+CBS
            let ibsCbsProj = 0;
            let diferenca = 0;
            if (aliquota) {
              const ibsTotal = aliquota.ibs_estadual + aliquota.ibs_municipal;
              const cbsTotal = aliquota.cbs;
              ibsCbsProj = row.valor * ((ibsTotal + cbsTotal) / 100);
              diferenca = ibsCbsProj - impostoAtual;
            }

            return (
              <TableRow key={`${row.cod_part}-${row.mes_ano}-${idx}`}>
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
                <TableCell className="text-[10px] text-muted-foreground">
                  {row.participante_cnpj ? formatCNPJ(row.participante_cnpj).substring(0, 10) + '...' : '-'}
                </TableCell>
                <TableCell className="text-center text-xs">{formatMesAno(row.mes_ano)}</TableCell>
                <TableCell className="text-right text-xs font-medium">{formatCurrency(row.valor)}</TableCell>
                <TableCell className="text-right text-xs">{formatCurrency(row.icms)}</TableCell>
                <TableCell className="text-right text-xs">{formatCurrency(pisCofins)}</TableCell>
                {aliquota && (
                  <>
                    <TableCell className="text-right text-xs text-primary font-medium">
                      {formatCurrency(ibsCbsProj)}
                    </TableCell>
                    <TableCell className={`text-right text-xs font-medium ${diferenca >= 0 ? 'text-destructive' : 'text-green-600'}`}>
                      {diferenca >= 0 ? '+' : ''}{formatCurrency(diferenca)}
                    </TableCell>
                  </>
                )}
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

  // Totais por tipo
  const totals = useMemo(() => {
    const entradas = filteredData.filter(r => r.tipo === 'entrada');
    const saidas = filteredData.filter(r => r.tipo === 'saida');
    
    const sumEntradas = {
      valor: entradas.reduce((s, r) => s + r.valor, 0),
      pis: entradas.reduce((s, r) => s + r.pis, 0),
      cofins: entradas.reduce((s, r) => s + r.cofins, 0),
      icms: entradas.reduce((s, r) => s + r.icms, 0),
    };
    
    const sumSaidas = {
      valor: saidas.reduce((s, r) => s + r.valor, 0),
      pis: saidas.reduce((s, r) => s + r.pis, 0),
      cofins: saidas.reduce((s, r) => s + r.cofins, 0),
      icms: saidas.reduce((s, r) => s + r.icms, 0),
    };
    
    return { entradas: sumEntradas, saidas: sumSaidas };
  }, [filteredData]);

  // Exportar para Excel
  const handleExport = () => {
    const exportData = filteredData.map(row => ({
      'Participante': row.participante_nome,
      'CNPJ': formatCNPJ(row.participante_cnpj),
      'Tipo': row.tipo === 'entrada' ? 'Entrada' : 'Saída',
      'Mês/Ano': formatMesAno(row.mes_ano),
      'Valor': row.valor,
      'ICMS': row.icms,
      'PIS': row.pis,
      'COFINS': row.cofins,
    }));
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

            {/* Filtro Participante */}
            <div className="space-y-1 flex-1 min-w-[200px] max-w-[350px]">
              <Label className="text-xs">Buscar Participante</Label>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Nome ou CNPJ..."
                  value={filterParticipante}
                  onChange={(e) => setFilterParticipante(e.target.value)}
                  className="pl-8"
                />
              </div>
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

      {/* Cards de Resumo */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Entradas</CardTitle>
            <CardDescription>Total de compras por participante</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <p className="text-muted-foreground">Valor Total</p>
                <p className="font-bold text-lg">{formatCurrency(totals.entradas.valor)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">ICMS + PIS/COFINS</p>
                <p className="font-bold">{formatCurrency(totals.entradas.icms + totals.entradas.pis + totals.entradas.cofins)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Saídas</CardTitle>
            <CardDescription>Total de vendas por participante</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <p className="text-muted-foreground">Valor Total</p>
                <p className="font-bold text-lg">{formatCurrency(totals.saidas.valor)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">ICMS + PIS/COFINS</p>
                <p className="font-bold">{formatCurrency(totals.saidas.icms + totals.saidas.pis + totals.saidas.cofins)}</p>
              </div>
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
