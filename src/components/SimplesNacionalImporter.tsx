import { useState, useCallback, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Upload, FileSpreadsheet, CheckCircle, XCircle, Trash2, 
  AlertCircle, Loader2, Download, Link2, Unlink, FileDown, RefreshCw
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

interface ParsedRow {
  cnpj: string;
  isSimples: boolean;
  valid: boolean;
  error?: string;
}

interface Stats {
  total: number;
  optantes: number;
  naoOptantes: number;
}

interface AreaStats {
  total_participantes: number;
  vinculados: number;
  pendentes: number;
  optantes_simples: number;
  nao_optantes: number;
}

interface LinkStats {
  mercadorias: AreaStats;
  uso_consumo: AreaStats;
  total_simples_nacional: number;
}

interface PendingCnpj {
  cnpj: string;
  nome: string;
  quantidade_docs: number;
  valor_total: number;
}

interface RefreshResult {
  success: boolean;
  views_refreshed: string[];
  views_failed: string[];
  duration_ms: number;
  error?: string;
  validation?: {
    simples_vinculados_uso_consumo: number;
    simples_vinculados_mercadorias: number;
  };
}

export function SimplesNacionalImporter() {
  const { user } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ParsedRow[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [linkStats, setLinkStats] = useState<LinkStats | null>(null);
  const [pendingCnpjsUsoConsumo, setPendingCnpjsUsoConsumo] = useState<PendingCnpj[]>([]);
  const [pendingCnpjsMercadorias, setPendingCnpjsMercadorias] = useState<PendingCnpj[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [showPreview, setShowPreview] = useState(false);
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingPending, setIsLoadingPending] = useState(false);
  const [activeTab, setActiveTab] = useState<string>('mercadorias');
  const [lastRefreshValidation, setLastRefreshValidation] = useState<RefreshResult['validation'] | null>(null);

  // Carregar estatísticas de vinculação (nova função com JSONB)
  const loadLinkStats = useCallback(async (tid: string) => {
    try {
      const { data, error } = await supabase.rpc('get_simples_link_stats', { p_tenant_id: tid });
      if (!error && data) {
        setLinkStats(data as unknown as LinkStats);
      }
    } catch (err) {
      console.error('Erro ao carregar estatísticas de vinculação:', err);
    }
  }, []);

  // Carregar CNPJs pendentes de Uso/Consumo e Mercadorias
  const loadPendingCnpjs = useCallback(async (tid: string) => {
    setIsLoadingPending(true);
    try {
      // Carregar ambas as listas em paralelo
      const [usoConsumoResult, mercadoriasResult] = await Promise.all([
        supabase.rpc('get_cnpjs_uso_consumo_pendentes', { p_tenant_id: tid }),
        supabase.rpc('get_cnpjs_mercadorias_pendentes', { p_tenant_id: tid })
      ]);
      
      if (!usoConsumoResult.error && usoConsumoResult.data) {
        setPendingCnpjsUsoConsumo(usoConsumoResult.data as PendingCnpj[]);
      }
      
      if (!mercadoriasResult.error && mercadoriasResult.data) {
        setPendingCnpjsMercadorias(mercadoriasResult.data as PendingCnpj[]);
      }
    } catch (err) {
      console.error('Erro ao carregar CNPJs pendentes:', err);
    } finally {
      setIsLoadingPending(false);
    }
  }, []);

  // Carregar dados existentes e tenant
  const loadExistingData = useCallback(async () => {
    if (!user) return;
    
    setIsLoading(true);
    try {
      // Buscar tenant do usuário
      const { data: tenantData } = await supabase
        .from('user_tenants')
        .select('tenant_id')
        .eq('user_id', user.id)
        .single();
      
      if (tenantData) {
        setTenantId(tenantData.tenant_id);
        
        // Buscar estatísticas básicas
        const { data: simplesData, error } = await supabase
          .from('simples_nacional')
          .select('is_simples')
          .eq('tenant_id', tenantData.tenant_id);
        
        if (!error && simplesData) {
          const optantes = simplesData.filter(s => s.is_simples).length;
          setStats({
            total: simplesData.length,
            optantes,
            naoOptantes: simplesData.length - optantes
          });
        }
        
        // Carregar estatísticas de vinculação e CNPJs pendentes
        await Promise.all([
          loadLinkStats(tenantData.tenant_id),
          loadPendingCnpjs(tenantData.tenant_id)
        ]);
      }
    } catch (err) {
      console.error('Erro ao carregar dados:', err);
    } finally {
      setIsLoading(false);
    }
  }, [user, loadLinkStats, loadPendingCnpjs]);

  // Carregar dados ao montar
  useEffect(() => {
    loadExistingData();
  }, [loadExistingData]);

  // Parsear arquivo CSV
  const parseCSV = (content: string): ParsedRow[] => {
    const lines = content.split(/\r?\n/).filter(line => line.trim());
    const rows: ParsedRow[] = [];
    
    // Detectar separador
    const firstLine = lines[0];
    const separator = firstLine.includes(';') ? ';' : ',';
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      
      // Pular cabeçalho
      const lower = line.toLowerCase();
      if (lower.includes('cnpj') && (lower.includes('simples') || lower.includes('s/n'))) {
        continue;
      }
      
      const parts = line.split(separator);
      if (parts.length < 2) {
        rows.push({ cnpj: '', isSimples: false, valid: false, error: `Linha ${i + 1}: formato inválido` });
        continue;
      }
      
      // Limpar CNPJ (remover pontuação)
      const cnpjRaw = parts[0].replace(/\D/g, '');
      const simplesFlag = parts[1].trim().toUpperCase();
      
      // Validar CNPJ
      if (cnpjRaw.length !== 14) {
        rows.push({ cnpj: cnpjRaw, isSimples: false, valid: false, error: `CNPJ deve ter 14 dígitos` });
        continue;
      }
      
      // Validar flag S/N
      if (!['S', 'N'].includes(simplesFlag)) {
        rows.push({ cnpj: cnpjRaw, isSimples: false, valid: false, error: `Valor deve ser S ou N` });
        continue;
      }
      
      rows.push({
        cnpj: cnpjRaw,
        isSimples: simplesFlag === 'S',
        valid: true
      });
    }
    
    return rows;
  };

  // Handler de seleção de arquivo
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;
    
    if (!selectedFile.name.endsWith('.csv')) {
      toast.error('Por favor, selecione um arquivo CSV');
      return;
    }
    
    setFile(selectedFile);
    
    try {
      const content = await selectedFile.text();
      const parsed = parseCSV(content);
      setParsedData(parsed);
      setShowPreview(true);
    } catch (err) {
      toast.error('Erro ao ler arquivo');
    }
  };

  // Função robusta de refresh via edge function
  const refreshViewsViaEdge = async (): Promise<RefreshResult | null> => {
    try {
      const { data, error } = await supabase.functions.invoke('refresh-views', {
        body: { 
          validate: true,
          priority_views: ['extensions.mv_uso_consumo_detailed', 'extensions.mv_mercadorias_participante']
        }
      });
      
      if (error) {
        console.error('Edge function error:', error);
        return null;
      }
      
      return data as RefreshResult;
    } catch (err) {
      console.error('Failed to call refresh-views edge function:', err);
      return null;
    }
  };

  // Importar dados
  const handleImport = async () => {
    if (!tenantId || parsedData.length === 0) return;
    
    const validRows = parsedData.filter(r => r.valid);
    if (validRows.length === 0) {
      toast.error('Nenhum registro válido para importar');
      return;
    }
    
    setIsImporting(true);
    setImportProgress(0);
    setLastRefreshValidation(null);
    
    try {
      // Se substituir existente, limpar primeiro
      if (replaceExisting) {
        await supabase
          .from('simples_nacional')
          .delete()
          .eq('tenant_id', tenantId);
      }
      
      // Importar em lotes
      const batchSize = 100;
      let imported = 0;
      
      for (let i = 0; i < validRows.length; i += batchSize) {
        const batch = validRows.slice(i, i + batchSize).map(row => ({
          tenant_id: tenantId,
          cnpj: row.cnpj,
          is_simples: row.isSimples
        }));
        
        const { error } = await supabase
          .from('simples_nacional')
          .upsert(batch, { 
            onConflict: 'tenant_id,cnpj',
            ignoreDuplicates: false
          });
        
        if (error) throw error;
        
        imported += batch.length;
        setImportProgress(Math.round((imported / validRows.length) * 80)); // 80% para importação
      }
      
      // Refresh materialized views via edge function (mais robusto)
      setIsRefreshing(true);
      setImportProgress(85);
      
      const refreshResult = await refreshViewsViaEdge();
      
      setImportProgress(95);
      
      if (refreshResult) {
        setLastRefreshValidation(refreshResult.validation || null);
        
        if (refreshResult.success) {
          const vinculados = (refreshResult.validation?.simples_vinculados_uso_consumo || 0) + 
                            (refreshResult.validation?.simples_vinculados_mercadorias || 0);
          toast.success(`${imported} registros importados! Views atualizadas. ${vinculados} vínculos ativos.`);
        } else if (refreshResult.views_failed.length > 0) {
          toast.warning(`${imported} registros importados. Algumas views falharam: ${refreshResult.views_failed.join(', ')}`);
        }
      } else {
        // Fallback para RPC direto se edge function falhar
        console.warn('Edge function failed, trying RPC fallback...');
        let fallbackSuccess = false;
        for (let attempt = 0; attempt < 3; attempt++) {
          const { error: rpcError } = await supabase.rpc('refresh_materialized_views');
          if (!rpcError) {
            fallbackSuccess = true;
            break;
          }
          await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        }
        toast.success(`${imported} registros importados! ${fallbackSuccess ? 'Views atualizadas.' : 'Views pendentes.'}`);
      }
      
      setIsRefreshing(false);
      setImportProgress(100);
      
      setShowPreview(false);
      setFile(null);
      setParsedData([]);
      await loadExistingData();
    } catch (err: any) {
      console.error('Erro ao importar:', err);
      toast.error('Erro ao importar: ' + err.message);
    } finally {
      setIsImporting(false);
      setImportProgress(0);
    }
  };

  // Função para reprocessar views manualmente
  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      const result = await refreshViewsViaEdge();
      if (result) {
        setLastRefreshValidation(result.validation || null);
        if (result.success) {
          toast.success(`Views atualizadas em ${result.duration_ms}ms`);
        } else {
          toast.warning(`Algumas views falharam: ${result.views_failed.join(', ')}`);
        }
        await loadExistingData();
      } else {
        toast.error('Falha ao atualizar views');
      }
    } catch (err: any) {
      toast.error('Erro: ' + err.message);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Limpar todos os dados
  const handleClearAll = async () => {
    if (!tenantId) return;
    
    if (!confirm('Tem certeza que deseja remover todos os registros de Simples Nacional?')) {
      return;
    }
    
    setIsLoading(true);
    try {
      const { error } = await supabase
        .from('simples_nacional')
        .delete()
        .eq('tenant_id', tenantId);
      
      if (error) throw error;
      
      // Refresh materialized views
      await supabase.rpc('refresh_materialized_views');
      
      toast.success('Dados removidos com sucesso');
      setStats({ total: 0, optantes: 0, naoOptantes: 0 });
      setLinkStats(null);
      setPendingCnpjsUsoConsumo([]);
      setPendingCnpjsMercadorias([]);
    } catch (err: any) {
      toast.error('Erro ao remover dados: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Baixar modelo CSV
  const handleDownloadTemplate = () => {
    const content = 'CNPJ;SIMPLES\n12345678000199;S\n98765432000188;N\n';
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'modelo_simples_nacional.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  // Exportar CNPJs pendentes para CSV (parametrizado para cada área)
  const handleExportPending = (area: 'uso_consumo' | 'mercadorias') => {
    const pendingList = area === 'uso_consumo' ? pendingCnpjsUsoConsumo : pendingCnpjsMercadorias;
    const areaName = area === 'uso_consumo' ? 'uso_consumo' : 'mercadorias';
    
    if (pendingList.length === 0) {
      toast.info('Nenhum CNPJ pendente para exportar');
      return;
    }
    
    const header = 'CNPJ;NOME;QTD_DOCS;VALOR_TOTAL;SIMPLES\n';
    const rows = pendingList.map(p => 
      `${p.cnpj};${p.nome?.replace(/;/g, ',') || ''};${p.quantidade_docs};${p.valor_total?.toFixed(2) || '0'};`
    ).join('\n');
    
    const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cnpjs_pendentes_${areaName}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    
    toast.success(`${pendingList.length} CNPJs exportados para consulta`);
  };

  const validCount = parsedData.filter(r => r.valid).length;
  const invalidCount = parsedData.filter(r => !r.valid).length;
  
  const formatCurrency = (value: number) => 
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  const formatCnpj = (cnpj: string) => 
    cnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');

  // Renderizar estatísticas de uma área
  const renderAreaStats = (area: AreaStats, title: string, color: string) => (
    <div className="p-4 rounded-lg border bg-card">
      <h4 className="font-medium mb-3">{title}</h4>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-xs text-muted-foreground">Total fornecedores</div>
          <div className={`text-xl font-bold text-${color}-600`}>{area.total_participantes}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Cadastrados</div>
          <div className="text-xl font-bold text-green-600">{area.vinculados}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Pendentes</div>
          <div className="text-xl font-bold text-amber-600">{area.pendentes}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Optantes Simples</div>
          <div className="text-xl font-bold text-blue-600">{area.optantes_simples}</div>
        </div>
      </div>
      {area.total_participantes > 0 && (
        <div className="mt-3">
          <Progress 
            value={(area.vinculados / area.total_participantes) * 100} 
            className="h-2"
          />
          <div className="text-xs text-muted-foreground mt-1">
            {Math.round((area.vinculados / area.total_participantes) * 100)}% cobertura
          </div>
        </div>
      )}
    </div>
  );

  return (
    <Card className="border-border/50">
      <CardHeader>
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="h-5 w-5 text-muted-foreground" />
          <div>
            <CardTitle>Fornecedores do Simples Nacional</CardTitle>
            <CardDescription>
              Importe um CSV com CNPJs e indicação se são optantes do Simples Nacional (S/N)
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Estatísticas atuais */}
        {stats && stats.total > 0 && (
          <div className="flex flex-wrap gap-4 p-4 rounded-lg bg-muted/50">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Total cadastrado:</span>
              <Badge variant="secondary">{stats.total}</Badge>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Optantes:</span>
              <Badge variant="default" className="bg-green-600">{stats.optantes}</Badge>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Não optantes:</span>
              <Badge variant="outline">{stats.naoOptantes}</Badge>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClearAll}
              disabled={isLoading}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Limpar tudo
            </Button>
          </div>
        )}

        {/* Botão de reprocessar views */}
        {lastRefreshValidation && (
          <Alert className="border-blue-200 bg-blue-50 dark:bg-blue-950/20">
            <CheckCircle className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-blue-800 dark:text-blue-200">
              Vínculos ativos: <strong>{lastRefreshValidation.simples_vinculados_uso_consumo}</strong> em Uso/Consumo, 
              <strong> {lastRefreshValidation.simples_vinculados_mercadorias}</strong> em Mercadorias
            </AlertDescription>
          </Alert>
        )}

        {/* Estatísticas de vinculação por área */}
        {linkStats && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Link2 className="h-4 w-4 text-primary" />
                <span className="font-medium">Cobertura de Vinculação</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleManualRefresh}
                disabled={isRefreshing}
              >
                {isRefreshing ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-1" />
                )}
                Reprocessar views
              </Button>
            </div>
            
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="mercadorias">Mercadorias</TabsTrigger>
                <TabsTrigger value="uso_consumo">Uso e Consumo</TabsTrigger>
              </TabsList>
              
              <TabsContent value="mercadorias" className="mt-4 space-y-4">
                {linkStats.mercadorias && renderAreaStats(linkStats.mercadorias, 'Mercadorias', 'purple')}
                
                {/* CNPJs pendentes de Mercadorias */}
                {pendingCnpjsMercadorias.length > 0 && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Unlink className="h-4 w-4 text-amber-600" />
                        <span className="font-medium text-amber-800 dark:text-amber-200">
                          {pendingCnpjsMercadorias.length} CNPJs pendentes de cadastro
                        </span>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleExportPending('mercadorias')}
                        className="border-amber-300 hover:bg-amber-100"
                      >
                        <FileDown className="h-4 w-4 mr-2" />
                        Exportar para CSV
                      </Button>
                    </div>
                    <p className="text-xs text-amber-700 dark:text-amber-300 mb-3">
                      Exporte a lista para consultar no portal da Receita Federal e depois importe de volta com o status de Simples Nacional.
                    </p>
                    <ScrollArea className="h-[150px]">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>CNPJ</TableHead>
                            <TableHead>Nome</TableHead>
                            <TableHead className="text-right">Docs</TableHead>
                            <TableHead className="text-right">Valor</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {pendingCnpjsMercadorias.slice(0, 20).map((p, idx) => (
                            <TableRow key={idx}>
                              <TableCell className="font-mono text-xs">
                                {formatCnpj(p.cnpj)}
                              </TableCell>
                              <TableCell className="text-xs truncate max-w-[150px]">
                                {p.nome || '-'}
                              </TableCell>
                              <TableCell className="text-right text-xs">
                                {p.quantidade_docs}
                              </TableCell>
                              <TableCell className="text-right text-xs">
                                {formatCurrency(p.valor_total || 0)}
                              </TableCell>
                            </TableRow>
                          ))}
                          {pendingCnpjsMercadorias.length > 20 && (
                            <TableRow>
                              <TableCell colSpan={4} className="text-center text-xs text-muted-foreground">
                                ... e mais {pendingCnpjsMercadorias.length - 20} CNPJs
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  </div>
                )}
                
                {pendingCnpjsMercadorias.length === 0 && linkStats.mercadorias?.pendentes === 0 && linkStats.mercadorias?.total_participantes > 0 && (
                  <div className="flex items-center gap-2 text-green-600 text-sm">
                    <CheckCircle className="h-4 w-4" />
                    Todos os fornecedores de Mercadorias estão cadastrados!
                  </div>
                )}
              </TabsContent>
              
              <TabsContent value="uso_consumo" className="mt-4 space-y-4">
                {linkStats.uso_consumo && renderAreaStats(linkStats.uso_consumo, 'Uso e Consumo / Imobilizado', 'blue')}
                
                {/* CNPJs pendentes de Uso/Consumo */}
                {pendingCnpjsUsoConsumo.length > 0 && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Unlink className="h-4 w-4 text-amber-600" />
                        <span className="font-medium text-amber-800 dark:text-amber-200">
                          {pendingCnpjsUsoConsumo.length} CNPJs pendentes de cadastro
                        </span>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleExportPending('uso_consumo')}
                        className="border-amber-300 hover:bg-amber-100"
                      >
                        <FileDown className="h-4 w-4 mr-2" />
                        Exportar para CSV
                      </Button>
                    </div>
                    <p className="text-xs text-amber-700 dark:text-amber-300 mb-3">
                      Exporte a lista para consultar no portal da Receita Federal e depois importe de volta com o status de Simples Nacional.
                    </p>
                    <ScrollArea className="h-[150px]">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>CNPJ</TableHead>
                            <TableHead>Nome</TableHead>
                            <TableHead className="text-right">Docs</TableHead>
                            <TableHead className="text-right">Valor</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {pendingCnpjsUsoConsumo.slice(0, 20).map((p, idx) => (
                            <TableRow key={idx}>
                              <TableCell className="font-mono text-xs">
                                {formatCnpj(p.cnpj)}
                              </TableCell>
                              <TableCell className="text-xs truncate max-w-[150px]">
                                {p.nome || '-'}
                              </TableCell>
                              <TableCell className="text-right text-xs">
                                {p.quantidade_docs}
                              </TableCell>
                              <TableCell className="text-right text-xs">
                                {formatCurrency(p.valor_total || 0)}
                              </TableCell>
                            </TableRow>
                          ))}
                          {pendingCnpjsUsoConsumo.length > 20 && (
                            <TableRow>
                              <TableCell colSpan={4} className="text-center text-xs text-muted-foreground">
                                ... e mais {pendingCnpjsUsoConsumo.length - 20} CNPJs
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </ScrollArea>
                  </div>
                )}
                
                {pendingCnpjsUsoConsumo.length === 0 && linkStats.uso_consumo?.pendentes === 0 && linkStats.uso_consumo?.total_participantes > 0 && (
                  <div className="flex items-center gap-2 text-green-600 text-sm">
                    <CheckCircle className="h-4 w-4" />
                    Todos os fornecedores de Uso/Consumo estão cadastrados!
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        )}

        {/* Upload de arquivo */}
        {!showPreview && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <Label htmlFor="csv-file" className="sr-only">Arquivo CSV</Label>
                <Input
                  id="csv-file"
                  type="file"
                  accept=".csv"
                  onChange={handleFileSelect}
                  disabled={isLoading}
                  className="cursor-pointer"
                />
              </div>
              <Button
                variant="outline"
                onClick={handleDownloadTemplate}
                className="shrink-0"
              >
                <Download className="h-4 w-4 mr-2" />
                Baixar modelo
              </Button>
            </div>
            
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Formato do arquivo CSV</AlertTitle>
              <AlertDescription>
                <p>O arquivo deve conter duas colunas: <strong>CNPJ</strong> e <strong>S/N</strong></p>
                <p className="text-xs text-muted-foreground mt-1">
                  Separador aceito: ponto-e-vírgula (;) ou vírgula (,). CNPJ pode ser com ou sem formatação.
                </p>
              </AlertDescription>
            </Alert>
          </div>
        )}

        {/* Preview dos dados */}
        {showPreview && parsedData.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex gap-4">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span className="text-sm">{validCount} válidos</span>
                </div>
                {invalidCount > 0 && (
                  <div className="flex items-center gap-2">
                    <XCircle className="h-4 w-4 text-destructive" />
                    <span className="text-sm text-destructive">{invalidCount} inválidos</span>
                  </div>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setShowPreview(false);
                  setFile(null);
                  setParsedData([]);
                }}
              >
                Cancelar
              </Button>
            </div>

            <ScrollArea className="h-[200px] rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[180px]">CNPJ</TableHead>
                    <TableHead>Simples Nacional</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedData.slice(0, 50).map((row, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-mono text-xs">
                        {row.cnpj ? formatCnpj(row.cnpj) : '-'}
                      </TableCell>
                      <TableCell>
                        {row.valid && (
                          <Badge variant={row.isSimples ? 'default' : 'outline'} className={row.isSimples ? 'bg-green-600' : ''}>
                            {row.isSimples ? 'Sim' : 'Não'}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {row.valid ? (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        ) : (
                          <span className="text-xs text-destructive">{row.error}</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {parsedData.length > 50 && (
                    <TableRow>
                      <TableCell colSpan={3} className="text-center text-muted-foreground text-xs">
                        ... e mais {parsedData.length - 50} registros
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </ScrollArea>

            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={replaceExisting}
                  onCheckedChange={(checked) => setReplaceExisting(checked as boolean)}
                />
                <span className="text-sm">Substituir todos os registros existentes</span>
              </label>
            </div>

            {isImporting && (
              <div className="space-y-2">
                <Progress value={importProgress} />
                <p className="text-xs text-muted-foreground text-center">{importProgress}% concluído</p>
              </div>
            )}

            <div className="flex gap-2">
              <Button
                onClick={handleImport}
                disabled={validCount === 0 || isImporting}
                className="flex-1"
              >
                {isImporting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Importando...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Importar {validCount} registros
                  </>
                )}
              </Button>
            </div>
          </div>
        )}

        {isLoading && !showPreview && (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
