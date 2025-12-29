import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, ArrowDownRight, ArrowUpRight, Truck } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';

interface FreteItem {
  id: string;
  tipo: string;
  mes_ano: string;
  ncm: string | null;
  descricao: string | null;
  cnpj_transportadora: string | null;
  valor: number;
  pis: number;
  cofins: number;
  filial_id: string;
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
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return new Intl.DateTimeFormat('pt-BR', { month: 'short', year: 'numeric' }).format(date);
}

function formatCNPJ(cnpj: string): string {
  const cleaned = cnpj.replace(/\D/g, '');
  return cleaned.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

function calculateIbsCbs(valor: number, aliquota: Aliquota | null): number {
  if (!aliquota) return 0;
  const totalAliquota = (aliquota.ibs_estadual + aliquota.ibs_municipal + aliquota.cbs) / 100;
  return valor * totalAliquota;
}

export default function Fretes() {
  const [items, setItems] = useState<FreteItem[]>([]);
  const [aliquotas, setAliquotas] = useState<Aliquota[]>([]);
  const [filiais, setFiliais] = useState<Filial[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [selectedFilial, setSelectedFilial] = useState<string>('');
  const { user } = useAuth();

  const [newItem, setNewItem] = useState({
    tipo: 'entrada',
    mes_ano: new Date().toISOString().slice(0, 7),
    ncm: '',
    descricao: '',
    cnpj_transportadora: '',
    valor: '',
    pis: '',
    cofins: '',
  });

  useEffect(() => {
    async function fetchData() {
      try {
        const { data: aliquotasData } = await supabase
          .from('aliquotas')
          .select('ano, ibs_estadual, ibs_municipal, cbs')
          .order('ano');

        if (aliquotasData) setAliquotas(aliquotasData);

        const { data: itemsData } = await supabase
          .from('fretes')
          .select('*')
          .order('mes_ano', { ascending: false });

        if (itemsData) setItems(itemsData);

        const { data: filiaisData } = await supabase
          .from('filiais')
          .select('id, cnpj, razao_social, nome_fantasia');

        if (filiaisData) {
          setFiliais(filiaisData);
          if (filiaisData.length > 0 && !selectedFilial) {
            setSelectedFilial(filiaisData[0].id);
          }
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

  const handleNewItem = async () => {
    if (!selectedFilial) {
      toast.error('Selecione uma filial');
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.from('fretes').insert({
        filial_id: selectedFilial,
        tipo: newItem.tipo,
        mes_ano: `${newItem.mes_ano}-01`,
        ncm: newItem.ncm || null,
        descricao: newItem.descricao || null,
        cnpj_transportadora: newItem.cnpj_transportadora || null,
        valor: parseFloat(newItem.valor) || 0,
        pis: parseFloat(newItem.pis) || 0,
        cofins: parseFloat(newItem.cofins) || 0,
      });

      if (error) throw error;

      toast.success('Frete adicionado com sucesso');
      setDialogOpen(false);
      setNewItem({
        tipo: 'entrada',
        mes_ano: new Date().toISOString().slice(0, 7),
        ncm: '',
        descricao: '',
        cnpj_transportadora: '',
        valor: '',
        pis: '',
        cofins: '',
      });

      const { data: itemsData } = await supabase
        .from('fretes')
        .select('*')
        .order('mes_ano', { ascending: false });

      if (itemsData) setItems(itemsData);
    } catch (error) {
      console.error('Error adding item:', error);
      toast.error('Erro ao adicionar frete');
    } finally {
      setSubmitting(false);
    }
  };

  const currentYear = new Date().getFullYear();
  const aliquotaAtual = aliquotas.find((a) => a.ano === currentYear) || aliquotas[0];

  const entradas = items.filter((i) => i.tipo === 'entrada');
  const saidas = items.filter((i) => i.tipo === 'saida');

  const totalEntradas = entradas.reduce((acc, i) => acc + i.pis + i.cofins, 0);
  const totalSaidas = saidas.reduce((acc, i) => acc + i.pis + i.cofins, 0);

  const hasFiliais = filiais.length > 0;

  const renderTable = (data: FreteItem[]) => {
    if (data.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Truck className="h-12 w-12 text-muted-foreground/30 mb-4" />
          <p className="text-muted-foreground">Nenhum frete registrado</p>
          <p className="text-sm text-muted-foreground/60 mt-1">
            Adicione registros de fretes
          </p>
        </div>
      );
    }

    return (
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Mês/Ano</TableHead>
              <TableHead>NCM</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>CNPJ Transportadora</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead className="text-right text-pis-cofins">PIS+COFINS</TableHead>
              <TableHead className="text-right text-ibs-cbs">IBS+CBS</TableHead>
              <TableHead className="text-right">Diferença</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((item) => {
              const pisCofins = item.pis + item.cofins;
              const ibsCbs = calculateIbsCbs(item.valor, aliquotaAtual);
              const diferenca = ibsCbs - pisCofins;

              return (
                <TableRow key={item.id}>
                  <TableCell>{formatDate(item.mes_ano)}</TableCell>
                  <TableCell>
                    <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                      {item.ncm || '-'}
                    </code>
                  </TableCell>
                  <TableCell className="max-w-[200px] truncate">
                    {item.descricao || '-'}
                  </TableCell>
                  <TableCell>
                    {item.cnpj_transportadora ? formatCNPJ(item.cnpj_transportadora) : '-'}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(item.valor)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-pis-cofins">
                    {formatCurrency(pisCofins)}
                  </TableCell>
                  <TableCell className="text-right font-mono text-ibs-cbs">
                    {formatCurrency(ibsCbs)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge
                      variant={diferenca > 0 ? 'destructive' : diferenca < 0 ? 'default' : 'secondary'}
                      className={diferenca < 0 ? 'bg-positive text-positive-foreground' : ''}
                    >
                      {diferenca > 0 ? '+' : ''}
                      {formatCurrency(diferenca)}
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
          <h1 className="text-2xl font-bold text-foreground">Fretes</h1>
          <p className="text-muted-foreground">
            Comparativo PIS+COFINS vs IBS+CBS para fretes
          </p>
        </div>
        <Button size="sm" onClick={() => setDialogOpen(true)} disabled={!hasFiliais}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Frete
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <ArrowDownRight className="h-4 w-4" />
              Total Entradas (Fretes s/ Compras)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-pis-cofins">
              {formatCurrency(totalEntradas)}
            </p>
            <p className="text-xs text-muted-foreground">PIS+COFINS acumulado</p>
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <ArrowUpRight className="h-4 w-4" />
              Total Saídas (Fretes s/ Vendas)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-pis-cofins">
              {formatCurrency(totalSaidas)}
            </p>
            <p className="text-xs text-muted-foreground">PIS+COFINS acumulado</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/50">
        <Tabs defaultValue="entradas" className="w-full">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Registros</CardTitle>
                <CardDescription>
                  Visualize fretes sobre compras e vendas
                </CardDescription>
              </div>
              <TabsList>
                <TabsTrigger value="entradas">Entradas</TabsTrigger>
                <TabsTrigger value="saidas">Saídas</TabsTrigger>
              </TabsList>
            </div>
          </CardHeader>
          <CardContent>
            <TabsContent value="entradas" className="mt-0">
              {loading ? (
                <div className="py-12 text-center text-muted-foreground">Carregando...</div>
              ) : (
                renderTable(entradas)
              )}
            </TabsContent>
            <TabsContent value="saidas" className="mt-0">
              {loading ? (
                <div className="py-12 text-center text-muted-foreground">Carregando...</div>
              ) : (
                renderTable(saidas)
              )}
            </TabsContent>
          </CardContent>
        </Tabs>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Frete</DialogTitle>
            <DialogDescription>
              Adicione um registro de frete.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Filial</Label>
                <Select value={selectedFilial} onValueChange={setSelectedFilial}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {filiais.map((filial) => (
                      <SelectItem key={filial.id} value={filial.id}>
                        {filial.nome_fantasia || filial.razao_social}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Tipo</Label>
                <Select
                  value={newItem.tipo}
                  onValueChange={(v) => setNewItem({ ...newItem, tipo: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="entrada">Entrada (s/ Compra)</SelectItem>
                    <SelectItem value="saida">Saída (s/ Venda)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="mes_ano">Mês/Ano</Label>
                <Input
                  id="mes_ano"
                  type="month"
                  value={newItem.mes_ano}
                  onChange={(e) => setNewItem({ ...newItem, mes_ano: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ncm">NCM</Label>
                <Input
                  id="ncm"
                  placeholder="00000000"
                  value={newItem.ncm}
                  onChange={(e) => setNewItem({ ...newItem, ncm: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="cnpj_transportadora">CNPJ Transportadora</Label>
              <Input
                id="cnpj_transportadora"
                placeholder="00000000000000"
                value={newItem.cnpj_transportadora}
                onChange={(e) => setNewItem({ ...newItem, cnpj_transportadora: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="descricao">Descrição</Label>
              <Input
                id="descricao"
                placeholder="Descrição do frete"
                value={newItem.descricao}
                onChange={(e) => setNewItem({ ...newItem, descricao: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="valor">Valor (R$)</Label>
                <Input
                  id="valor"
                  type="number"
                  step="0.01"
                  placeholder="0,00"
                  value={newItem.valor}
                  onChange={(e) => setNewItem({ ...newItem, valor: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pis">PIS (R$)</Label>
                <Input
                  id="pis"
                  type="number"
                  step="0.01"
                  placeholder="0,00"
                  value={newItem.pis}
                  onChange={(e) => setNewItem({ ...newItem, pis: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cofins">COFINS (R$)</Label>
                <Input
                  id="cofins"
                  type="number"
                  step="0.01"
                  placeholder="0,00"
                  value={newItem.cofins}
                  onChange={(e) => setNewItem({ ...newItem, cofins: e.target.value })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleNewItem} disabled={submitting || !selectedFilial}>
              {submitting ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
