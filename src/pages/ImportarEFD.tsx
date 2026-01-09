import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Loader2, CheckCircle, FileText, ArrowRight, AlertCircle, Upload, Clock, XCircle, RefreshCw, Zap, Trash2, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useRole } from '@/hooks/useRole';
import { useSessionInfo } from '@/hooks/useSessionInfo';
import { toast } from 'sonner';
interface ImportCounts {
  mercadorias: number;
  energia_agua: number;
  fretes: number;
  servicos: number;
  refresh_success?: boolean;
  seen?: {
    a100?: number;
    c100?: number;
    c500?: number;
    c600?: number;
    d100?: number;
    d101?: number;
    d105?: number;
    d500?: number;
    d501?: number;
    d505?: number;
  };
}


interface ImportJob {
  id: string;
  user_id: string;
  empresa_id: string;
  filial_id: string | null;
  file_path: string;
  file_name: string;
  file_size: number;
  status: 'pending' | 'processing' | 'generating' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  total_lines: number;
  counts: ImportCounts;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

interface Empresa {
  id: string;
  nome: string;
  grupo_id: string;
}

function formatCNPJ(cnpj: string): string {
  const cleaned = cnpj.replace(/\D/g, '');
  return cleaned.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getStatusInfo(status: ImportJob['status']) {
  switch (status) {
    case 'pending':
      return { label: 'Aguardando', color: 'bg-muted text-muted-foreground', icon: Clock };
    case 'processing':
      return { label: 'Processando', color: 'bg-primary/10 text-primary', icon: Loader2 };
    case 'generating':
      return { label: 'Gerando dados...', color: 'bg-blue-500/10 text-blue-500', icon: Loader2 };
    case 'completed':
      return { label: 'Concluído', color: 'bg-positive/10 text-positive', icon: CheckCircle };
    case 'failed':
      return { label: 'Falhou', color: 'bg-destructive/10 text-destructive', icon: XCircle };
    case 'cancelled':
      return { label: 'Cancelado', color: 'bg-warning/10 text-warning', icon: XCircle };
  }
}

export default function ImportarEFD() {
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [selectedEmpresa, setSelectedEmpresa] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string>('');
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [recordLimit, setRecordLimit] = useState<number>(0);
  const [importScope, setImportScope] = useState<'all' | 'only_a' | 'only_c' | 'only_d'>('all');
  const [isClearing, setIsClearing] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearProgress, setClearProgress] = useState<{
    status: 'counting' | 'deleting' | 'done';
    currentTable: string;
    estimated: number;
    deleted: number;
  } | null>(null);
  const [progressAnimation, setProgressAnimation] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [refreshingViews, setRefreshingViews] = useState(false);
  const [viewsStatus, setViewsStatus] = useState<'loading' | 'empty' | 'ok'>('loading');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { session } = useAuth();
  const { isAdmin } = useRole();
  const { empresas: userEmpresas, isLoading: sessionLoading } = useSessionInfo();
  const navigate = useNavigate();

  // Check views status when jobs change
  useEffect(() => {
    const checkViews = async () => {
      if (!session) return;
      try {
        const { data, error } = await supabase.rpc('get_mv_dashboard_stats');
        if (error) {
          console.warn('Failed to check views status:', error);
          setViewsStatus('empty');
        } else {
          setViewsStatus(data && data.length > 0 ? 'ok' : 'empty');
        }
      } catch (err) {
        setViewsStatus('empty');
      }
    };
    checkViews();
  }, [session, jobs]);

  const handleRefreshViews = async () => {
    setRefreshingViews(true);
    
    try {
      toast.info('Atualizando painéis... Isso pode levar alguns segundos.');
      
      // Call the dedicated edge function for refresh with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000);
      
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/refresh-views`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          signal: controller.signal,
        }
      );
      
      clearTimeout(timeoutId);
      
      const result = await response.json();
      
      if (!response.ok || !result.success) {
        console.error('Refresh failed:', result);
        toast.error(result.error || 'Falha ao atualizar views.');
        setViewsStatus('empty');
        return;
      }
      
      console.log('Refresh completed:', result);
      toast.success(`Painéis atualizados com sucesso! (${result.duration_ms}ms)`);
      setViewsStatus('ok');
      
    } catch (err: any) {
      console.error('Failed to refresh views:', err);
      
      if (err.name === 'AbortError') {
        toast.error('A atualização está demorando muito. Tente novamente em alguns minutos.');
      } else {
        toast.error('Falha ao atualizar views. Tente novamente.');
      }
      setViewsStatus('empty');
    } finally {
      setRefreshingViews(false);
    }
  };

  // Load empresas baseado na role do usuário
  useEffect(() => {
    if (sessionLoading) return;
    
    // Usar empresas do hook useSessionInfo que já respeita admin vs user
    if (userEmpresas.length > 0) {
      setEmpresas(userEmpresas.map(e => ({ ...e, grupo_id: '' })));
      setSelectedEmpresa(userEmpresas[0].id);
    } else {
      setEmpresas([]);
      setSelectedEmpresa('');
    }
  }, [userEmpresas, sessionLoading]);

  // Load existing jobs and subscribe to realtime updates
  useEffect(() => {
    if (!session?.user?.id) return;

    const loadJobs = async () => {
      const { data } = await supabase
        .from('import_jobs')
        .select('*')
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false })
        .limit(10);
      
      if (data) {
        setJobs(data.map(job => ({
          ...job,
          counts: (job.counts as unknown) as ImportCounts,
          status: job.status as ImportJob['status'],
        })));
      }
    };

    loadJobs();

    // Subscribe to realtime updates
    const channel = supabase
      .channel('import-jobs-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'import_jobs',
          filter: `user_id=eq.${session.user.id}`,
        },
        (payload) => {
          console.log('Realtime update:', payload);
          
          if (payload.eventType === 'INSERT') {
            const newJob = payload.new as any;
            setJobs(prev => [{
              ...newJob,
              counts: (newJob.counts || { mercadorias: 0, energia_agua: 0, fretes: 0, servicos: 0 }) as ImportCounts,
              status: newJob.status as ImportJob['status'],
            }, ...prev].slice(0, 10));
          } else if (payload.eventType === 'UPDATE') {
            const updatedJob = payload.new as any;
            setJobs(prev => prev.map(job => 
              job.id === updatedJob.id 
                ? {
                    ...updatedJob,
                    counts: (updatedJob.counts || { mercadorias: 0, energia_agua: 0, fretes: 0, servicos: 0 }) as ImportCounts,
                    status: updatedJob.status as ImportJob['status'],
                  }
                : job
            ));
            
            // Show toast on completion and redirect
            if (updatedJob.status === 'completed') {
              const counts = updatedJob.counts as ImportCounts;
              const total = counts.mercadorias + counts.energia_agua + counts.fretes + (counts.servicos || 0);
              
              if (counts.refresh_success === false) {
                toast.warning(
                  `Importação concluída! ${total} registros importados. Os painéis podem demorar para atualizar. Use o botão "Atualizar Views" se necessário.`,
                  { duration: 8000 }
                );
                setViewsStatus('empty');
              } else {
                toast.success(`Importação concluída! ${total} registros importados. Redirecionando...`);
                setViewsStatus('ok');
              }
              
              // Redirect to Mercadorias after 3 seconds
              setTimeout(() => {
                navigate('/mercadorias');
              }, 3000);
            } else if (updatedJob.status === 'failed') {
              toast.error(`Importação falhou: ${updatedJob.error_message || 'Erro desconhecido'}`);
            }
          } else if (payload.eventType === 'DELETE') {
            const deletedId = (payload.old as any).id;
            setJobs(prev => prev.filter(job => job.id !== deletedId));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session?.user?.id]);

  const handleStartImport = async () => {
    if (!selectedFile || !selectedEmpresa || !session) return;

    setUploading(true);
    setUploadProgress('Enviando arquivo para o storage...');
    
    try {
      // Step 1: Upload file directly to Storage
      const timestamp = Date.now();
      const filePath = `${session.user.id}/${timestamp}_${selectedFile.name}`;
      
      const { error: uploadError } = await supabase.storage
        .from('efd-files')
        .upload(filePath, selectedFile, {
          contentType: 'text/plain',
          upsert: false,
        });

      if (uploadError) {
        throw new Error(`Erro ao enviar arquivo: ${uploadError.message}`);
      }

      console.log('File uploaded to storage:', filePath);
      setUploadProgress('Iniciando processamento...');

      // Step 2: Call parse-efd with metadata only (no file in body)
      const response = await supabase.functions.invoke('parse-efd', {
        body: {
          empresa_id: selectedEmpresa,
          file_path: filePath,
          file_name: selectedFile.name,
          file_size: selectedFile.size,
          record_limit: recordLimit,
          import_scope: importScope,
        },
      });

      if (response.error) {
        // Clean up uploaded file on error
        await supabase.storage.from('efd-files').remove([filePath]);
        throw new Error(response.error.message || 'Erro ao iniciar importação');
      }

      const data = response.data;
      if (data.error) {
        // Clean up uploaded file on error
        await supabase.storage.from('efd-files').remove([filePath]);
        throw new Error(data.error);
      }

      setSelectedFile(null);
      toast.success('Importação iniciada! Acompanhe o progresso abaixo.');
    } catch (error) {
      console.error('Error starting import:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erro ao iniciar importação';
      toast.error(errorMessage);
    } finally {
      setUploading(false);
      setUploadProgress('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleFileSelect = (file: File) => {
    if (!file.name.endsWith('.txt')) {
      toast.error('Por favor, selecione um arquivo .txt');
      return;
    }
    // Warn for very large files
    if (file.size > 500 * 1024 * 1024) {
      toast.warning('Arquivo muito grande (>500MB). O upload pode demorar.');
    }
    
    setSelectedFile(file);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) handleFileSelect(file);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragOver(false);
    const file = event.dataTransfer.files?.[0];
    if (file) handleFileSelect(file);
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleRetryJob = async (jobId: string) => {
    // For now, just show a message - full retry would require re-uploading the file
    toast.info('Para reprocessar, faça upload do arquivo novamente.');
  };

  const handleCancelJob = async (jobId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('cancel-import-job', {
        body: { job_id: jobId },
      });

      if (error) {
        throw new Error(error.message || 'Erro ao cancelar importação');
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      toast.success('Importação cancelada com sucesso.');
    } catch (error) {
      console.error('Error cancelling job:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erro ao cancelar importação';
      toast.error(errorMessage);
    }
  };

  const activeJobs = jobs.filter(j => j.status === 'pending' || j.status === 'processing');
  const completedJobs = jobs.filter(j => j.status === 'completed' || j.status === 'failed' || j.status === 'cancelled');

  // Animated progress effect for database clearing
  useEffect(() => {
    if (!clearProgress || clearProgress.status === 'done') return;
    
    const messages = [
      'Contando registros...',
      'Deletando mercadorias...',
      'Deletando energia e água...',
      'Deletando fretes...',
      'Atualizando índices...',
    ];
    
    let messageIndex = 0;
    let progress = 0;
    
    setStatusMessage(messages[0]);
    setProgressAnimation(0);
    
    const messageInterval = setInterval(() => {
      messageIndex = Math.min(messageIndex + 1, messages.length - 1);
      setStatusMessage(messages[messageIndex]);
    }, 4000);
    
    const progressInterval = setInterval(() => {
      progress = Math.min(progress + 2, 90);
      setProgressAnimation(progress);
    }, 500);
    
    return () => {
      clearInterval(messageInterval);
      clearInterval(progressInterval);
    };
  }, [clearProgress?.status]);

  const handleClearDatabase = async () => {
    if (!session?.user?.id) return;
    
    setIsClearing(true);
    setProgressAnimation(0);
    setStatusMessage('Contando registros...');
    setClearProgress({ 
      status: 'deleting', 
      currentTable: '', 
      estimated: 0, 
      deleted: 0 
    });

    try {
      const { data, error } = await supabase.functions.invoke('clear-imported-data');
      
      if (error) {
        console.error('Erro ao chamar função:', error);
        throw error;
      }

      if (data?.error) {
        console.error('Erro da função:', data.error);
        throw new Error(data.error);
      }

      // Update progress to show completion
      const totalDeleted = (data?.deleted?.mercadorias || 0) + 
                          (data?.deleted?.energia_agua || 0) + 
                          (data?.deleted?.fretes || 0);
      
      setProgressAnimation(100);
      setClearProgress({
        status: 'done',
        currentTable: 'Concluído!',
        estimated: totalDeleted,
        deleted: totalDeleted
      });

      // Wait a bit to show completion, then close
      setTimeout(() => {
        setJobs([]);
        toast.success(data?.message || 'Base de dados limpa com sucesso!');
        setShowClearConfirm(false);
        setClearProgress(null);
      }, 1500);
      
    } catch (error) {
      console.error('Error clearing database:', error);
      toast.error('Erro ao limpar base de dados');
      setClearProgress(null);
      setShowClearConfirm(false);
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Clear Database Confirmation Dialog */}
      <AlertDialog open={showClearConfirm} onOpenChange={(open) => {
        if (!isClearing) {
          setShowClearConfirm(open);
          if (!open) setClearProgress(null);
        }
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Limpar Base Importada do SPED
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                {clearProgress ? (
                  <div className="space-y-4 py-4">
                    <div className="flex items-center gap-2">
                      {clearProgress.status === 'done' ? (
                        <CheckCircle className="h-5 w-5 text-positive" />
                      ) : (
                        <Loader2 className="h-5 w-5 animate-spin text-primary" />
                      )}
                      <span className="font-medium">
                        {clearProgress.status === 'done' ? 'Concluído!' : statusMessage}
                      </span>
                    </div>
                    <Progress 
                      value={clearProgress.status === 'done' ? 100 : progressAnimation} 
                      className="h-3" 
                    />
                    <p className="text-xs text-muted-foreground text-center">
                      {clearProgress.status === 'done' 
                        ? `${clearProgress.deleted.toLocaleString('pt-BR')} registros removidos`
                        : 'Isso pode levar alguns minutos para bases grandes...'}
                    </p>
                  </div>
                ) : (
                  <>
                    <p>
                      {isAdmin 
                        ? 'Esta ação irá remover permanentemente TODOS os dados importados de TODAS as empresas:'
                        : `Esta ação irá remover permanentemente os dados importados da empresa ${empresas[0]?.nome || 'vinculada'}:`
                      }
                    </p>
                    <ul className="list-disc list-inside mt-2 space-y-1">
                      <li>Mercadorias</li>
                      <li>Energia e Água</li>
                      <li>Fretes</li>
                      <li>Serviços</li>
                      <li>Histórico de importações</li>
                    </ul>
                    <p className="mt-3 font-semibold text-destructive">
                      Esta ação não pode ser desfeita!
                    </p>
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            {!clearProgress && (
              <>
                <AlertDialogCancel disabled={isClearing}>Cancelar</AlertDialogCancel>
                <Button 
                  onClick={handleClearDatabase}
                  disabled={isClearing}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {isClearing && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                  Confirmar Limpeza
                </Button>
              </>
            )}
            {clearProgress?.status === 'done' && (
              <AlertDialogAction onClick={() => {
                setShowClearConfirm(false);
                setClearProgress(null);
              }}>
                Fechar
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Views Status Alert */}
      {viewsStatus === 'empty' && jobs.some(j => j.status === 'completed') && (
        <Card className="border-warning bg-warning/5">
          <CardContent className="flex items-center justify-between py-4">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-warning" />
              <div>
                <p className="font-medium text-warning">Views desatualizadas</p>
                <p className="text-sm text-muted-foreground">
                  Os dados foram importados mas os painéis ainda não foram atualizados.
                </p>
              </div>
            </div>
            <Button 
              variant="outline" 
              size="sm"
              onClick={handleRefreshViews}
              disabled={refreshingViews}
              className="border-warning text-warning hover:bg-warning hover:text-warning-foreground"
            >
              {refreshingViews ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Atualizando...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Atualizar Views
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Upload Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Importar EFD Contribuições
          </CardTitle>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              size="sm"
              onClick={handleRefreshViews}
              disabled={refreshingViews || uploading}
            >
              {refreshingViews ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <RefreshCw className="h-4 w-4 mr-2" />
              )}
              Atualizar Painéis
            </Button>
            <Button 
              variant="outline" 
              size="sm"
              className="text-destructive border-destructive hover:bg-destructive hover:text-destructive-foreground"
              onClick={() => setShowClearConfirm(true)}
              disabled={uploading || isClearing}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Limpar Base
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Importe arquivos EFD Contribuições para cadastrar mercadorias, energia/água e fretes.
            Arquivos grandes são processados em background.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="empresa">Empresa Destino</Label>
              <Select value={selectedEmpresa} onValueChange={setSelectedEmpresa} disabled={uploading}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a empresa" />
                </SelectTrigger>
                <SelectContent>
                  {empresas.map((empresa) => (
                    <SelectItem key={empresa.id} value={empresa.id}>
                      {empresa.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="importScope" className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-muted-foreground" />
                Escopo da Importação
              </Label>
              <Select value={importScope} onValueChange={(v) => setImportScope(v as 'all' | 'only_a' | 'only_c' | 'only_d')} disabled={uploading}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o escopo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos (A + C + D)</SelectItem>
                  <SelectItem value="only_a">Somente Bloco A (Serviços)</SelectItem>
                  <SelectItem value="only_c">Somente Bloco C (Mercadorias/Energia)</SelectItem>
                  <SelectItem value="only_d">Somente Bloco D (Fretes/Telecom)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {importScope === 'all' && 'Importará blocos A (Serviços), C (Mercadorias/Energia) e D (Fretes)'}
                {importScope === 'only_a' && 'Importará apenas A100 (Notas Fiscais de Serviço com ISS)'}
                {importScope === 'only_c' && 'Importará apenas C100 (NF-e), C500 (Energia/Água), C600 (Consolidação)'}
                {importScope === 'only_d' && 'Importará apenas D100 (CT-e) e D500 (Telecom)'}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="recordLimit" className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-warning" />
                Limite por Bloco (teste)
              </Label>
              <Input
                id="recordLimit"
                type="number"
                min="0"
                placeholder="0 = sem limite"
                value={recordLimit || ''}
                onChange={(e) => setRecordLimit(parseInt(e.target.value) || 0)}
                disabled={uploading}
                className="w-full"
              />
              <p className="text-xs text-muted-foreground">
                {recordLimit > 0 
                  ? `Importará até ${recordLimit} registros de cada bloco ativo`
                  : 'Importará todos os registros do arquivo'}
              </p>
            </div>
          </div>

          <div
            className={`
              relative border-2 border-dashed rounded-lg p-8 transition-colors cursor-pointer
              ${isDragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/50'}
              ${uploading ? 'pointer-events-none opacity-60' : ''}
              ${!selectedEmpresa ? 'pointer-events-none opacity-40' : ''}
            `}
            onClick={() => !selectedFile && fileInputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt"
              onChange={handleFileChange}
              className="hidden"
              disabled={uploading || !selectedEmpresa}
            />
            
            <div className="flex flex-col items-center gap-3">
              {uploading ? (
                <>
                  <Loader2 className="h-10 w-10 text-primary animate-spin" />
                  <div className="space-y-1 text-center">
                    <p className="text-sm font-medium text-foreground">{uploadProgress || 'Enviando...'}</p>
                    <p className="text-xs text-muted-foreground">O processamento continuará em background</p>
                  </div>
                </>
              ) : selectedFile ? (
                <>
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <FileText className="h-6 w-6 text-primary" />
                  </div>
                  <div className="space-y-1 text-center">
                    <p className="text-sm font-medium text-foreground">{selectedFile.name}</p>
                    <p className="text-xs text-muted-foreground">{formatFileSize(selectedFile.size)}</p>
                  </div>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={(e) => { e.stopPropagation(); setSelectedFile(null); }}
                  >
                    Remover
                  </Button>
                </>
              ) : (
                <>
                  <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                    <FileText className="h-6 w-6 text-muted-foreground" />
                  </div>
                  <div className="space-y-1 text-center">
                    <p className="text-sm font-medium text-foreground">
                      Arraste o arquivo ou clique para selecionar
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Aceita arquivos .txt (EFD Contribuições) - até 500MB
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>

          {selectedFile && !uploading && (
            <Button 
              onClick={handleStartImport} 
              className="w-full"
              disabled={!selectedEmpresa}
            >
              Iniciar Importação
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Active Jobs */}
      {activeJobs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Loader2 className="h-5 w-5 animate-spin" />
              Importações em Andamento
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {activeJobs.map((job) => {
              const statusInfo = getStatusInfo(job.status);
              const StatusIcon = statusInfo.icon;
              
              return (
                <div key={job.id} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="space-y-1 min-w-0 flex-1">
                      <p className="font-medium text-foreground truncate max-w-[200px] sm:max-w-xs" title={job.file_name}>{job.file_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatFileSize(job.file_size)} • Iniciado em {formatDate(job.created_at)}
                      </p>
                    </div>
                    <Badge className={statusInfo.color}>
                      <StatusIcon className={`h-3 w-3 mr-1 ${job.status === 'processing' ? 'animate-spin' : ''}`} />
                      {statusInfo.label}
                    </Badge>
                  </div>
                  
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Progresso</span>
                      <span>{job.progress}%</span>
                    </div>
                    <Progress value={job.progress} className="h-2" />
                    {job.total_lines > 0 && (
                      <p className="text-xs text-muted-foreground text-right">
                        {job.total_lines.toLocaleString('pt-BR')} linhas
                      </p>
                    )}
                  </div>

                  {job.status === 'processing' && (
                    <div className="flex gap-4 text-xs text-muted-foreground">
                      <span>Mercadorias: {job.counts.mercadorias}</span>
                      <span>Energia/Água: {job.counts.energia_agua}</span>
                      <span>Fretes: {job.counts.fretes}</span>
                    </div>
                  )}

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleCancelJob(job.id)}
                    className="mt-2 text-destructive hover:text-destructive"
                  >
                    <XCircle className="h-4 w-4 mr-1" />
                    Cancelar
                  </Button>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Completed Jobs */}
      {completedJobs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <CheckCircle className="h-5 w-5 text-positive" />
              Histórico de Importações
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {completedJobs.map((job) => {
                const statusInfo = getStatusInfo(job.status);
                const StatusIcon = statusInfo.icon;
                const totalRecords = job.counts.mercadorias + job.counts.energia_agua + job.counts.fretes;
                
                return (
                  <div key={job.id} className="border rounded-lg p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="space-y-1 min-w-0 flex-1">
                        <p className="font-medium text-foreground truncate max-w-[200px] sm:max-w-xs" title={job.file_name}>{job.file_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatFileSize(job.file_size)} • {formatDate(job.created_at)}
                        </p>
                      </div>
                      <Badge className={statusInfo.color}>
                        <StatusIcon className="h-3 w-3 mr-1" />
                        {statusInfo.label}
                      </Badge>
                    </div>

                    {job.status === 'completed' && (
                      <div className="bg-muted/50 rounded-lg p-3 mt-3">
                        <div className="grid grid-cols-3 gap-4 text-center">
                          <div>
                            <p className="text-lg font-semibold text-foreground">{job.counts.mercadorias}</p>
                            <p className="text-xs text-muted-foreground">Mercadorias</p>
                          </div>
                          <div>
                            <p className="text-lg font-semibold text-foreground">{job.counts.energia_agua}</p>
                            <p className="text-xs text-muted-foreground">Energia/Água</p>
                          </div>
                          <div>
                            <p className="text-lg font-semibold text-foreground">{job.counts.fretes}</p>
                            <p className="text-xs text-muted-foreground">Fretes</p>
                          </div>
                        </div>
                        <div className="text-center mt-2 pt-2 border-t border-border">
                          <p className="text-sm font-medium text-foreground">{totalRecords} registros importados</p>
                        </div>
                        {/* Seen Counts for diagnostics */}
                        {job.counts.seen && (job.counts.seen.d100 !== undefined || job.counts.seen.d500 !== undefined) && (
                          <div className="text-center mt-2 pt-2 border-t border-border">
                            <p className="text-xs text-muted-foreground">
                              Registros detectados no arquivo: 
                              {job.counts.seen.d100 ? ` D100: ${job.counts.seen.d100}` : ''} 
                              {job.counts.seen.d500 ? ` D500: ${job.counts.seen.d500}` : ''}
                              {!job.counts.seen.d100 && !job.counts.seen.d500 && ' nenhum D100/D500'}
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {job.status === 'failed' && job.error_message && (
                      <div className="bg-destructive/10 rounded-lg p-3 mt-3 flex items-start gap-2">
                        <AlertCircle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
                        <p className="text-sm text-destructive">{job.error_message}</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {jobs.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <p className="text-muted-foreground">
              Nenhuma importação encontrada. Faça upload de um arquivo EFD para começar.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
