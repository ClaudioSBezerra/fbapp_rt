import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Loader2, CheckCircle, FileText, ArrowRight, AlertCircle, Upload, Clock, XCircle, RefreshCw, Zap, Trash2, AlertTriangle, Shield, Files, Pause } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useRole } from '@/hooks/useRole';
import { useSessionInfo } from '@/hooks/useSessionInfo';
import { useUploadQueue, QueuedFile } from '@/hooks/useUploadQueue';
import { MultiUploadProgress } from '@/components/MultiUploadProgress';
import { toast } from 'sonner';
import { formatCNPJMasked } from '@/lib/formatFilial';
import { useDemoStatus, DemoTrialBanner, DemoLimitsBanner } from '@/hooks/useDemoStatus';

interface ImportCounts {
  mercadorias: number;
  energia_agua: number;
  fretes: number;
  servicos: number;
  participantes?: number;
  estabelecimentos?: number;
  refresh_success?: boolean;
  // Campos da arquitetura 3 camadas (raw tables)
  raw_c100?: number;
  raw_c500?: number;
  raw_fretes?: number;
  raw_a100?: number;
  // Resultados da consolidação
  consolidation?: {
    mercadorias?: { inserted: number; raw_count: number };
    energia_agua?: { inserted: number; raw_count: number };
    fretes?: { inserted: number; raw_count: number };
    servicos?: { inserted: number; raw_count: number };
    success?: boolean;
  };
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

// Helper para obter contadores exibíveis (compatível com arquitetura 3 camadas)
function getDisplayCounts(counts: ImportCounts) {
  // Durante processamento usa raw counts; após consolidação usa consolidation ou fallback
  const mercadorias = counts.consolidation?.mercadorias?.inserted ?? counts.mercadorias ?? counts.raw_c100 ?? 0;
  const energiaAgua = counts.consolidation?.energia_agua?.inserted ?? counts.energia_agua ?? counts.raw_c500 ?? 0;
  const fretes = counts.consolidation?.fretes?.inserted ?? counts.fretes ?? counts.raw_fretes ?? 0;
  const servicos = counts.consolidation?.servicos?.inserted ?? counts.servicos ?? counts.raw_a100 ?? 0;
  
  // Para exibição durante processamento, mostra raw counts
  const rawMercadorias = counts.raw_c100 ?? 0;
  const rawEnergiaAgua = counts.raw_c500 ?? 0;
  const rawFretes = counts.raw_fretes ?? 0;
  const rawServicos = counts.raw_a100 ?? 0;
  
  return {
    mercadorias,
    energiaAgua,
    fretes,
    servicos,
    participantes: counts.participantes ?? 0,
    estabelecimentos: counts.estabelecimentos ?? 0,
    rawMercadorias,
    rawEnergiaAgua,
    rawFretes,
    rawServicos,
    isConsolidated: !!counts.consolidation?.success,
  };
}


interface ViewRefreshStatus {
  views_total: number;
  views_completed: number;
  current_view: string | null;
  started_at: string;
  failed_views?: string[];
}

interface ImportJob {
  id: string;
  user_id: string;
  empresa_id: string;
  filial_id: string | null;
  file_path: string;
  file_name: string;
  file_size: number;
  status: 'pending' | 'processing' | 'paused' | 'generating' | 'refreshing_views' | 'completed' | 'failed' | 'cancelled';
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
  view_refresh_status?: ViewRefreshStatus | null;
}

interface Empresa {
  id: string;
  nome: string;
  grupo_id: string;
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
    case 'paused':
      return { label: 'Pausado', color: 'bg-warning/10 text-warning', icon: Pause };
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

export default function ImportarEFD() {
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [selectedEmpresa, setSelectedEmpresa] = useState<string>('');
  const [isDragOver, setIsDragOver] = useState(false);
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [recordLimit, setRecordLimit] = useState<number>(0);
  const [importScope, setImportScope] = useState<'all' | 'only_a' | 'only_c' | 'only_d'>('all');
  const [isClearing, setIsClearing] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearProgress, setClearProgress] = useState<{
    status: 'counting' | 'deleting' | 'refreshing_views' | 'done';
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
  const { isDemo, daysRemaining, trialExpired, importCounts, limits, isLoading: demoLoading } = useDemoStatus();

  // Trigger parse-efd after upload completes
  const triggerParseEfd = useCallback(async (queuedFile: QueuedFile, filePath: string) => {
    if (!selectedEmpresa || !session) {
      throw new Error('Empresa não selecionada');
    }
    
    console.log('Calling parse-efd for:', filePath);
    
    // Use fetch directly to properly handle 409 status code
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-efd`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          empresa_id: selectedEmpresa,
          file_path: filePath,
          file_name: queuedFile.file.name,
          file_size: queuedFile.file.size,
          record_limit: recordLimit,
          import_scope: importScope,
        }),
      }
    );

    const data = await response.json();

    // Check for duplicate (409 Conflict)
    if (response.status === 409 && data.duplicate) {
      const duplicateError: any = new Error(data.error || 'Período já importado');
      duplicateError.duplicate = true;
      duplicateError.context = { json: data };
      throw duplicateError;
    }

    if (!response.ok || data.error) {
      await supabase.storage.from('efd-files').remove([filePath]);
      throw new Error(data.error || 'Erro ao iniciar importação');
    }

    console.log('Import job created:', data.job_id);
  }, [selectedEmpresa, session, recordLimit, importScope]);

  // Upload queue hook
  const {
    queue,
    addFiles,
    removeFile,
    clearQueue,
    startQueue,
    pauseQueue,
    cancelAll,
    retryFailed,
    isProcessing,
    isPaused,
    overallProgress,
    hasFiles,
    hasPendingFiles,
  } = useUploadQueue({
    bucketName: 'efd-files',
    onFileComplete: triggerParseEfd,
    onAllComplete: () => {
      toast.success('Todos os arquivos foram enviados para processamento!');
      clearQueue();
    },
    onError: (file, error) => {
      console.error(`Error uploading ${file.file.name}:`, error);
      toast.error(`Erro no upload de ${file.file.name}: ${error.message}`);
    },
    onDuplicate: (file, duplicateInfo) => {
      toast.warning(`${file.file.name}: Período ${duplicateInfo.period} já foi importado para esta filial.`, {
        duration: 6000,
      });
    },
  });

  // Track if upload is in progress
  const uploading = isProcessing;

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
    
    if (userEmpresas.length > 0) {
      setEmpresas(userEmpresas.map(e => ({ ...e, grupo_id: '' })));
      setSelectedEmpresa(userEmpresas[0].id);
    } else {
      setEmpresas([]);
      setSelectedEmpresa('');
    }
  }, [userEmpresas, sessionLoading]);

  // Load existing jobs function
  const loadJobs = useCallback(async () => {
    if (!session?.user?.id) return;
    
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
  }, [session?.user?.id]);

  // Load existing jobs and subscribe to realtime updates
  useEffect(() => {
    if (!session?.user?.id) return;

    loadJobs();

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
                toast.success(`Importação concluída! ${total} registros importados.`);
                setViewsStatus('ok');
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

  // Polling fallback
  useEffect(() => {
    const hasActiveJobs = jobs.some(j => 
      j.status === 'pending' || j.status === 'processing' || j.status === 'paused' || j.status === 'refreshing_views' || j.status === 'generating'
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

  const handleFilesSelect = (files: File[]) => {
    const validFiles = files.filter(file => {
      if (!file.name.toLowerCase().endsWith('.txt')) {
        toast.error(`Arquivo ignorado (não é .txt): ${file.name}`);
        return false;
      }
      if (file.size > 1024 * 1024 * 1024) {
        toast.error(`Arquivo muito grande (>1GB): ${file.name}`);
        return false;
      }
      return true;
    });

    if (validFiles.length > 0) {
      const added = addFiles(validFiles);
      if (added > 0) {
        toast.success(`${added} arquivo${added > 1 ? 's' : ''} adicionado${added > 1 ? 's' : ''} à fila`);
      }
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length > 0) handleFilesSelect(files);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragOver(false);
    const files = Array.from(event.dataTransfer.files);
    handleFilesSelect(files);
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

  const handleResumeJob = async (jobId: string) => {
    try {
      toast.info('Retomando importação...');
      
      const { error } = await supabase.functions.invoke('process-efd-job', {
        body: { job_id: jobId }
      });
      
      if (error) throw error;
      
      // Clear error message in UI
      setJobs(prevJobs => prevJobs.map(j => 
        j.id === jobId ? { ...j, error_message: null } : j
      ));
      
      toast.success('Job retomado com sucesso!');
      loadJobs();
    } catch (err) {
      console.error('Error resuming job:', err);
      const errorMessage = err instanceof Error ? err.message : 'Erro ao retomar importação';
      toast.error(errorMessage);
    }
  };

  const activeJobs = jobs.filter(j => j.status === 'pending' || j.status === 'processing' || j.status === 'paused' || j.status === 'refreshing_views' || j.status === 'generating');
  const completedJobs = jobs.filter(j => j.status === 'completed' || j.status === 'failed' || j.status === 'cancelled');

  // Animated progress effect for database clearing
  useEffect(() => {
    if (!clearProgress || clearProgress.status === 'done' || clearProgress.status === 'refreshing_views') return;
    
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

      const totalDeleted = (data?.deleted?.mercadorias || 0) + 
                          (data?.deleted?.energia_agua || 0) + 
                          (data?.deleted?.fretes || 0);
      
      // Mostrar status de atualização de views
      setProgressAnimation(95);
      setClearProgress({
        status: 'refreshing_views',
        currentTable: 'Atualizando painéis...',
        estimated: totalDeleted,
        deleted: totalDeleted
      });
      setStatusMessage('Atualizando painéis...');

      // Aguardar um momento para mostrar o status antes de concluir
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      setProgressAnimation(100);
      setClearProgress({
        status: 'done',
        currentTable: 'Concluído!',
        estimated: totalDeleted,
        deleted: totalDeleted
      });
      setViewsStatus('empty'); // Views foram limpas

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
      {/* Demo Trial Banners */}
      {isDemo && !demoLoading && (
        <div className="space-y-4">
          <DemoTrialBanner 
            daysRemaining={daysRemaining} 
            trialExpired={trialExpired}
          />
          <DemoLimitsBanner
            importType="contrib"
            currentCount={importCounts.efd_contrib}
            maxCount={limits.efd_contrib}
          />
        </div>
      )}
      
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
            <strong className="text-foreground"> Suporta múltiplos arquivos!</strong> Arquivos grandes são processados em background.
          </p>

          <Alert className="border-positive/50 bg-positive/5">
            <Shield className="h-4 w-4 text-positive" />
            <AlertTitle className="text-positive">Segurança da Informação</AlertTitle>
            <AlertDescription className="text-muted-foreground">
              Por questões de segurança, o arquivo TXT é automaticamente excluído 
              do servidor após a importação ser concluída com sucesso.
            </AlertDescription>
          </Alert>

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

          {/* Drag & Drop Area */}
          <div
            className={`
              relative border-2 border-dashed rounded-lg p-8 transition-colors cursor-pointer
              ${isDragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/50'}
              ${uploading ? 'pointer-events-none opacity-60' : ''}
              ${!selectedEmpresa ? 'pointer-events-none opacity-40' : ''}
            `}
            onClick={() => fileInputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt"
              multiple
              onChange={handleFileChange}
              className="hidden"
              disabled={uploading || !selectedEmpresa}
            />
            
            <div className="flex flex-col items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                <Files className="h-6 w-6 text-muted-foreground" />
              </div>
              <div className="space-y-1 text-center">
                <p className="text-sm font-medium text-foreground">
                  Arraste os arquivos ou clique para selecionar
                </p>
                <p className="text-xs text-muted-foreground">
                  Aceita múltiplos arquivos .txt (EFD Contribuições) - até 1GB cada
                </p>
              </div>
            </div>
          </div>

          {/* Multi Upload Progress */}
          {hasFiles && (
            <MultiUploadProgress
              queue={queue}
              overallProgress={overallProgress}
              isProcessing={isProcessing}
              isPaused={isPaused}
              onRemoveFile={removeFile}
              onStartQueue={startQueue}
              onPauseQueue={pauseQueue}
              onCancelAll={cancelAll}
              onRetryFailed={retryFailed}
              onClearQueue={clearQueue}
            />
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

                  {/* Show error message with resume button for paused/processing jobs */}
                  {job.error_message && (job.status === 'processing' || job.status === 'paused') && (
                    <div className="flex items-center gap-3 p-2 rounded-lg bg-warning/10 border border-warning/30">
                      <AlertTriangle className="h-4 w-4 text-warning flex-shrink-0" />
                      <span className="text-xs text-warning flex-1">{job.error_message}</span>
                      <Button 
                        variant="outline" 
                        size="sm"
                        className="border-warning text-warning hover:bg-warning hover:text-warning-foreground h-7 text-xs"
                        onClick={() => handleResumeJob(job.id)}
                      >
                        <RefreshCw className="h-3 w-3 mr-1" />
                        Retomar
                      </Button>
                    </div>
                  )}

                  {/* Show resume button for paused jobs without error message */}
                  {job.status === 'paused' && !job.error_message && (
                    <Button 
                      variant="outline" 
                      size="sm"
                      className="border-warning text-warning hover:bg-warning hover:text-warning-foreground"
                      onClick={() => handleResumeJob(job.id)}
                    >
                      <RefreshCw className="h-3 w-3 mr-1" />
                      Retomar Processamento
                    </Button>
                  )}

                  {/* Show resume button for stale processing jobs */}
                  {updateInfo?.isStale && job.status === 'processing' && !job.error_message && (
                    <Button 
                      variant="outline" 
                      size="sm"
                      className="border-primary text-primary hover:bg-primary hover:text-primary-foreground"
                      onClick={() => handleResumeJob(job.id)}
                    >
                      <RefreshCw className="h-3 w-3 mr-1" />
                      Retomar Processamento
                    </Button>
                  )}

                  {(job.status === 'processing' || job.status === 'refreshing_views' || job.status === 'generating') && (() => {
                    const dc = getDisplayCounts(job.counts);
                    // Durante processamento, mostra raw counts se disponíveis
                    const showRaw = !dc.isConsolidated && (dc.rawMercadorias > 0 || dc.rawFretes > 0 || dc.rawEnergiaAgua > 0 || dc.rawServicos > 0);
                    return (
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                        <span>Operações: {showRaw ? dc.rawMercadorias : dc.mercadorias}</span>
                        <span>Serviços: {showRaw ? dc.rawServicos : dc.servicos}</span>
                        <span>Energia/Água: {showRaw ? dc.rawEnergiaAgua : dc.energiaAgua}</span>
                        <span>Fretes: {showRaw ? dc.rawFretes : dc.fretes}</span>
                        <span>Participantes: {dc.participantes}</span>
                        <span>Estabelecimentos: {dc.estabelecimentos}</span>
                      </div>
                    );
                  })()}

                  {/* View Refresh Progress */}
                  {job.status === 'refreshing_views' && job.view_refresh_status && (() => {
                    const vrs = job.view_refresh_status;
                    const viewProgress = vrs.views_total > 0 
                      ? (vrs.views_completed / vrs.views_total) * 100 
                      : 0;
                    const elapsedSeconds = vrs.started_at 
                      ? Math.floor((Date.now() - new Date(vrs.started_at).getTime()) / 1000)
                      : 0;
                    
                    return (
                      <div className="mt-3 p-3 bg-purple-500/5 rounded-lg border border-purple-500/20">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <RefreshCw className="h-4 w-4 text-purple-500 animate-spin" />
                            <span className="text-sm font-medium text-purple-600">
                              Atualizando Painéis
                            </span>
                          </div>
                          <span className="text-sm font-medium text-purple-600">
                            {vrs.views_completed}/{vrs.views_total}
                          </span>
                        </div>
                        
                        <Progress 
                          value={viewProgress} 
                          className="h-2 mb-2 [&>div]:bg-purple-500" 
                        />
                        
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>
                            {vrs.current_view ? (
                              <span className="font-mono text-purple-600">{vrs.current_view}</span>
                            ) : (
                              <span className="text-positive">Concluído!</span>
                            )}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {elapsedSeconds}s
                          </span>
                        </div>
                        
                        {vrs.failed_views && vrs.failed_views.length > 0 && (
                          <div className="mt-2 text-xs text-warning flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" />
                            {vrs.failed_views.length} view(s) com falha
                          </div>
                        )}
                      </div>
                    );
                  })()}

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

                    {job.status === 'completed' && (() => {
                      const dc = getDisplayCounts(job.counts);
                      const total = dc.mercadorias + dc.energiaAgua + dc.fretes + dc.servicos;
                      return (
                        <div className="bg-muted/50 rounded-lg p-3 mt-3">
                          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center">
                            <div>
                              <p className="text-lg font-semibold text-foreground">{dc.mercadorias}</p>
                              <p className="text-xs text-muted-foreground">Operações</p>
                            </div>
                            <div>
                              <p className="text-lg font-semibold text-foreground">{dc.servicos}</p>
                              <p className="text-xs text-muted-foreground">Serviços</p>
                            </div>
                            <div>
                              <p className="text-lg font-semibold text-foreground">{dc.energiaAgua}</p>
                              <p className="text-xs text-muted-foreground">Energia/Água</p>
                            </div>
                            <div>
                              <p className="text-lg font-semibold text-foreground">{dc.fretes}</p>
                              <p className="text-xs text-muted-foreground">Fretes</p>
                            </div>
                            <div>
                              <p className="text-lg font-semibold text-foreground">{dc.participantes}</p>
                              <p className="text-xs text-muted-foreground">Participantes</p>
                            </div>
                            <div>
                              <p className="text-lg font-semibold text-foreground">{dc.estabelecimentos}</p>
                              <p className="text-xs text-muted-foreground">Estabelecimentos</p>
                            </div>
                          </div>
                          <div className="text-center mt-2 pt-2 border-t border-border">
                            <p className="text-sm font-medium text-foreground">{total} registros importados</p>
                          </div>
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
                          <div className="flex items-center justify-center gap-2 text-xs text-positive mt-2 pt-2 border-t border-border">
                            <Shield className="h-3 w-3" />
                            <span>Arquivo original excluído por segurança</span>
                          </div>
                        </div>
                      );
                    })()}

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
      {jobs.length === 0 && !hasFiles && (
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
