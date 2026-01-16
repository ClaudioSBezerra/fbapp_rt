import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Loader2, CheckCircle, FileText, AlertCircle, Upload, Clock, XCircle, RefreshCw, AlertTriangle, FileWarning, Trash2, Shield } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useRole } from '@/hooks/useRole';
import { useSessionInfo } from '@/hooks/useSessionInfo';
import { useResumableUpload } from '@/hooks/useResumableUpload';
import { UploadProgressDisplay } from '@/components/UploadProgress';
import { toast } from 'sonner';

interface ImportCounts {
  uso_consumo_imobilizado: number;
  participantes?: number;
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

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function getTimeSinceUpdate(dateStr: string): { text: string; isStale: boolean } {
  const now = new Date();
  const updated = new Date(dateStr);
  const diffMs = now.getTime() - updated.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  
  if (diffMinutes > 2) {
    return { text: `${diffMinutes} min atrás`, isStale: true };
  } else if (diffSeconds > 30) {
    return { text: `${diffSeconds}s atrás`, isStale: false };
  }
  return { text: 'agora', isStale: false };
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
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [periodosDisponiveis, setPeriodosDisponiveis] = useState<PeriodoDisponivel[]>([]);
  const [loadingPeriodos, setLoadingPeriodos] = useState(true);
  const [hasEfdContribuicoes, setHasEfdContribuicoes] = useState(false);
  const [currentUploadPath, setCurrentUploadPath] = useState<string>('');
  
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
    pauseUpload,
    resumeUpload,
    cancelUpload,
    resetUpload,
    isUploading,
    isPaused,
    isCompleted: uploadCompleted,
    hasError: uploadHasError,
  } = useResumableUpload({
    bucketName: 'efd-files',
    onComplete: async (filePath) => {
      console.log('Upload completed, starting parse-efd-icms:', filePath);
      await triggerParseEfdIcms(filePath);
    },
    onError: (error) => {
      console.error('Upload failed:', error);
      toast.error(`Erro no upload: ${error.message}`);
    },
  });

  const uploading = isUploading || isPaused || processingImport;

  // Check views status when jobs change
  useEffect(() => {
    const checkViews = async () => {
      if (!session) return;
      try {
        const { data, error } = await supabase.rpc('get_mv_uso_consumo_aggregated');
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

  // Animated progress effect for database clearing
  useEffect(() => {
    if (!clearProgress || clearProgress.status === 'done') return;
    
    const messages = [
      'Contando registros...',
      'Deletando Uso e Consumo...',
      'Deletando Ativo Imobilizado...',
      'Atualizando views...',
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
      const { data, error } = await supabase.functions.invoke('clear-icms-data');
      
      if (error) {
        console.error('Erro ao chamar função:', error);
        throw error;
      }

      if (data?.error) {
        console.error('Erro da função:', data.error);
        throw new Error(data.error);
      }

      const totalDeleted = (data?.deleted?.uso_consumo || 0);
      
      setProgressAnimation(100);
      setClearProgress({
        status: 'done',
        currentTable: 'Concluído!',
        estimated: totalDeleted,
        deleted: totalDeleted
      });

      setTimeout(() => {
        setJobs([]);
        toast.success(data?.message || 'Base de dados ICMS limpa com sucesso!');
        setShowClearConfirm(false);
        setClearProgress(null);
        setViewsStatus('empty');
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

  // Verificar se existem dados de EFD Contribuições
  useEffect(() => {
    const checkEfdContribuicoes = async () => {
      if (!session) return;
      setLoadingPeriodos(true);
      
      try {
        const { data, error } = await supabase
          .from('mercadorias')
          .select('mes_ano')
          .limit(1000);

        if (error) {
          console.error('Error checking EFD Contribuições:', error);
          setHasEfdContribuicoes(false);
          setPeriodosDisponiveis([]);
          return;
        }

        if (!data || data.length === 0) {
          setHasEfdContribuicoes(false);
          setPeriodosDisponiveis([]);
          return;
        }

        const periodosSet = new Set<string>();
        data.forEach((m) => {
          if (m.mes_ano) {
            const mesAnoStr = typeof m.mes_ano === 'string' 
              ? m.mes_ano 
              : new Date(m.mes_ano).toISOString().slice(0, 10);
            periodosSet.add(mesAnoStr.substring(0, 7));
          }
        });

        const periodos = Array.from(periodosSet)
          .sort()
          .reverse()
          .map(p => ({
            mes_ano: p,
            label: p.split('-').reverse().join('/')
          }));

        setHasEfdContribuicoes(periodos.length > 0);
        setPeriodosDisponiveis(periodos);
      } catch (err) {
        console.error('Error checking EFD Contribuições:', err);
        setHasEfdContribuicoes(false);
        setPeriodosDisponiveis([]);
      } finally {
        setLoadingPeriodos(false);
      }
    };

    checkEfdContribuicoes();
  }, [session]);

  // Load empresas
  useEffect(() => {
    if (sessionLoading) return;
    
    if (userEmpresas.length > 0) {
      setEmpresas(userEmpresas.map(e => ({ id: e.id, nome: e.nome })));
      setSelectedEmpresa(userEmpresas[0].id);
    } else {
      setEmpresas([]);
      setSelectedEmpresa('');
    }
  }, [userEmpresas, sessionLoading]);

  // Load existing jobs
  const loadJobs = useCallback(async () => {
    if (!session?.user?.id) return;
    
    const { data } = await supabase
      .from('import_jobs')
      .select('*')
      .eq('user_id', session.user.id)
      .eq('import_scope', 'icms_uso_consumo')
      .order('created_at', { ascending: false })
      .limit(10);
    
    if (data) {
      setJobs(data.map(job => ({
        ...job,
        counts: (job.counts as unknown) as ImportCounts,
        status: job.status as ImportJob['status'],
      })));
    }
  }, [session?.user?.id]);

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
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const job = payload.new as any;
            if (job.import_scope === 'icms_uso_consumo') {
              loadJobs();
              
              if (job.status === 'completed') {
                const counts = job.counts as ImportCounts;
                if (counts.refresh_success === false) {
                  toast.warning(
                    `Importação concluída! ${counts.uso_consumo_imobilizado || 0} registros importados. Os painéis podem demorar para atualizar.`,
                    { duration: 8000 }
                  );
                  setViewsStatus('empty');
                } else {
                  toast.success(`Importação concluída! ${counts.uso_consumo_imobilizado || 0} registros importados. Redirecionando...`);
                  setViewsStatus('ok');
                }
                setTimeout(() => navigate('/uso-consumo'), 3000);
              } else if (job.status === 'failed') {
                toast.error(`Importação falhou: ${job.error_message || 'Erro desconhecido'}`);
              }
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session?.user?.id, loadJobs, navigate]);

  // Polling fallback for active jobs
  useEffect(() => {
    const hasActiveJobs = jobs.some(j => 
      j.status === 'pending' || j.status === 'processing' || j.status === 'refreshing_views' || j.status === 'generating'
    );
    
    if (!hasActiveJobs || !session?.user?.id) return;
    
    const pollInterval = setInterval(() => {
      loadJobs();
    }, 15000);
    
    return () => {
      clearInterval(pollInterval);
    };
  }, [jobs, session?.user?.id, loadJobs]);

  // Re-sync on tab visibility change
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && session?.user?.id) {
        loadJobs();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [session?.user?.id, loadJobs]);

  // Trigger parse-efd-icms after upload
  const triggerParseEfdIcms = useCallback(async (filePath: string) => {
    if (!selectedFile || !selectedEmpresa || !session) return;
    
    setProcessingImport(true);
    
    try {
      console.log('Calling parse-efd-icms for:', filePath);
      
      const response = await supabase.functions.invoke('parse-efd-icms', {
        body: {
          empresa_id: selectedEmpresa,
          file_path: filePath,
          file_name: selectedFile.name,
          file_size: selectedFile.size,
          import_scope: 'icms_uso_consumo',
        },
      });

      if (response.error) {
        await supabase.storage.from('efd-files').remove([filePath]);
        throw new Error(response.error.message || 'Erro ao iniciar importação');
      }

      const data = response.data;
      if (data.error) {
        await supabase.storage.from('efd-files').remove([filePath]);
        throw new Error(data.error);
      }

      setSelectedFile(null);
      setCurrentUploadPath('');
      resetUpload();
      toast.success('Importação iniciada! Acompanhe o progresso abaixo.');
    } catch (error) {
      console.error('Error starting import:', error);
      const errorMessage = error instanceof Error ? error.message : 'Erro ao iniciar importação';
      toast.error(errorMessage);
    } finally {
      setProcessingImport(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }, [selectedFile, selectedEmpresa, session, resetUpload]);

  const handleStartImport = async () => {
    if (!selectedFile || !selectedEmpresa || !session) return;

    try {
      const timestamp = Date.now();
      const filePath = `${session.user.id}/${timestamp}_icms_${selectedFile.name}`;
      setCurrentUploadPath(filePath);
      
      await startUpload(selectedFile, filePath);
    } catch (error) {
      console.error('Error starting upload:', error);
      toast.error('Erro ao iniciar upload');
    }
  };

  const handleCancelUpload = () => {
    cancelUpload();
    setSelectedFile(null);
    setCurrentUploadPath('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    toast.info('Upload cancelado.');
  };

  const handleRetryUpload = async () => {
    if (!selectedFile || !session) return;
    
    resetUpload();
    const timestamp = Date.now();
    const filePath = `${session.user.id}/${timestamp}_icms_${selectedFile.name}`;
    setCurrentUploadPath(filePath);
    
    try {
      await startUpload(selectedFile, filePath);
    } catch (error) {
      console.error('Error retrying upload:', error);
    }
  };

  const handleFileSelect = (file: File) => {
    if (!file.name.endsWith('.txt')) {
      toast.error('Por favor, selecione um arquivo .txt');
      return;
    }
    if (file.size > 1024 * 1024 * 1024) {
      toast.error('Arquivo muito grande (>1GB). Limite máximo é 1GB.');
      return;
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

  const activeJobs = jobs.filter(j => j.status === 'pending' || j.status === 'processing' || j.status === 'refreshing_views' || j.status === 'generating');
  const completedJobs = jobs.filter(j => j.status === 'completed' || j.status === 'failed' || j.status === 'cancelled');

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

      {/* Upload Card */}
      <Card className={!hasEfdContribuicoes ? 'opacity-50 pointer-events-none' : ''}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Importar EFD ICMS/IPI
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
            Importe arquivos EFD ICMS/IPI para extrair dados de Uso e Consumo (CFOP 1556, 2556) e Ativo Imobilizado (CFOP 1551, 2551).
            Arquivos grandes são processados em background.
          </p>

          <Alert className="border-positive/50 bg-positive/5">
            <Shield className="h-4 w-4 text-positive" />
            <AlertTitle className="text-positive">Segurança da Informação</AlertTitle>
            <AlertDescription className="text-muted-foreground">
              Por questões de segurança, o arquivo TXT é automaticamente excluído 
              do servidor após a importação ser concluída com sucesso.
            </AlertDescription>
          </Alert>

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

          <div
            className={`
              relative border-2 border-dashed rounded-lg p-8 transition-colors cursor-pointer
              ${isDragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/50'}
              ${uploading ? 'pointer-events-none opacity-60' : ''}
              ${!selectedEmpresa || !hasEfdContribuicoes ? 'pointer-events-none opacity-40' : ''}
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
              disabled={uploading || !selectedEmpresa || !hasEfdContribuicoes}
            />
            
            <div className="flex flex-col items-center gap-3">
              {/* Show upload progress when uploading */}
              {(isUploading || isPaused || uploadHasError) && selectedFile ? (
                <div className="w-full">
                  <UploadProgressDisplay
                    progress={uploadProgress}
                    fileName={selectedFile.name}
                    onPause={pauseUpload}
                    onResume={resumeUpload}
                    onCancel={handleCancelUpload}
                    onRetry={handleRetryUpload}
                  />
                </div>
              ) : processingImport ? (
                <>
                  <Loader2 className="h-10 w-10 text-primary animate-spin" />
                  <div className="space-y-1 text-center">
                    <p className="text-sm font-medium text-foreground">Iniciando processamento...</p>
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
                      Aceita arquivos .txt (EFD ICMS/IPI) - até 1GB
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
              disabled={!selectedEmpresa || !hasEfdContribuicoes}
            >
              Iniciar Importação
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Active Jobs */}
      {activeJobs.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Loader2 className="h-5 w-5 animate-spin" />
              Importações em Andamento
            </CardTitle>
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => loadJobs()}
              className="text-muted-foreground hover:text-foreground"
            >
              <RefreshCw className="h-4 w-4 mr-1" />
              Atualizar Status
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {activeJobs.map((job) => {
              const statusInfo = getStatusInfo(job.status);
              const StatusIcon = statusInfo.icon;
              const updateInfo = job.updated_at ? getTimeSinceUpdate(job.updated_at) : null;
              const bytesProgress = job.bytes_processed && job.file_size 
                ? `${formatFileSize(job.bytes_processed)} / ${formatFileSize(job.file_size)}`
                : null;
              
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
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>
                        {bytesProgress && <span className="mr-2">{bytesProgress}</span>}
                        {job.chunk_number !== null && job.chunk_number > 0 && (
                          <span className="text-muted-foreground/70">Bloco {job.chunk_number}</span>
                        )}
                      </span>
                      {job.total_lines > 0 && (
                        <span>{job.total_lines.toLocaleString('pt-BR')} linhas</span>
                      )}
                    </div>
                  </div>

                  {/* Last Updated indicator */}
                  {updateInfo && (
                    <div className={`flex items-center gap-2 text-xs ${updateInfo.isStale ? 'text-warning' : 'text-muted-foreground'}`}>
                      <Clock className="h-3 w-3" />
                      <span>Última atualização: {formatTime(job.updated_at)} ({updateInfo.text})</span>
                      {updateInfo.isStale && (
                        <Button 
                          variant="link" 
                          size="sm" 
                          className="h-auto p-0 text-xs text-warning hover:text-warning/80"
                          onClick={() => loadJobs()}
                        >
                          Reconectar
                        </Button>
                      )}
                    </div>
                  )}

                  {(job.status === 'processing' || job.status === 'refreshing_views') && (
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>Uso/Consumo/Imobilizado: {job.counts.uso_consumo_imobilizado || 0}</span>
                      <span>Participantes: {job.counts.participantes || 0}</span>
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
                const totalRecords = job.counts.uso_consumo_imobilizado || 0;
                
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
                        <div className="grid grid-cols-2 gap-2 text-center">
                          <div>
                            <p className="text-lg font-semibold text-foreground">{job.counts.uso_consumo_imobilizado || 0}</p>
                            <p className="text-xs text-muted-foreground">Uso/Consumo/Imobilizado</p>
                          </div>
                          <div>
                            <p className="text-lg font-semibold text-foreground">{job.counts.participantes || 0}</p>
                            <p className="text-xs text-muted-foreground">Participantes</p>
                          </div>
                        </div>
                        <div className="text-center mt-2 pt-2 border-t border-border">
                          <p className="text-sm font-medium text-foreground">{totalRecords} registros importados</p>
                        </div>
                        {/* Security indicator */}
                        <div className="flex items-center justify-center gap-2 text-xs text-positive mt-2 pt-2 border-t border-border">
                          <Shield className="h-3 w-3" />
                          <span>Arquivo original excluído por segurança</span>
                        </div>
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
              Nenhuma importação encontrada. Faça upload de um arquivo EFD ICMS/IPI para começar.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
