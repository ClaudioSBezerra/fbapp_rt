import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Calculator } from 'lucide-react';

interface Aliquota {
  id: string;
  ano: number;
  ibs_estadual: number;
  ibs_municipal: number;
  cbs: number;
  reduc_icms: number;
  reduc_piscofins: number;
  is_active: boolean;
}

export default function Aliquotas() {
  const [aliquotas, setAliquotas] = useState<Aliquota[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAliquotas() {
      try {
        const { data, error } = await supabase
          .from('aliquotas')
          .select('*')
          .order('ano');

        if (error) throw error;
        if (data) setAliquotas(data);
      } catch (error) {
        console.error('Error:', error);
        toast.error('Erro ao carregar alíquotas');
      } finally {
        setLoading(false);
      }
    }

    fetchAliquotas();
  }, []);

  const currentYear = new Date().getFullYear();

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Alíquotas de Transição</h1>
        <p className="text-muted-foreground">
          Configuração das alíquotas IBS e CBS por ano (2026-2033)
        </p>
      </div>

      <Card className="border-border/50">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Calculator className="h-5 w-5 text-muted-foreground" />
            <div>
              <CardTitle>Cronograma de Transição</CardTitle>
              <CardDescription>
                Alíquotas progressivas conforme a Reforma Tributária
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-12 text-center text-muted-foreground">
              Carregando...
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ano</TableHead>
                  <TableHead className="text-right">IBS Estadual (%)</TableHead>
                  <TableHead className="text-right">IBS Municipal (%)</TableHead>
                  <TableHead className="text-right">CBS (%)</TableHead>
                  <TableHead className="text-right">Total IBS+CBS (%)</TableHead>
                  <TableHead className="text-right">Redução ICMS (%)</TableHead>
                  <TableHead className="text-right">Redução PIS/COFINS (%)</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {aliquotas.map((aliquota) => {
                  const total = aliquota.ibs_estadual + aliquota.ibs_municipal + aliquota.cbs;
                  const isCurrent = aliquota.ano === currentYear;
                  const isPast = aliquota.ano < currentYear;

                  return (
                    <TableRow key={aliquota.id} className={isCurrent ? 'bg-primary/5' : ''}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {aliquota.ano}
                          {isCurrent && (
                            <Badge variant="secondary" className="text-xs">
                              Atual
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {aliquota.ibs_estadual.toFixed(2)}%
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {aliquota.ibs_municipal.toFixed(2)}%
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {aliquota.cbs.toFixed(2)}%
                      </TableCell>
                      <TableCell className="text-right font-mono font-bold text-ibs-cbs">
                        {total.toFixed(2)}%
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {aliquota.reduc_icms.toFixed(2)}%
                      </TableCell>
                      <TableCell className="text-right font-mono">
                        {aliquota.reduc_piscofins.toFixed(2)}%
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge
                          variant={isPast ? 'secondary' : isCurrent ? 'default' : 'outline'}
                        >
                          {isPast ? 'Passado' : isCurrent ? 'Vigente' : 'Futuro'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/50 bg-muted/30">
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">
            <strong>Nota:</strong> As alíquotas acima seguem o cronograma de transição da 
            Reforma Tributária (EC 132/2023). O IBS substituirá gradualmente ICMS e ISS, 
            enquanto a CBS substituirá PIS e COFINS até 2033.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
