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
import { Loader2, CheckCircle, FileText, AlertCircle, Upload, Clock, XCircle, RefreshCw, AlertTriangle, FileWarning, Trash2, Shield, Files } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useRole } from '@/hooks/useRole';
import { useSessionInfo } from '@/hooks/useSessionInfo';
import { useUploadQueue, QueuedFile } from '@/hooks/useUploadQueue';
import { MultiUploadProgress } from '@/components/MultiUploadProgress';
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
  const [isDragOver, setIsDragOver] = useState(false);
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [periodosDisponiveis, setPeriodosDisponiveis] = useState<PeriodoDisponivel[]>([]);
  const [loadingPeriodos, setLoadingPeriodos] = useState(true);
  const [hasEfdContribuicoes, setHasEfdContribuicoes] = useState(false);
  
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

  // Trigger parse-efd-icms after upload
  const triggerParseEfdIcms = useCallback(async (queuedFile: QueuedFile, filePath: string) => {
    if (!selectedEmpresa || !session) {
      throw new Error('Empresa não selecionada');
    }
    
    // Use fetch directly to properly handle 409 status code
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/parse-efd-icms`,
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
          import_scope: 'icms_uso_consumo',
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
  }, [selectedEmpresa, session]);

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
  } = useUploadQueue({
    bucketName: 'efd-files',
    onFileComplete: triggerParseEfdIcms,
    onAllComplete: () => {
      toast.success('Todos os arquivos foram enviados para processamento!');
      clearQueue();
    },
    onError: (file, error) => {
      toast.error(`Erro no upload de ${file.file.name}: ${error.message}`);
    },
    onDuplicate: (file, duplicateInfo) => {
      toast.warning(`${file.file.name}: Período ${duplicateInfo.period} já foi importado para esta filial.`, {
        duration: 6000,
      });
    },
  });

  const uploading = isProcessing;

  useEffect(() => {
    const checkViews = async () => {
      if (!session) return;
      try {
        const { data, error } = await supabase.rpc('get_mv_uso_consumo_aggregated');
        if (error) {
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
      toast.info('Atualizando painéis...');
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
        toast.error(result.error || 'Falha ao atualizar views.');
        setViewsStatus('empty');
        return;
      }
      
      toast.success(`Painéis atualizados! (${result.duration_ms}ms)`);
      setViewsStatus('ok');
    } catch (err: any) {
      toast.error(err.name === 'AbortError' ? 'Timeout na atualização.' : 'Falha ao atualizar views.');
      setViewsStatus('empty');
    } finally {
      setRefreshingViews(false);
    }
  };

  useEffect(() => {
    if (!clearProgress || clearProgress.status === 'done' || clearProgress.status === 'refreshing_views') return;
    const messages = ['Contando registros...', 'Deletando Uso e Consumo...', 'Atualizando índices...'];
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
    
    return () => { clearInterval(messageInterval); clearInterval(progressInterval); };
  }, [clearProgress?.status]);

  const handleClearDatabase = async () => {
    if (!session?.user?.id) return;
    setIsClearing(true);
    setClearProgress({ status: 'deleting', currentTable: '', estimated: 0, deleted: 0 });

    try {
      const { data, error } = await supabase.functions.invoke('clear-icms-data');
      if (error || data?.error) throw new Error(data?.error || error?.message);
      
      const totalDeleted = data?.deleted?.uso_consumo || 0;
      
      // Mostrar status de atualização de views
      setProgressAnimation(95);
      setClearProgress({ status: 'refreshing_views', currentTable: 'Atualizando painéis...', estimated: totalDeleted, deleted: totalDeleted });
      setStatusMessage('Atualizando painéis...');

      // Aguardar um momento para mostrar o status antes de concluir
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      setProgressAnimation(100);
      setClearProgress({ status: 'done', currentTable: 'Concluído!', estimated: totalDeleted, deleted: totalDeleted });
      setViewsStatus('empty'); // Views foram limpas

      setTimeout(() => {
        setJobs([]);
        toast.success(data?.message || 'Base ICMS limpa!');
        setShowClearConfirm(false);
        setClearProgress(null);
      }, 1500);
    } catch (error) {
      toast.error('Erro ao limpar base');
      setClearProgress(null);
      setShowClearConfirm(false);
    } finally {
      setIsClearing(false);
    }
  };

  useEffect(() => {
    const checkEfdContribuicoes = async () => {
      if (!session) return;
      setLoadingPeriodos(true);
      try {
        const { data } = await supabase.from('mercadorias').select('mes_ano').limit(1000);
        if (!data || data.length === 0) {
          setHasEfdContribuicoes(false);
          setPeriodosDisponiveis([]);
          return;
        }
        const periodosSet = new Set<string>();
        data.forEach((m) => {
          if (m.mes_ano) {
            const mesAnoStr = typeof m.mes_ano === 'string' ? m.mes_ano : new Date(m.mes_ano).toISOString().slice(0, 10);
            periodosSet.add(mesAnoStr.substring(0, 7));
          }
        });
        const periodos = Array.from(periodosSet).sort().reverse().map(p => ({ mes_ano: p, label: p.split('-').reverse().join('/') }));
        setHasEfdContribuicoes(periodos.length > 0);
        setPeriodosDisponiveis(periodos);
      } catch { setHasEfdContribuicoes(false); setPeriodosDisponiveis([]); }
      finally { setLoadingPeriodos(false); }
    };
    checkEfdContribuicoes();
  }, [session]);

  useEffect(() => {
    if (sessionLoading) return;
    if (userEmpresas.length > 0) {
      setEmpresas(userEmpresas.map(e => ({ id: e.id, nome: e.nome })));
      setSelectedEmpresa(userEmpresas[0].id);
    }
  }, [userEmpresas, sessionLoading]);

  const loadJobs = useCallback(async () => {
    if (!session?.user?.id) return;
    const { data } = await supabase.from('import_jobs').select('*').eq('user_id', session.user.id).eq('import_scope', 'icms_uso_consumo').order('created_at', { ascending: false }).limit(10);
    if (data) setJobs(data.map(job => ({ ...job, counts: job.counts as unknown as ImportCounts, status: job.status as ImportJob['status'] })));
  }, [session?.user?.id]);

  useEffect(() => {
    if (!session?.user?.id) return;
    loadJobs();
    const channel = supabase.channel('import-jobs-icms-realtime').on('postgres_changes', { event: '*', schema: 'public', table: 'import_jobs', filter: `user_id=eq.${session.user.id}` }, (payload) => {
      if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
        const job = payload.new as any;
        if (job.import_scope === 'icms_uso_consumo') {
          loadJobs();
          if (job.status === 'completed') {
            toast.success(`Importação concluída! ${job.counts.uso_consumo_imobilizado || 0} registros.`);
            setViewsStatus('ok');
          } else if (job.status === 'failed') {
            toast.error(`Importação falhou: ${job.error_message || 'Erro'}`);
          }
        }
      }
    }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [session?.user?.id, loadJobs]);

  useEffect(() => {
    const hasActiveJobs = jobs.some(j => ['pending', 'processing', 'refreshing_views', 'generating'].includes(j.status));
    if (!hasActiveJobs || !session?.user?.id) return;
    const pollInterval = setInterval(loadJobs, 15000);
    return () => clearInterval(pollInterval);
  }, [jobs, session?.user?.id, loadJobs]);

  const handleFilesSelect = (files: File[]) => {
    const validFiles = files.filter(f => f.name.toLowerCase().endsWith('.txt') && f.size <= 1024 * 1024 * 1024);
    if (validFiles.length > 0) {
      const added = addFiles(validFiles);
      if (added > 0) toast.success(`${added} arquivo${added > 1 ? 's' : ''} adicionado${added > 1 ? 's' : ''}`);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFilesSelect(Array.from(e.target.files || []));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); setIsDragOver(false); handleFilesSelect(Array.from(e.dataTransfer.files)); };
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); setIsDragOver(true); };
  const handleDragLeave = () => setIsDragOver(false);

  const handleCancelJob = async (jobId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('cancel-import-job', { body: { job_id: jobId } });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      toast.success('Importação cancelada.');
    } catch (error) { toast.error('Erro ao cancelar'); }
  };

  const activeJobs = jobs.filter(j => ['pending', 'processing', 'refreshing_views', 'generating'].includes(j.status));
  const completedJobs = jobs.filter(j => ['completed', 'failed', 'cancelled'].includes(j.status));

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <AlertDialog open={showClearConfirm} onOpenChange={(open) => { if (!isClearing) { setShowClearConfirm(open); if (!open) setClearProgress(null); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive"><AlertTriangle className="h-5 w-5" />Limpar Base ICMS/IPI</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                {clearProgress ? (
                  <div className="space-y-4 py-4">
                    <div className="flex items-center gap-2">{clearProgress.status === 'done' ? <CheckCircle className="h-5 w-5 text-positive" /> : <Loader2 className="h-5 w-5 animate-spin text-primary" />}<span className="font-medium">{clearProgress.status === 'done' ? 'Concluído!' : statusMessage}</span></div>
                    <Progress value={clearProgress.status === 'done' ? 100 : progressAnimation} className="h-3" />
                  </div>
                ) : (<><p>Esta ação remove dados de Uso/Consumo e Ativo Imobilizado.</p><p className="mt-3 font-semibold text-destructive">Não pode ser desfeita!</p></>)}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            {!clearProgress && (<><AlertDialogCancel disabled={isClearing}>Cancelar</AlertDialogCancel><Button onClick={handleClearDatabase} disabled={isClearing} className="bg-destructive text-destructive-foreground">{isClearing && <Loader2 className="h-4 w-4 animate-spin mr-2" />}Confirmar</Button></>)}
            {clearProgress?.status === 'done' && <AlertDialogAction onClick={() => { setShowClearConfirm(false); setClearProgress(null); }}>Fechar</AlertDialogAction>}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {!loadingPeriodos && !hasEfdContribuicoes && (<Alert variant="destructive"><FileWarning className="h-4 w-4" /><AlertTitle>EFD Contribuições não encontrado</AlertTitle><AlertDescription>Importe primeiro arquivos de EFD CONTRIBUIÇÕES.</AlertDescription></Alert>)}

      {hasEfdContribuicoes && periodosDisponiveis.length > 0 && (<Alert className="border-blue-500 bg-blue-50 dark:bg-blue-950/20"><AlertCircle className="h-4 w-4 text-blue-600" /><AlertTitle className="text-blue-800 dark:text-blue-200">Períodos disponíveis</AlertTitle><AlertDescription className="text-blue-700 dark:text-blue-300">{periodosDisponiveis.slice(0, 6).map(p => p.label).join(', ')}{periodosDisponiveis.length > 6 && ` e mais ${periodosDisponiveis.length - 6}...`}</AlertDescription></Alert>)}

      <Card className={!hasEfdContribuicoes ? 'opacity-50 pointer-events-none' : ''}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2"><Upload className="h-5 w-5" />Importar EFD ICMS/IPI</CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleRefreshViews} disabled={refreshingViews || uploading}>{refreshingViews ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <RefreshCw className="h-4 w-4 mr-2" />}Atualizar Painéis</Button>
            <Button variant="outline" size="sm" className="text-destructive border-destructive hover:bg-destructive hover:text-destructive-foreground" onClick={() => setShowClearConfirm(true)} disabled={uploading || isClearing}><Trash2 className="h-4 w-4 mr-2" />Limpar Base</Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">Importe arquivos EFD ICMS/IPI para extrair dados de Uso e Consumo e Ativo Imobilizado. <strong className="text-foreground">Suporta múltiplos arquivos!</strong></p>
          <Alert className="border-positive/50 bg-positive/5"><Shield className="h-4 w-4 text-positive" /><AlertTitle className="text-positive">Segurança</AlertTitle><AlertDescription className="text-muted-foreground">O arquivo TXT é automaticamente excluído após a importação.</AlertDescription></Alert>
          
          <div className="space-y-2">
            <Label>Empresa Destino</Label>
            <Select value={selectedEmpresa} onValueChange={setSelectedEmpresa} disabled={uploading}><SelectTrigger><SelectValue placeholder="Selecione a empresa" /></SelectTrigger><SelectContent>{empresas.map((e) => <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>)}</SelectContent></Select>
          </div>

          <div className={`relative border-2 border-dashed rounded-lg p-8 transition-colors cursor-pointer ${isDragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-muted/50'} ${uploading || !selectedEmpresa || !hasEfdContribuicoes ? 'pointer-events-none opacity-40' : ''}`} onClick={() => fileInputRef.current?.click()} onDrop={handleDrop} onDragOver={handleDragOver} onDragLeave={handleDragLeave}>
            <input ref={fileInputRef} type="file" accept=".txt" multiple onChange={handleFileChange} className="hidden" disabled={uploading || !selectedEmpresa || !hasEfdContribuicoes} />
            <div className="flex flex-col items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center"><Files className="h-6 w-6 text-muted-foreground" /></div>
              <div className="space-y-1 text-center"><p className="text-sm font-medium">Arraste os arquivos ou clique para selecionar</p><p className="text-xs text-muted-foreground">Aceita múltiplos arquivos .txt (EFD ICMS/IPI) - até 1GB cada</p></div>
            </div>
          </div>

          {hasFiles && <MultiUploadProgress queue={queue} overallProgress={overallProgress} isProcessing={isProcessing} isPaused={isPaused} onRemoveFile={removeFile} onStartQueue={startQueue} onPauseQueue={pauseQueue} onCancelAll={cancelAll} onRetryFailed={retryFailed} onClearQueue={clearQueue} />}
        </CardContent>
      </Card>

      {activeJobs.length > 0 && (<Card><CardHeader className="flex flex-row items-center justify-between"><CardTitle className="flex items-center gap-2 text-lg"><Loader2 className="h-5 w-5 animate-spin" />Importações em Andamento</CardTitle><Button variant="ghost" size="sm" onClick={loadJobs}><RefreshCw className="h-4 w-4 mr-1" />Atualizar</Button></CardHeader><CardContent className="space-y-4">{activeJobs.map((job) => { const statusInfo = getStatusInfo(job.status); const StatusIcon = statusInfo.icon; const updateInfo = job.updated_at ? getTimeSinceUpdate(job.updated_at) : null; return (<div key={job.id} className="border rounded-lg p-4 space-y-3"><div className="flex items-start justify-between"><div className="space-y-1 min-w-0 flex-1"><p className="font-medium truncate max-w-xs" title={job.file_name}>{job.file_name}</p><p className="text-xs text-muted-foreground">{formatFileSize(job.file_size)} • {formatDate(job.created_at)}</p></div><Badge className={statusInfo.color}><StatusIcon className={`h-3 w-3 mr-1 ${job.status === 'processing' ? 'animate-spin' : ''}`} />{statusInfo.label}</Badge></div><Progress value={job.progress} className="h-2" />{updateInfo && <div className={`flex items-center gap-2 text-xs ${updateInfo.isStale ? 'text-warning' : 'text-muted-foreground'}`}><Clock className="h-3 w-3" /><span>Última atualização: {formatTime(job.updated_at)} ({updateInfo.text})</span></div>}<Button variant="outline" size="sm" onClick={() => handleCancelJob(job.id)} className="text-destructive"><XCircle className="h-4 w-4 mr-1" />Cancelar</Button></div>); })}</CardContent></Card>)}

      {completedJobs.length > 0 && (<Card><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><CheckCircle className="h-5 w-5 text-positive" />Histórico</CardTitle></CardHeader><CardContent><div className="space-y-3">{completedJobs.map((job) => { const statusInfo = getStatusInfo(job.status); const StatusIcon = statusInfo.icon; return (<div key={job.id} className="border rounded-lg p-4"><div className="flex items-start justify-between mb-2"><div className="space-y-1 min-w-0 flex-1"><p className="font-medium truncate max-w-xs">{job.file_name}</p><p className="text-xs text-muted-foreground">{formatFileSize(job.file_size)} • {formatDate(job.created_at)}</p></div><Badge className={statusInfo.color}><StatusIcon className="h-3 w-3 mr-1" />{statusInfo.label}</Badge></div>{job.status === 'completed' && <div className="bg-muted/50 rounded-lg p-3"><div className="grid grid-cols-2 gap-2 text-center"><div><p className="text-lg font-semibold">{job.counts.uso_consumo_imobilizado || 0}</p><p className="text-xs text-muted-foreground">Uso/Consumo/Imob.</p></div><div><p className="text-lg font-semibold">{job.counts.participantes || 0}</p><p className="text-xs text-muted-foreground">Participantes</p></div></div><div className="flex items-center justify-center gap-2 text-xs text-positive mt-2 pt-2 border-t"><Shield className="h-3 w-3" /><span>Arquivo excluído</span></div></div>}{job.status === 'failed' && job.error_message && <div className="bg-destructive/10 rounded-lg p-3 flex items-start gap-2"><AlertCircle className="h-4 w-4 text-destructive mt-0.5" /><p className="text-sm text-destructive">{job.error_message}</p></div>}</div>); })}</div></CardContent></Card>)}

      {jobs.length === 0 && !hasFiles && (<Card><CardContent className="py-12 text-center"><FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" /><p className="text-muted-foreground">Nenhuma importação encontrada.</p></CardContent></Card>)}
    </div>
  );
}
