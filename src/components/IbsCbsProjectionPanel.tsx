import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';

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

interface IbsCbsProjectionPanelProps {
  filteredData: AggregatedRow[];
  aliquotas: Aliquota[];
  anoProjecao: number;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

export function IbsCbsProjectionPanel({ filteredData, aliquotas, anoProjecao }: IbsCbsProjectionPanelProps) {
  const aliquotaSelecionada = useMemo(() => {
    return aliquotas.find((a) => a.ano === anoProjecao) || null;
  }, [aliquotas, anoProjecao]);

  const totaisEntradas = useMemo(() => {
    const entradas = filteredData.filter((m) => m.tipo?.toLowerCase() === 'entrada');
    const valor = entradas.reduce((acc, m) => acc + m.valor, 0);
    const icms = entradas.reduce((acc, m) => acc + (m.icms || 0), 0);
    const pisCofins = entradas.reduce((acc, m) => acc + m.pis + m.cofins, 0);
    
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
  }, [filteredData, aliquotaSelecionada]);

  const totaisSaidas = useMemo(() => {
    const saidas = filteredData.filter((m) => m.tipo?.toLowerCase() === 'saida');
    const valor = saidas.reduce((acc, m) => acc + m.valor, 0);
    const icms = saidas.reduce((acc, m) => acc + (m.icms || 0), 0);
    const pisCofins = saidas.reduce((acc, m) => acc + m.pis + m.cofins, 0);
    
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
  }, [filteredData, aliquotaSelecionada]);

  return (
    <Card className="border-border/50 mt-8">
      <CardHeader>
        <CardTitle className="text-lg font-bold">Projeção Apuração IBS/CBS</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:gap-4 grid-cols-1 md:grid-cols-2">
          <Card className="border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-2">
                <ArrowDownRight className="h-3.5 w-3.5" /> Total Entradas (Créditos) - Projeção {anoProjecao}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              <div className="flex justify-between items-center">
                <span className="text-[10px] text-muted-foreground">Valor (VL_DOC):</span>
                <span className="text-sm font-bold">{formatCurrency(totaisEntradas.valor)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[10px] text-muted-foreground">ICMS:</span>
                <span className="text-sm font-bold">{formatCurrency(totaisEntradas.icms)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[10px] text-muted-foreground">ICMS Projetado:</span>
                <span className="text-sm font-bold">{formatCurrency(totaisEntradas.icmsProjetado)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[10px] text-muted-foreground">PIS+COFINS:</span>
                <span className="text-sm font-bold text-pis-cofins">{formatCurrency(totaisEntradas.pisCofins)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[10px] text-muted-foreground">PIS+COFINS Projetado:</span>
                <span className="text-sm font-bold text-pis-cofins">{formatCurrency(totaisEntradas.pisCofinsProjetado)}</span>
              </div>
              <div className="flex justify-between items-center bg-muted/30 -mx-2 px-2 py-0.5 rounded">
                <span className="text-[10px] font-medium">Tot. Impostos Atuais:</span>
                <span className="text-sm font-bold">{formatCurrency(totaisEntradas.totalImpostosAtuais)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[10px] text-muted-foreground">Base IBS/CBS:</span>
                <span className="text-sm font-bold">{formatCurrency(totaisEntradas.baseIbsCbs)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[10px] text-muted-foreground">IBS Projetado:</span>
                <span className="text-sm font-bold text-ibs-cbs">{formatCurrency(totaisEntradas.ibsProjetado)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[10px] text-muted-foreground">CBS Projetado:</span>
                <span className="text-sm font-bold text-ibs-cbs">{formatCurrency(totaisEntradas.cbsProjetado)}</span>
              </div>
              <div className="flex justify-between items-center bg-muted/30 -mx-2 px-2 py-0.5 rounded">
                <span className="text-[10px] font-medium text-ibs-cbs">Total Reforma:</span>
                <span className="text-sm font-bold text-ibs-cbs">{formatCurrency(totaisEntradas.totalReforma)}</span>
              </div>
              <div className="flex justify-between items-center bg-muted/30 -mx-2 px-2 py-0.5 rounded">
                <span className="text-[10px] font-medium">Tot. Créditos:</span>
                <span className="text-sm font-bold">{formatCurrency(totaisEntradas.totalImpostosPagar)}</span>
              </div>
              <div className="flex justify-between items-center pt-1 border-t">
                <span className="text-[10px] text-muted-foreground">Dif. deb/cred.:</span>
                <Badge variant={totaisEntradas.diferencaReal < 0 ? 'destructive' : 'default'} className={totaisEntradas.diferencaReal >= 0 ? 'bg-positive text-positive-foreground' : ''}>
                  {totaisEntradas.diferencaReal >= 0 ? '+' : ''}{formatCurrency(totaisEntradas.diferencaReal)}
                </Badge>
              </div>
            </CardContent>
          </Card>
          <Card className="border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground flex items-center gap-2">
                <ArrowUpRight className="h-3.5 w-3.5" /> Total Saídas (Débitos) - Projeção {anoProjecao}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              <div className="flex justify-between items-center">
                <span className="text-[10px] text-muted-foreground">Valor (VL_DOC):</span>
                <span className="text-sm font-bold">{formatCurrency(totaisSaidas.valor)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[10px] text-muted-foreground">ICMS:</span>
                <span className="text-sm font-bold">{formatCurrency(totaisSaidas.icms)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[10px] text-muted-foreground">ICMS Projetado:</span>
                <span className="text-sm font-bold">{formatCurrency(totaisSaidas.icmsProjetado)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[10px] text-muted-foreground">PIS+COFINS:</span>
                <span className="text-sm font-bold text-pis-cofins">{formatCurrency(totaisSaidas.pisCofins)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[10px] text-muted-foreground">PIS+COFINS Projetado:</span>
                <span className="text-sm font-bold text-pis-cofins">{formatCurrency(totaisSaidas.pisCofinsProjetado)}</span>
              </div>
              <div className="flex justify-between items-center bg-muted/30 -mx-2 px-2 py-0.5 rounded">
                <span className="text-[10px] font-medium">Tot. Impostos Atuais:</span>
                <span className="text-sm font-bold">{formatCurrency(totaisSaidas.totalImpostosAtuais)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[10px] text-muted-foreground">Base IBS/CBS:</span>
                <span className="text-sm font-bold">{formatCurrency(totaisSaidas.baseIbsCbs)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[10px] text-muted-foreground">IBS Projetado:</span>
                <span className="text-sm font-bold text-ibs-cbs">{formatCurrency(totaisSaidas.ibsProjetado)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[10px] text-muted-foreground">CBS Projetado:</span>
                <span className="text-sm font-bold text-ibs-cbs">{formatCurrency(totaisSaidas.cbsProjetado)}</span>
              </div>
              <div className="flex justify-between items-center bg-muted/30 -mx-2 px-2 py-0.5 rounded">
                <span className="text-[10px] font-medium text-ibs-cbs">Total Reforma:</span>
                <span className="text-sm font-bold text-ibs-cbs">{formatCurrency(totaisSaidas.totalReforma)}</span>
              </div>
              <div className="flex justify-between items-center bg-muted/30 -mx-2 px-2 py-0.5 rounded">
                <span className="text-[10px] font-medium">Tot. Débitos:</span>
                <span className="text-sm font-bold">{formatCurrency(totaisSaidas.totalImpostosPagar)}</span>
              </div>
              <div className="flex justify-between items-center pt-1 border-t">
                <span className="text-[10px] text-muted-foreground">Dif. deb/cred.:</span>
                <Badge variant={totaisSaidas.diferencaReal < 0 ? 'destructive' : 'default'} className={totaisSaidas.diferencaReal >= 0 ? 'bg-positive text-positive-foreground' : ''}>
                  {totaisSaidas.diferencaReal >= 0 ? '+' : ''}{formatCurrency(totaisSaidas.diferencaReal)}
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      </CardContent>
    </Card>
  );
}
