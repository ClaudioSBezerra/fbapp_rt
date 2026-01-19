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
import { 
  Upload, FileSpreadsheet, CheckCircle, XCircle, Trash2, 
  AlertCircle, Loader2, RefreshCw, Download, Link2, Unlink
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

interface LinkStats {
  total_simples: number;
  vinculados_uso_consumo: number;
  vinculados_mercadorias: number;
  optantes_vinculados: number;
}

export function SimplesNacionalImporter() {
  const { user } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ParsedRow[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [linkStats, setLinkStats] = useState<LinkStats | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [showPreview, setShowPreview] = useState(false);
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Carregar estatísticas de vinculação
  const loadLinkStats = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc('get_simples_link_stats');
      if (!error && data && data.length > 0) {
        setLinkStats(data[0]);
      }
    } catch (err) {
      console.error('Erro ao carregar estatísticas de vinculação:', err);
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
        
        // Buscar estatísticas
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
        
        // Carregar estatísticas de vinculação
        await loadLinkStats();
      }
    } catch (err) {
      console.error('Erro ao carregar dados:', err);
    } finally {
      setIsLoading(false);
    }
  }, [user, loadLinkStats]);

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
        setImportProgress(Math.round((imported / validRows.length) * 100));
      }
      
      // Refresh materialized views com retry
      setIsRefreshing(true);
      let refreshAttempts = 0;
      let refreshSuccess = false;
      
      while (refreshAttempts < 3 && !refreshSuccess) {
        const { error: refreshError } = await supabase.rpc('refresh_materialized_views');
        if (!refreshError) {
          refreshSuccess = true;
        } else {
          refreshAttempts++;
          console.warn(`Retry refresh views (${refreshAttempts}/3):`, refreshError);
          await new Promise(r => setTimeout(r, 1000));
        }
      }
      setIsRefreshing(false);
      
      const viewsMsg = refreshSuccess ? 'Views atualizadas!' : 'Views pendentes de atualização.';
      toast.success(`${imported} registros importados! ${viewsMsg}`);
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

  const validCount = parsedData.filter(r => r.valid).length;
  const invalidCount = parsedData.filter(r => !r.valid).length;

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

        {/* Estatísticas de vinculação */}
        {linkStats && linkStats.total_simples > 0 && (
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Link2 className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Vinculação com Movimentos EFD</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-primary">
                  {linkStats.total_simples}
                </div>
                <div className="text-xs text-muted-foreground">CNPJs cadastrados</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">
                  {linkStats.vinculados_uso_consumo}
                </div>
                <div className="text-xs text-muted-foreground">Vinc. Uso/Consumo</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600">
                  {linkStats.vinculados_mercadorias}
                </div>
                <div className="text-xs text-muted-foreground">Vinc. Mercadorias</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">
                  {linkStats.optantes_vinculados}
                </div>
                <div className="text-xs text-muted-foreground">Optantes vinculados</div>
              </div>
            </div>
            {(linkStats.vinculados_uso_consumo > 0 || linkStats.vinculados_mercadorias > 0) && (
              <div className="mt-3 text-xs text-muted-foreground flex items-center gap-1">
                <CheckCircle className="h-3 w-3 text-green-500" />
                Dados do Simples Nacional já estão refletidos nos dashboards automaticamente.
              </div>
            )}
            {linkStats.total_simples > 0 && linkStats.vinculados_uso_consumo === 0 && linkStats.vinculados_mercadorias === 0 && (
              <div className="mt-3 text-xs text-amber-600 flex items-center gap-1">
                <Unlink className="h-3 w-3" />
                Nenhum CNPJ foi vinculado a movimentos. Verifique se os CNPJs correspondem aos fornecedores nos EFDs importados.
              </div>
            )}
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
                        {row.cnpj ? row.cnpj.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5') : '-'}
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
