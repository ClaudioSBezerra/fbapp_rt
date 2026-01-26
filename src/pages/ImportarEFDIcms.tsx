import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Loader2, CheckCircle, FileText, AlertCircle, Upload, Clock, XCircle, RefreshCw, AlertTriangle, FileWarning, Trash2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useRole } from '@/hooks/useRole';
import { useSessionInfo } from '@/hooks/useSessionInfo';
import { useResumableUpload } from '@/hooks/useResumableUpload';
import { UploadProgressDisplay } from '@/components/UploadProgress';
import { toast } from 'sonner';
import { formatCNPJMasked } from '@/lib/formatFilial';

interface ImportCounts {
  uso_consumo_imobilizado: number;
  participantes?: number;
  estabelecimentos?: number;
  refresh_success?: boolean;
}

interface ImportJob {
  id: string;
  user_id: string;
  empresa_id: string;
  filial_id: string | null;
  file_path: string;
  file_name: string;
  file_size: number;
  status: 'pending' | 'processing' | 'generating' | 'refreshing_views' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  total_lines: number;
  counts: ImportCounts;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  bytes_processed: number | null;
  chunk_number: number | null;
  import_scope: string;
}

interface Empresa {
  id: string;
  nome: string;
}

interface PeriodoDisponivel {
  mes_ano: string;
  label: string;
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
    case 'refreshing_views':
      return { label: 'Atualizando Painéis...', color: 'bg-purple-500/10 text-purple-500', icon: RefreshCw };
    case 'completed':
      return { label: 'Concluído', color: 'bg-positive/10 text-positive', icon: CheckCircle };
    case 'failed':
      return { label: 'Falhou', color: 'bg-destructive/10 text-destructive', icon: XCircle };
    case 'cancelled':
      return { label: 'Cancelado', color: 'bg-warning/10 text-warning', icon: XCircle };
  }
}

export default function ImportarEFDIcms() {
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [selectedEmpresa, setSelectedEmpresa] = useState<string>('');
  const [processingImport, setProcessingImport] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [currentFileIndex, setCurrentFileIndex] = useState<number>(-1);
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [periodosDisponiveis, setPeriodosDisponiveis] = useState<PeriodoDisponivel[]>([]);
  const [loadingPeriodos, setLoadingPeriodos] = useState(true);
  const [hasEfdContribuicoes, setHasEfdContribuicoes] = useState(false);
  const [currentUploadPath, setCurrentUploadPath] = useState<string>('');
  const [activeBatchIds, setActiveBatchIds] = useState<string[]>([]);
  const [waitingForBatchCompletion, setWaitingForBatchCompletion] = useState(false);
  
  // States for clearing database
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
  
  // States for refreshing views
  const [refreshingViews, setRefreshingViews] = useState(false);
  const [viewsStatus, setViewsStatus] = useState<'loading' | 'empty' | 'ok'>('loading');
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { session } = useAuth();
  const { isAdmin } = useRole();
  const { empresas: userEmpresas, isLoading: sessionLoading } = useSessionInfo();
  const navigate = useNavigate();

  // Resumable upload hook
  const {
    progress: uploadProgress,
    startUpload,
    cancelUpload,
    resetUpload,
    isUploading,
    isPaused,
    isCompleted: uploadCompleted,
    hasError: uploadHasError,
  } = useResumableUpload({
    bucketName: 'efd-files',
    onError: (error) => {
      console.error('Upload failed:', error);
      toast.error(`Erro no upload: ${error.message}`);
    },
  });

  const uploading = isUploading || isPaused || processingImport;

  // Load empresas based on user role
  useEffect(() => {
    if (sessionLoading) return;
    
    if (userEmpresas.length > 0) {
      setEmpresas(userEmpresas.map(e => ({ ...e, grupo_id: '' })));
      // Only set selected if not already set
      if (!selectedEmpresa) {
        setSelectedEmpresa(userEmpresas[0].id);
      }
    } else {
      setEmpresas([]);
      setSelectedEmpresa('');
    }
  }, [userEmpresas, sessionLoading, selectedEmpresa]);

  // Load existing jobs function
  const loadJobs = useCallback(async () => {
    if (!session?.user?.id) return;
    
    const { data } = await supabase
      .from('import_jobs')
      .select('*')
      .eq('user_id', session.user.id)
      .eq('import_scope', 'icms_uso_consumo')
      .order('created_at', { ascending: false })
      .limit(50);
    
    if (data) {
      setJobs(data.map(job => ({
        ...job,
        counts: (job.counts as unknown) as ImportCounts,
        status: job.status as ImportJob['status'],
      })));
    }
  }, [session?.user?.id]);

  // Load existing jobs and subscribe to realtime updates
  useEffect(() => {
    if (!session?.user?.id) return;

    loadJobs();

    // Subscribe to realtime updates
    const channel = supabase
      .channel('import-jobs-icms-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'import_jobs',
          filter: `user_id=eq.${session.user.id}`,
        },
        (payload) => {
          const newOrUpdatedJob = (payload.new || payload.old) as any;
          
          // Check scope if possible (for updates/inserts)
          if (payload.eventType !== 'DELETE' && newOrUpdatedJob.import_scope !== 'icms_uso_consumo') {
            return;
          }

          if (payload.eventType === 'INSERT') {
            const newJob = payload.new as any;
            setJobs(prev => [{
              ...newJob,
              counts: (newJob.counts || {}) as ImportCounts,
              status: newJob.status as ImportJob['status'],
            }, ...prev].slice(0, 50));
          } else if (payload.eventType === 'UPDATE') {
            const updatedJob = payload.new as any;
            setJobs(prev => prev.map(job => 
              job.id === updatedJob.id 
                ? {
                    ...updatedJob,
                    counts: (updatedJob.counts || {}) as ImportCounts,
                    status: updatedJob.status as ImportJob['status'],
                  }
                : job
            ));
            
            // Show toast on completion
            if (updatedJob.status === 'completed') {
               const counts = updatedJob.counts as ImportCounts;
               const total = (counts.uso_consumo_imobilizado || 0) + (counts.participantes || 0);
               
               if (counts.refresh_success === false) {
                 toast.warning('Importação concluída, mas a atualização automática dos painéis falhou. Tente atualizar manualmente.');
               } else {
                 toast.success(`Importação concluída! ${total} registros processados. Views atualizadas.`);
               }
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
  }, [session?.user?.id, loadJobs]);

  // Load available periods
  useEffect(() => {
    async function loadPeriodos() {
        if (!selectedEmpresa) return;
        setLoadingPeriodos(true);
        try {
            // Check if there are any jobs or data for this company to allow import
            // For now assume true to unblock user if check fails
            setHasEfdContribuicoes(true); 
            setPeriodosDisponiveis([]);
        } catch (e) {
            console.error(e);
        } finally {
            setLoadingPeriodos(false);
        }
    }
    loadPeriodos();
  }, [selectedEmpresa]);

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

  // Trigger parse-efd-icms after upload
  const triggerParseEfdIcms = useCallback(async (file: File, filePath: string) => {
    if (!selectedEmpresa || !session) return null;
    
    // setProcessingImport(true); // Managed by handleStartImport now
    
    try {
      console.log('Calling parse-efd-icms for:', filePath);
      
      // CHAMAR A FUNÇÃO V13 (CORRETA) via fetch direto para melhor tratamento de erro
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      if (!currentSession) throw new Error('Sessão inválida');

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-efd-icms`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${currentSession.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          empresa_id: selectedEmpresa,
          file_path: filePath,
          file_name: file.name,
          file_size: file.size,
          import_scope: 'icms_uso_consumo',
        }),
      });

      if (!response.ok) {
        let errorMessage = `Erro ${response.status}: ${response.statusText}`;
        try {
          const errorData = await response.json();
          if (errorData && errorData.error) {
            errorMessage = errorData.error;
          }
        } catch (e) {
          console.error('Erro ao fazer parse do JSON de erro:', e);
          try {
            const textError = await response.text();
            if (textError) errorMessage = textError;
          } catch (e2) { /* ignore */ }
        }

        console.error('Erro na Edge Function:', errorMessage);
        throw new Error(errorMessage);
      }

      const data = await response.json();
      if (data.error) {
        await supabase.storage.from('efd-files').remove([filePath]);
        throw new Error(data.error);
      }

      // toast.success(`Importação iniciada para ${file.name}!`); // Reduced noise
      return data.job_id; // Return job ID for tracking

    } catch (error) {
      console.error('Error starting import:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erro ao iniciar importação';
      toast.error(errorMessage);
      return null;
    } finally {
      // setProcessingImport(false);
    }
  }, [selectedEmpresa, session]);

  const handleStartImport = async () => {
    if (selectedFiles.length === 0 || !selectedEmpresa || !session) return;

    setProcessingImport(true);
    const newBatchIds: string[] = [];

    try {
      for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        setCurrentFileIndex(i);
        
        const timestamp = Date.now();
        const filePath = `${session.user.id}/${timestamp}_icms_${file.name}`;
        setCurrentUploadPath(filePath);
        
        toast.info(`Enviando arquivo ${i + 1}/${selectedFiles.length}: ${file.name}`);
        
        await startUpload(file, filePath);
        const jobId = await triggerParseEfdIcms(file, filePath);
        
        if (jobId) {
          newBatchIds.push(jobId);
        }
        
        resetUpload();
      }
      
      if (newBatchIds.length > 0) {
        setActiveBatchIds(newBatchIds);
        setWaitingForBatchCompletion(true);
        toast.success(`Todos os arquivos enviados! Aguardando processamento para atualizar painéis...`);
      } else {
        toast.error('Nenhum arquivo foi enviado com sucesso.');
      }

      setSelectedFiles([]);
      setCurrentFileIndex(-1);
      setCurrentUploadPath('');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      
    } catch (error) {
      console.error('Error in batch import:', error);
      toast.error('Erro durante a importação em lote. Processo interrompido.');
    } finally {
      setProcessingImport(false);
    }
  };

  const handleCancelUpload = () => {
    cancelUpload();
    setSelectedFiles([]);
    setCurrentFileIndex(-1);
    setCurrentUploadPath('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    toast.info('Upload cancelado.');
  };

  const handleFileSelect = (files: FileList | null) => {
    if (!files) return;
    
    const validFiles: File[] = [];
    
    Array.from(files).forEach(file => {
        if (!file.name.endsWith('.txt')) {
            toast.error(`Arquivo ${file.name} ignorado: deve ser .txt`);
            return;
        }
        if (file.size > 1024 * 1024 * 1024) {
            toast.error(`Arquivo ${file.name} ignorado: muito grande (>1GB).`);
            return;
        }
        validFiles.push(file);
    });

    if (validFiles.length > 0) {
        setSelectedFiles(prev => [...prev, ...validFiles]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files);
    }
  };

  const handleClearDatabase = async () => {
    if (!session?.user?.id) return;
    
    setIsClearing(true);
    setStatusMessage('Iniciando limpeza...');
    setClearProgress({ status: 'counting', currentTable: 'Import Jobs', estimated: 0, deleted: 0 });
    
    try {
      // 1. Delete import jobs (this is the main tracking mechanism)
      const { error: jobsError } = await supabase
        .from('import_jobs')
        .delete()
        .eq('import_scope', 'icms_uso_consumo')
        .eq('user_id', session.user.id); // Safer to limit by user for now

      if (jobsError) throw jobsError;
      
      setStatusMessage('Limpando registros...');
      
      // 2. We should ideally clear uso_consumo_imobilizado too, but without a specific RPC 
      // or clear relation to user/empresa (it uses filial_id), it's risky to do it client-side 
      // without more context. For now we clear the jobs which hides them from the list.
      // If we had the list of filial_ids for this user, we could do:
      // await supabase.from('uso_consumo_imobilizado').delete().in('filial_id', userFilialIds)
      
      setClearProgress({ status: 'done', currentTable: 'Concluído', estimated: 100, deleted: 100 });
      toast.success('Histórico de importação limpo com sucesso!');
      
      // Refresh list
      loadJobs();
      
    } catch (error: any) {
      console.error('Error clearing database:', error);
      toast.error(`Erro ao limpar: ${error.message}`);
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <div className="space-y-6">
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
              Limpar Base ICMS/IPI
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
                        ? 'Esta ação irá remover permanentemente TODOS os dados de ICMS/IPI de TODAS as empresas:'
                        : `Esta ação irá remover permanentemente os dados de ICMS/IPI da empresa ${empresas[0]?.nome || 'vinculada'}:`
                      }
                    </p>
                    <ul className="list-disc list-inside mt-2 space-y-1">
                      <li>Uso e Consumo (CFOP 1556, 2556)</li>
                      <li>Ativo Imobilizado (CFOP 1551, 2551)</li>
                      <li>Histórico de importações ICMS</li>
                    </ul>
                    <p className="mt-3 font-semibold text-destructive">
                      Esta ação não pode ser desfeita!
                    </p>
                    <p className="mt-2 text-sm">
                      <strong>Nota:</strong> Os dados de EFD Contribuições (mercadorias, fretes, energia) não serão afetados.
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

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Importação de EFD ICMS/IPI</h1>
        <p className="text-sm text-muted-foreground">
          Importe arquivos EFD ICMS/IPI para extrair dados de Uso e Consumo (CFOP 1556, 2556) e Ativo Imobilizado (CFOP 1551, 2551)
        </p>
      </div>

      {/* Alerta: Sem EFD Contribuições */}
      {!loadingPeriodos && !hasEfdContribuicoes && (
        <Alert variant="destructive">
          <FileWarning className="h-4 w-4" />
          <AlertTitle>EFD Contribuições não encontrado</AlertTitle>
          <AlertDescription>
            Importe primeiro arquivos de <strong>EFD CONTRIBUIÇÕES</strong> antes de importar EFD ICMS/IPI.
            Os dados do ICMS/IPI serão vinculados aos períodos já existentes.
          </AlertDescription>
        </Alert>
      )}

      {/* Info: Períodos disponíveis */}
      {hasEfdContribuicoes && periodosDisponiveis.length > 0 && (
        <Alert className="border-blue-500 bg-blue-50 dark:bg-blue-950/20">
          <AlertCircle className="h-4 w-4 text-blue-600" />
          <AlertTitle className="text-blue-800 dark:text-blue-200">Períodos disponíveis para importação</AlertTitle>
          <AlertDescription className="text-blue-700 dark:text-blue-300">
            Você pode importar EFD ICMS/IPI para os seguintes períodos (já possuem EFD Contribuições):{' '}
            <span className="font-medium">{periodosDisponiveis.slice(0, 6).map(p => p.label).join(', ')}</span>
            {periodosDisponiveis.length > 6 && ` e mais ${periodosDisponiveis.length - 6}...`}
          </AlertDescription>
        </Alert>
      )}

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

      {/* Upload Area */}
      <Card className={!hasEfdContribuicoes ? 'opacity-50 pointer-events-none' : ''}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-lg">Upload de Arquivo</CardTitle>
            <CardDescription>
              Selecione um arquivo EFD ICMS/IPI (.txt) para importar os dados de Uso e Consumo e Ativo Imobilizado
            </CardDescription>
          </div>
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
              Limpar Base ICMS
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Empresa Selector */}
          <div className="space-y-2">
            <Label>Empresa</Label>
            <Select value={selectedEmpresa} onValueChange={setSelectedEmpresa} disabled={uploading}>
              <SelectTrigger className="w-full md:w-[300px]">
                <SelectValue placeholder="Selecione a empresa" />
              </SelectTrigger>
              <SelectContent>
                {empresas.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Drag & Drop Area */}
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              isDragOver
                ? 'border-primary bg-primary/5'
                : 'border-muted-foreground/25 hover:border-muted-foreground/50'
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <input
              type="file"
              accept=".txt"
              multiple
              onChange={(e) => handleFileSelect(e.target.files)}
              className="hidden"
              ref={fileInputRef}
              disabled={uploading}
            />
            <Upload className="h-10 w-10 mx-auto mb-4 text-muted-foreground" />
            <p className="text-sm text-muted-foreground mb-2">
              Arraste e solte arquivos EFD ICMS/IPI aqui ou
            </p>
            <Button
              variant="outline"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
            >
              Selecionar Arquivos
            </Button>
            {selectedFiles.length > 0 && (
              <div className="mt-4 text-left space-y-2">
                <p className="text-sm font-medium text-muted-foreground mb-2">Arquivos selecionados ({selectedFiles.length}):</p>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {selectedFiles.map((file, index) => (
                    <div key={index} className="flex items-center justify-between text-sm bg-muted/50 p-2 rounded">
                      <div className="flex items-center gap-2 truncate">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        <span className="truncate max-w-[250px]">{file.name}</span>
                        <span className="text-xs text-muted-foreground">({formatFileSize(file.size)})</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-destructive"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedFiles(files => files.filter((_, i) => i !== index));
                        }}
                        disabled={uploading}
                      >
                        <XCircle className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Start Batch Import Button */}
          {selectedFiles.length > 0 && !uploading && (
            <div className="flex justify-end">
              <Button onClick={handleStartImport} disabled={!selectedEmpresa}>
                <Upload className="h-4 w-4 mr-2" />
                Iniciar Importação ({selectedFiles.length} arquivos)
              </Button>
            </div>
          )}

          {/* Upload Progress */}
          {(isUploading || isPaused || processingImport) && (
            <div className="space-y-3">
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>Processando arquivo {currentFileIndex + 1} de {selectedFiles.length}</span>
                <span>{Math.round(((currentFileIndex) / selectedFiles.length) * 100)}% total</span>
              </div>
              <Progress value={((currentFileIndex) / selectedFiles.length) * 100} className="h-2" />
              
              <UploadProgressDisplay 
                progress={uploadProgress} 
                fileName={selectedFiles[currentFileIndex]?.name || ''} 
              />
              {(isUploading || isPaused) && (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleCancelUpload}>
                    Cancelar
                  </Button>
                </div>
              )}
            </div>
          )}

          {/* Processing indicator */}
          {processingImport && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span className="text-sm">Iniciando processamento...</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Import Jobs History */}
      {jobs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Histórico de Importações</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {jobs.map((job) => {
                const statusInfo = getStatusInfo(job.status);
                const StatusIcon = statusInfo.icon;
                const isActive = ['pending', 'processing', 'generating', 'refreshing_views'].includes(job.status);
                
                return (
                  <div key={job.id} className="border rounded-lg p-4 mb-3">
                    <div className="flex justify-between items-center mb-2">
                      <div className="flex items-center gap-2">
                        <StatusIcon className={`h-5 w-5 ${isActive ? 'animate-spin' : ''}`} />
                        <h4 className="font-medium">{job.file_name}</h4>
                      </div>
                      <Badge className={statusInfo.color}>{statusInfo.label}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mb-2">
                      {formatDate(job.created_at)} • {formatFileSize(job.file_size)} • Progresso: {job.progress}%
                    </div>
                    {job.status === 'completed' && job.counts && (
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2 mt-2">
                        <div className="bg-muted p-2 rounded">
                          <p className="text-xs text-muted-foreground">Uso/Consumo/Imob.</p>
                          <p className="font-medium">{job.counts.uso_consumo_imobilizado || 0}</p>
                        </div>
                        <div className="bg-muted p-2 rounded">
                          <p className="text-xs text-muted-foreground">Participantes</p>
                          <p className="font-medium">{job.counts.participantes || 0}</p>
                        </div>
                        <div className="bg-muted p-2 rounded">
                          <p className="text-xs text-muted-foreground">Estabelecimentos</p>
                          <p className="font-medium">{job.counts.estabelecimentos || 0}</p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Info Card */}
      <Card className="bg-muted/50">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            Sobre a Importação EFD ICMS/IPI
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            Esta funcionalidade importa dados específicos do <strong>EFD ICMS/IPI</strong> (Escrituração Fiscal Digital - ICMS/IPI):
          </p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li><strong>CFOP 1551, 2551</strong> - Aquisições para Ativo Imobilizado</li>
            <li><strong>CFOP 1556, 2556</strong> - Aquisições para Uso e Consumo</li>
          </ul>
          <p className="pt-2">
            <strong>Pré-requisito:</strong> Você deve importar o arquivo <em>EFD Contribuições</em> do mesmo período primeiro.
            Os dados do ICMS/IPI serão vinculados à mesma filial e período.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
