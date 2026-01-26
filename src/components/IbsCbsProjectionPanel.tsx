import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

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

// Compact helper to reduce code duplication
function MetricRow({ label, value, highlight = false, colorClass = "" }: { label: string, value: number, highlight?: boolean, colorClass?: string }) {
  return (
    <div className={`flex justify-between items-center ${highlight ? 'bg-muted/30 -mx-2 px-2 py-0.5 rounded' : ''}`}>
      <span className={`text-[10px] ${highlight ? 'font-medium' : 'text-muted-foreground'} ${colorClass}`}>{label}:</span>
      <span className={`text-xs font-bold ${colorClass}`}>{formatCurrency(value)}</span>
    </div>
  );
}

export function IbsCbsProjectionPanel({ filteredData, aliquotas, anoProjecao }: IbsCbsProjectionPanelProps) {
  // Logic extracted for reuse in chart
  const calculateTotalsForYear = (targetYear: number) => {
    const aliquota = aliquotas.find(a => a.ano === targetYear) || null;
    
    // Entradas
    const entradas = filteredData.filter((m) => m.tipo?.toLowerCase() === 'entrada');
    const entValor = entradas.reduce((acc, m) => acc + m.valor, 0);
    const entIcms = entradas.reduce((acc, m) => acc + (m.icms || 0), 0);
    const entPisCofins = entradas.reduce((acc, m) => acc + m.pis + m.cofins, 0);
    
    const entIcmsProj = aliquota ? entIcms * (1 - (aliquota.reduc_icms / 100)) : entIcms;
    const entPisCofinsProj = aliquota ? entPisCofins * (1 - (aliquota.reduc_piscofins / 100)) : entPisCofins;
    const entBaseIbsCbs = entValor - entIcms - entPisCofins;
    const entIbsProj = aliquota ? entBaseIbsCbs * ((aliquota.ibs_estadual + aliquota.ibs_municipal) / 100) : 0;
    const entCbsProj = aliquota ? entBaseIbsCbs * (aliquota.cbs / 100) : 0;
    const entTotalPagar = entIcmsProj + entPisCofinsProj + entIbsProj + entCbsProj;

    // Saídas
    const saidas = filteredData.filter((m) => m.tipo?.toLowerCase() === 'saida');
    const saiValor = saidas.reduce((acc, m) => acc + m.valor, 0);
    const saiIcms = saidas.reduce((acc, m) => acc + (m.icms || 0), 0);
    const saiPisCofins = saidas.reduce((acc, m) => acc + m.pis + m.cofins, 0);
    
    const saiIcmsProj = aliquota ? saiIcms * (1 - (aliquota.reduc_icms / 100)) : saiIcms;
    const saiPisCofinsProj = aliquota ? saiPisCofins * (1 - (aliquota.reduc_piscofins / 100)) : saiPisCofins;
    const saiBaseIbsCbs = saiValor - saiIcms - saiPisCofins;
    const saiIbsProj = aliquota ? saiBaseIbsCbs * ((aliquota.ibs_estadual + aliquota.ibs_municipal) / 100) : 0;
    const saiCbsProj = aliquota ? saiBaseIbsCbs * (aliquota.cbs / 100) : 0;
    const saiTotalPagar = saiIcmsProj + saiPisCofinsProj + saiIbsProj + saiCbsProj;

    // Net Result
    const saldoAPagar = saiTotalPagar - entTotalPagar;

    return {
      entradas: { valor: entValor, icms: entIcms, pisCofins: entPisCofins, icmsProjetado: entIcmsProj, pisCofinsProjetado: entPisCofinsProj, baseIbsCbs: entBaseIbsCbs, ibsProjetado: entIbsProj, cbsProjetado: entCbsProj, totalImpostosAtuais: entIcms + entPisCofins, totalReforma: entIbsProj + entCbsProj, totalImpostosPagar: entTotalPagar },
      saidas: { valor: saiValor, icms: saiIcms, pisCofins: saiPisCofins, icmsProjetado: saiIcmsProj, pisCofinsProjetado: saiPisCofinsProj, baseIbsCbs: saiBaseIbsCbs, ibsProjetado: saiIbsProj, cbsProjetado: saiCbsProj, totalImpostosAtuais: saiIcms + saiPisCofins, totalReforma: saiIbsProj + saiCbsProj, totalImpostosPagar: saiTotalPagar },
      saldoAPagar
    };
  };

  const currentYearTotals = useMemo(() => calculateTotalsForYear(anoProjecao), [filteredData, aliquotas, anoProjecao]);

  // Generate data for all projection years
  const trendData = useMemo(() => {
    const years = [2027, 2028, 2029, 2030, 2031, 2032, 2033];
    return years.map(year => {
      const totals = calculateTotalsForYear(year);
      return {
        year: year.toString(),
        saldo: totals.saldoAPagar,
        saldoFormatted: formatCurrency(totals.saldoAPagar)
      };
    });
  }, [filteredData, aliquotas]);

  const { entradas: totaisEntradas, saidas: totaisSaidas, saldoAPagar } = currentYearTotals;

  const saldoNovosImpostos = useMemo(() => {
    const icmsProjetado = totaisSaidas.icmsProjetado - totaisEntradas.icmsProjetado;
    const ibsProjetado = totaisSaidas.ibsProjetado - totaisEntradas.ibsProjetado;
    const cbsProjetado = totaisSaidas.cbsProjetado - totaisEntradas.cbsProjetado;
    
    return { icmsProjetado, ibsProjetado, cbsProjetado, saldoAPagar };
  }, [totaisEntradas, totaisSaidas, saldoAPagar]);

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-bold">Projeção Apuração IBS/CBS</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 grid-cols-1 lg:grid-cols-12">
          
          {/* Left Column: Data Tables (Compressed) */}
          <div className="lg:col-span-5 flex flex-col gap-3">
            <div className="grid grid-cols-2 gap-2">
              {/* Entradas */}
              <Card className="border-border/50">
                <CardHeader className="p-2 pb-1">
                  <CardTitle className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                    <ArrowDownRight className="h-3 w-3" /> Entradas (Créditos)
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-2 space-y-0.5">
                  <MetricRow label="Valor" value={totaisEntradas.valor} />
                  <MetricRow label="ICMS" value={totaisEntradas.icms} />
                  <MetricRow label="ICMS Proj." value={totaisEntradas.icmsProjetado} />
                  <MetricRow label="PIS/COF" value={totaisEntradas.pisCofins} colorClass="text-pis-cofins" />
                  <MetricRow label="PIS/COF Proj." value={totaisEntradas.pisCofinsProjetado} colorClass="text-pis-cofins" />
                  <MetricRow label="IBS Proj." value={totaisEntradas.ibsProjetado} colorClass="text-ibs-cbs" />
                  <MetricRow label="CBS Proj." value={totaisEntradas.cbsProjetado} colorClass="text-ibs-cbs" />
                  <MetricRow label="Total Créditos" value={totaisEntradas.totalImpostosPagar} highlight />
                </CardContent>
              </Card>

              {/* Saídas */}
              <Card className="border-border/50">
                <CardHeader className="p-2 pb-1">
                  <CardTitle className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
                    <ArrowUpRight className="h-3 w-3" /> Saídas (Débitos)
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-2 space-y-0.5">
                  <MetricRow label="Valor" value={totaisSaidas.valor} />
                  <MetricRow label="ICMS" value={totaisSaidas.icms} />
                  <MetricRow label="ICMS Proj." value={totaisSaidas.icmsProjetado} />
                  <MetricRow label="PIS/COF" value={totaisSaidas.pisCofins} colorClass="text-pis-cofins" />
                  <MetricRow label="PIS/COF Proj." value={totaisSaidas.pisCofinsProjetado} colorClass="text-pis-cofins" />
                  <MetricRow label="IBS Proj." value={totaisSaidas.ibsProjetado} colorClass="text-ibs-cbs" />
                  <MetricRow label="CBS Proj." value={totaisSaidas.cbsProjetado} colorClass="text-ibs-cbs" />
                  <MetricRow label="Total Débitos" value={totaisSaidas.totalImpostosPagar} highlight />
                </CardContent>
              </Card>
            </div>

            {/* Projeção Pagamento Compacta */}
            <Card className="border-border/50 bg-muted/10">
              <CardContent className="p-3">
                 <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-medium text-muted-foreground">ICMS (Net):</span>
                    <span className="text-xs font-bold">{formatCurrency(saldoNovosImpostos.icmsProjetado)}</span>
                 </div>
                 <div className="flex justify-between items-center mb-2">
                    <span className="text-xs font-medium text-muted-foreground">IBS+CBS (Net):</span>
                    <span className="text-xs font-bold text-ibs-cbs">{formatCurrency(saldoNovosImpostos.ibsProjetado + saldoNovosImpostos.cbsProjetado)}</span>
                 </div>
                 <div className="pt-2 border-t border-border/50 flex justify-between items-baseline">
                    <span className="text-xs font-bold text-primary">SALDO A PAGAR ({anoProjecao}):</span>
                    <span className="text-lg font-bold text-primary">{formatCurrency(saldoNovosImpostos.saldoAPagar)}</span>
                 </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column: Chart */}
          <div className="lg:col-span-7">
             <Card className="h-full border-border/50 flex flex-col">
                <CardHeader className="pb-2 pt-4 px-4">
                   <CardTitle className="text-sm font-medium">Evolução do Saldo a Pagar (Transição 2027-2033)</CardTitle>
                </CardHeader>
                <CardContent className="flex-1 min-h-[250px] p-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trendData} margin={{ top: 10, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                      <XAxis 
                        dataKey="year" 
                        tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} 
                        axisLine={false} 
                        tickLine={false} 
                      />
                      <YAxis 
                        tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} 
                        axisLine={false} 
                        tickLine={false}
                        tickFormatter={(value) => 
                          new Intl.NumberFormat('pt-BR', { notation: "compact", compactDisplay: "short" }).format(value)
                        } 
                      />
                      <Tooltip 
                        contentStyle={{ 
                          backgroundColor: 'hsl(var(--popover))', 
                          borderColor: 'hsl(var(--border))', 
                          borderRadius: 'var(--radius)',
                          fontSize: '12px',
                          color: 'hsl(var(--popover-foreground))'
                        }}
                        itemStyle={{ color: 'hsl(var(--primary))' }}
                        formatter={(value: number) => [formatCurrency(value), 'Saldo a Pagar']}
                      />
                      <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{ fontSize: '11px' }} />
                      <Line 
                        type="monotone" 
                        dataKey="saldo" 
                        name="Saldo a Pagar" 
                        stroke="hsl(var(--primary))" 
                        strokeWidth={2} 
                        dot={{ r: 4, fill: 'hsl(var(--primary))' }} 
                        activeDot={{ r: 6 }} 
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
             </Card>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
