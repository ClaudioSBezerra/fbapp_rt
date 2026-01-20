import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Download, Package, Wrench, AlertCircle, HelpCircle } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { formatFilialDisplayFormatted, formatDocumento } from '@/lib/formatFilial';
import { exportToExcel } from '@/lib/exportToExcel';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';

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
  nome: string;
  cnpj: string;
  cod_est: string | null;
}

interface DetailedRow {
  row_id: string;
  filial_id: string;
  filial_nome: string;
  filial_cod_est: string | null;
  filial_cnpj: string;
  cfop: string;
  tipo_operacao: string;
  mes_ano: string;
  cod_part: string | null;
  participante_nome: string | null;
  participante_doc: string | null;
  valor: number;
  icms: number;
  pis: number;
  cofins: number;
  quantidade_docs: number;
}

const ANOS_PROJECAO = [2027, 2028, 2029, 2030, 2031, 2032, 2033];
const CFOPS_IMOBILIZADO = ['1551', '2551'];
const CFOPS_USO_CONSUMO = ['1556', '2556'];

const formatNumber = (value: number) =>
  new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);

const formatDate = (dateStr: string) => {
  const [year, month] = dateStr.substring(0, 7).split('-');
  return `${month}/${year}`;
};

export default function UsoConsumoImobilizado() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DetailedRow[]>([]);
  const [aliquotas, setAliquotas] = useState<Aliquota[]>([]);
  const [filiais, setFiliais] = useState<Filial[]>([]);
  const [filialSelecionada, setFilialSelecionada] = useState<string>('todas');
  const [mesAnoSelecionado, setMesAnoSelecionado] = useState<string>('todos');
  const [cfopSelecionado, setCfopSelecionado] = useState<string>('todos');
  const [anoProjecao, setAnoProjecao] = useState<number>(2027);
  const [periodosDisponiveis, setPeriodosDisponiveis] = useState<string[]>([]);

  // Carregar dados iniciais
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      
      try {
        // Carregar dados detalhados agregados por participante
        const { data: detailedData, error: detailError } = await supabase.rpc('get_mv_uso_consumo_detailed' as any);
        
        if (detailError) {
          console.error('Error fetching detailed data:', detailError);
          setData([]);
        } else {
          const formattedData = (detailedData || []).map((row: any) => ({
            ...row,
            mes_ano: typeof row.mes_ano === 'string' ? row.mes_ano : new Date(row.mes_ano).toISOString().slice(0, 10),
          }));
          setData(formattedData);
          
          // Extrair períodos únicos
          const periodos = [...new Set(formattedData.map((r: DetailedRow) => r.mes_ano.substring(0, 7)))].sort().reverse() as string[];
          setPeriodosDisponiveis(periodos);
          if (periodos.length > 0 && mesAnoSelecionado === 'todos') {
            setMesAnoSelecionado(periodos[0] as string);
          }
        }

        // Carregar filiais
        const { data: filiaisData } = await supabase.from('filiais').select('id, nome_fantasia, razao_social, cnpj, cod_est');
        const filialsList = filiaisData?.map(f => ({
          id: f.id,
          nome: f.nome_fantasia || f.razao_social || 'Sem nome',
          cnpj: f.cnpj || '',
          cod_est: f.cod_est || null,
        })) || [];
        setFiliais(filialsList);

        // Carregar alíquotas
        const { data: aliquotasData } = await supabase.from('aliquotas').select('*').eq('is_active', true).order('ano');
        setAliquotas(aliquotasData || []);
      } catch (err) {
        console.error('Error loading data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Filtrar dados
  const dadosFiltrados = useMemo(() => {
    return data.filter(row => {
      if (filialSelecionada !== 'todas' && row.filial_id !== filialSelecionada) return false;
      if (mesAnoSelecionado !== 'todos' && !row.mes_ano.startsWith(mesAnoSelecionado)) return false;
      if (cfopSelecionado !== 'todos' && row.cfop !== cfopSelecionado) return false;
      return true;
    });
  }, [data, filialSelecionada, mesAnoSelecionado, cfopSelecionado]);

  // Separar por tipo
  const dadosImobilizado = useMemo(() => 
    dadosFiltrados.filter(r => CFOPS_IMOBILIZADO.includes(r.cfop)), 
    [dadosFiltrados]
  );
  
  const dadosUsoConsumo = useMemo(() => 
    dadosFiltrados.filter(r => CFOPS_USO_CONSUMO.includes(r.cfop)), 
    [dadosFiltrados]
  );

  // Alíquota selecionada
  const aliquotaSelecionada = useMemo(
    () => aliquotas.find(a => a.ano === anoProjecao),
    [aliquotas, anoProjecao]
  );

  // Calcular projeções para uma linha
  const calcularProjecao = (row: DetailedRow) => {
    if (!aliquotaSelecionada) {
      return { 
        icmsProj: 0, pisCofinsProj: 0, baseIbsCbs: 0, ibsProj: 0, cbsProj: 0, 
        totalImpostosAtuais: 0, totalReforma: 0, totalImpostoReforma: 0, diferenca: 0 
      };
    }

    const pisCofins = row.pis + row.cofins;
    const reducIcms = aliquotaSelecionada.reduc_icms / 100;
    const reducPisCofins = aliquotaSelecionada.reduc_piscofins / 100;
    const ibsTotal = aliquotaSelecionada.ibs_estadual + aliquotaSelecionada.ibs_municipal;

    const icmsProj = row.icms * (1 - reducIcms);
    const pisCofinsProj = pisCofins * (1 - reducPisCofins);
    
    // Novos cálculos iguais ao Mercadorias
    const totalImpostosAtuais = row.icms + pisCofins;
    const baseIbsCbs = row.valor - row.icms - pisCofins;
    const ibsProj = (baseIbsCbs * ibsTotal) / 100;
    const cbsProj = (baseIbsCbs * aliquotaSelecionada.cbs) / 100;
    const totalReforma = ibsProj + cbsProj;
    const totalImpostoReforma = icmsProj + pisCofinsProj + ibsProj + cbsProj;
    const diferenca = totalImpostoReforma - totalImpostosAtuais;

    return { 
      icmsProj, pisCofinsProj, baseIbsCbs, ibsProj, cbsProj, 
      totalImpostosAtuais, totalReforma, totalImpostoReforma, diferenca 
    };
  };

  // Totais
  const totais = useMemo(() => {
    const result = {
      imobilizado: { valor: 0, icms: 0, pis: 0, cofins: 0 },
      usoConsumo: { valor: 0, icms: 0, pis: 0, cofins: 0 },
    };

    dadosImobilizado.forEach(r => {
      result.imobilizado.valor += r.valor;
      result.imobilizado.icms += r.icms;
      result.imobilizado.pis += r.pis;
      result.imobilizado.cofins += r.cofins;
    });

    dadosUsoConsumo.forEach(r => {
      result.usoConsumo.valor += r.valor;
      result.usoConsumo.icms += r.icms;
      result.usoConsumo.pis += r.pis;
      result.usoConsumo.cofins += r.cofins;
    });

    return result;
  }, [dadosImobilizado, dadosUsoConsumo]);

  // Exportar para Excel
  const handleExport = () => {
    const exportData = dadosFiltrados.map(row => {
      const proj = calcularProjecao(row);
      return {
        'Filial': formatFilialDisplayFormatted(row.filial_cod_est, row.filial_cnpj),
        'Participante': row.participante_nome || '-',
        'Doc. Participante': row.participante_doc || '-',
        'CFOP': row.cfop,
        'Tipo': row.tipo_operacao === 'imobilizado' ? 'Ativo Imobilizado' : 'Uso e Consumo',
        'Mês/Ano': formatDate(row.mes_ano),
        'Qtd. Docs': row.quantidade_docs,
        'Valor': row.valor,
        'ICMS': row.icms,
        [`ICMS Proj. (-${aliquotaSelecionada?.reduc_icms || 0}%)`]: proj.icmsProj,
        'PIS+COFINS': row.pis + row.cofins,
        [`PIS+COFINS Proj. (-${aliquotaSelecionada?.reduc_piscofins || 0}%)`]: proj.pisCofinsProj,
        'Tot. Imp. Atuais': proj.totalImpostosAtuais,
        'Base IBS/CBS': proj.baseIbsCbs,
        [`IBS Proj. (${((aliquotaSelecionada?.ibs_estadual || 0) + (aliquotaSelecionada?.ibs_municipal || 0)).toFixed(1)}%)`]: proj.ibsProj,
        [`CBS Proj. (${(aliquotaSelecionada?.cbs || 0).toFixed(1)}%)`]: proj.cbsProj,
        'Total Reforma': proj.totalReforma,
        'Tot.Imposto Reforma': proj.totalImpostoReforma,
        'Dif. deb/cred.': proj.diferenca,
      };
    });

    exportToExcel(exportData, `uso_consumo_imobilizado_${anoProjecao}`);
    toast.success('Dados exportados com sucesso!');
  };

  // Componente de Tabela
  const DataTable = ({ rows, title }: { rows: DetailedRow[]; title: string }) => (
    <div className="rounded-md border overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="text-xs">
            <TableHead className="min-w-[140px] text-xs">Filial</TableHead>
            <TableHead className="min-w-[120px] text-xs">Participante</TableHead>
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
                  <p className="font-mono text-xs">(ICMS Proj. + PIS/COFINS Proj. + IBS + CBS) − (ICMS + PIS + COFINS)</p>
                  <p className="text-muted-foreground text-xs mt-1">Compara impostos atuais com TODOS os impostos projetados (transição + novos). Vermelho = aumento, Verde = redução.</p>
                </TooltipContent>
              </Tooltip>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={16} className="text-center py-8 text-muted-foreground text-xs">
                Nenhum dado encontrado para os filtros selecionados
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => {
              const proj = calcularProjecao(row);
              return (
                <TableRow key={row.row_id} className="text-xs">
                  <TableCell className="font-medium text-xs whitespace-nowrap py-1 px-2">
                    {formatFilialDisplayFormatted(row.filial_cod_est, row.filial_cnpj)}
                  </TableCell>
                  <TableCell className="text-xs py-1 px-2">
                    <div className="flex flex-col">
                      <span className="font-medium truncate max-w-[120px]" title={row.participante_nome || undefined}>
                        {row.participante_nome || '-'}
                      </span>
                      {row.participante_doc && (
                        <span className="text-[10px] text-muted-foreground">{formatDocumento(row.participante_doc)}</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs whitespace-nowrap">{formatDate(row.mes_ano)}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{formatNumber(row.valor)}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{formatNumber(row.icms)}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{formatNumber(proj.icmsProj)}</TableCell>
                  <TableCell className="text-right font-mono text-xs text-pis-cofins">{formatNumber(row.pis + row.cofins)}</TableCell>
                  <TableCell className="text-right font-mono text-xs text-pis-cofins">{formatNumber(proj.pisCofinsProj)}</TableCell>
                  <TableCell className="text-right font-mono text-xs font-semibold bg-muted/30">{formatNumber(proj.totalImpostosAtuais)}</TableCell>
                  <TableCell className="text-right font-mono text-xs">{formatNumber(proj.baseIbsCbs)}</TableCell>
                  <TableCell className="text-right font-mono text-xs text-ibs-cbs">{formatNumber(proj.ibsProj)}</TableCell>
                  <TableCell className="text-right font-mono text-xs text-ibs-cbs">{formatNumber(proj.cbsProj)}</TableCell>
                  <TableCell className="text-right font-mono text-xs font-semibold text-ibs-cbs bg-muted/30">{formatNumber(proj.totalReforma)}</TableCell>
                  <TableCell className="text-right font-mono text-xs font-semibold bg-muted/30">{formatNumber(proj.totalImpostoReforma)}</TableCell>
                  <TableCell className="text-right">
                    <Badge
                      variant={proj.diferenca > 0 ? 'destructive' : 'default'}
                      className={`text-xs ${proj.diferenca <= 0 ? 'bg-positive text-positive-foreground' : ''}`}
                    >
                      {proj.diferenca >= 0 ? '+' : ''}{formatNumber(proj.diferenca)}
                    </Badge>
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Uso e Consumo / Imobilizado</h1>
          <p className="text-sm text-muted-foreground">
            Dados importados do EFD ICMS/IPI (CFOPs 1551, 2551, 1556, 2556) - Agregados por participante
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Select value={mesAnoSelecionado} onValueChange={setMesAnoSelecionado}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Período" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              {periodosDisponiveis.map(p => (
                <SelectItem key={p} value={p}>
                  {p.split('-').reverse().join('/')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filialSelecionada} onValueChange={setFilialSelecionada}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="Filial" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as filiais</SelectItem>
              {filiais.map(f => (
                <SelectItem key={f.id} value={f.id}>
                  {formatFilialDisplayFormatted(f.cod_est, f.cnpj)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={cfopSelecionado} onValueChange={setCfopSelecionado}>
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder="CFOP" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="1551">1551</SelectItem>
              <SelectItem value="2551">2551</SelectItem>
              <SelectItem value="1556">1556</SelectItem>
              <SelectItem value="2556">2556</SelectItem>
            </SelectContent>
          </Select>

          <Select value={String(anoProjecao)} onValueChange={v => setAnoProjecao(Number(v))}>
            <SelectTrigger className="w-[100px]">
              <SelectValue placeholder="Ano" />
            </SelectTrigger>
            <SelectContent>
              {ANOS_PROJECAO.map(ano => (
                <SelectItem key={ano} value={String(ano)}>{ano}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button variant="outline" onClick={handleExport} disabled={dadosFiltrados.length === 0}>
            <Download className="h-4 w-4 mr-2" />
            Exportar
          </Button>
        </div>
      </div>

      {/* Alerta sem alíquotas */}
      {aliquotas.length === 0 && (
        <Alert variant="default" className="border-amber-500 bg-amber-50 dark:bg-amber-950/20">
          <AlertCircle className="h-4 w-4 text-amber-600" />
          <AlertTitle className="text-amber-800 dark:text-amber-200">Alíquotas não configuradas</AlertTitle>
          <AlertDescription className="text-amber-700 dark:text-amber-300">
            Configure as alíquotas de transição na página{' '}
            <Link to="/aliquotas" className="underline font-medium">Alíquotas</Link> para visualizar as projeções.
          </AlertDescription>
        </Alert>
      )}

      {/* Cards de Resumo */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Wrench className="h-4 w-4 text-blue-500" />
              Total Ativo Imobilizado
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {formatNumber(totais.imobilizado.valor)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              ICMS: {formatNumber(totais.imobilizado.icms)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Package className="h-4 w-4 text-green-500" />
              Total Uso e Consumo
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatNumber(totais.usoConsumo.valor)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              ICMS: {formatNumber(totais.usoConsumo.icms)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total de Impostos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatNumber(
                totais.imobilizado.icms + totais.imobilizado.pis + totais.imobilizado.cofins +
                totais.usoConsumo.icms + totais.usoConsumo.pis + totais.usoConsumo.cofins
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              ICMS + PIS + COFINS
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Geral
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatNumber(totais.imobilizado.valor + totais.usoConsumo.valor)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {dadosFiltrados.length} participantes
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs com tabelas */}
      <Tabs defaultValue="imobilizado" className="space-y-4">
        <TabsList>
          <TabsTrigger value="imobilizado" className="flex items-center gap-2">
            <Wrench className="h-4 w-4" />
            Ativo Imobilizado ({dadosImobilizado.length})
          </TabsTrigger>
          <TabsTrigger value="uso-consumo" className="flex items-center gap-2">
            <Package className="h-4 w-4" />
            Uso e Consumo ({dadosUsoConsumo.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="imobilizado">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Ativo Imobilizado</CardTitle>
              <CardDescription>CFOPs 1551 (Estadual) e 2551 (Interestadual) - Agregados por participante</CardDescription>
            </CardHeader>
            <CardContent>
              <DataTable rows={dadosImobilizado} title="Imobilizado" />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="uso-consumo">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Uso e Consumo</CardTitle>
              <CardDescription>CFOPs 1556 (Estadual) e 2556 (Interestadual) - Agregados por participante</CardDescription>
            </CardHeader>
            <CardContent>
              <DataTable rows={dadosUsoConsumo} title="Uso e Consumo" />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
