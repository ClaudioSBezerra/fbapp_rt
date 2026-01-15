import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Loader2, CheckCircle, FileText, AlertCircle, Upload, Clock, XCircle, RefreshCw, AlertTriangle, FileWarning } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useSessionInfo } from '@/hooks/useSessionInfo';
import { useResumableUpload } from '@/hooks/useResumableUpload';
import { UploadProgressDisplay } from '@/components/UploadProgress';
import { toast } from 'sonner';
import { formatCNPJMasked } from '@/lib/formatFilial';

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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { session } = useAuth();
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

  // Verificar se existem dados de EFD Contribuições
  useEffect(() => {
    const checkEfdContribuicoes = async () => {
      if (!session) return;
      setLoadingPeriodos(true);
      
      try {
        // Buscar períodos com dados de mercadorias (EFD Contribuições)
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

        // Extrair períodos únicos
        const periodosSet = new Set<string>();
        data.forEach((m) => {
          if (m.mes_ano) {
            const mesAnoStr = typeof m.mes_ano === 'string' 
              ? m.mes_ano 
              : new Date(m.mes_ano).toISOString().slice(0, 10);
            periodosSet.add(mesAnoStr.substring(0, 7)); // YYYY-MM
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
                toast.success(`Importação concluída! ${counts.uso_consumo_imobilizado || 0} registros importados.`);
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
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  };

  return (
    <div className="space-y-6">
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

      {/* Upload Area */}
      <Card className={!hasEfdContribuicoes ? 'opacity-50 pointer-events-none' : ''}>
        <CardHeader>
          <CardTitle className="text-lg">Upload de Arquivo</CardTitle>
          <CardDescription>
            Selecione um arquivo EFD ICMS/IPI (.txt) para importar os dados de Uso e Consumo e Ativo Imobilizado
          </CardDescription>
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
              onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
              className="hidden"
              ref={fileInputRef}
              disabled={uploading}
            />
            <Upload className="h-10 w-10 mx-auto mb-4 text-muted-foreground" />
            <p className="text-sm text-muted-foreground mb-2">
              Arraste e solte um arquivo EFD ICMS/IPI aqui ou
            </p>
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              Selecionar arquivo
            </Button>
          </div>

          {/* Selected File Info */}
          {selectedFile && !uploading && (
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="font-medium text-sm">{selectedFile.name}</p>
                  <p className="text-xs text-muted-foreground">{formatFileSize(selectedFile.size)}</p>
                </div>
              </div>
              <Button onClick={handleStartImport} disabled={!selectedEmpresa}>
                Iniciar Importação
              </Button>
            </div>
          )}

          {/* Upload Progress */}
          {(isUploading || isPaused || uploadCompleted || uploadHasError) && (
            <div className="space-y-3">
              <UploadProgressDisplay progress={uploadProgress} fileName={selectedFile?.name || ''} />
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
                  <div key={job.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <StatusIcon className={`h-5 w-5 ${isActive ? 'animate-spin' : ''}`} />
                      <div>
                        <p className="font-medium text-sm">{job.file_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(job.created_at)} • {formatFileSize(job.file_size)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge className={statusInfo.color}>{statusInfo.label}</Badge>
                      {job.status === 'completed' && job.counts && (
                        <span className="text-xs text-muted-foreground">
                          {job.counts.uso_consumo_imobilizado || 0} registros
                        </span>
                      )}
                      {job.status === 'processing' && (
                        <span className="text-xs text-muted-foreground">
                          {job.progress}%
                        </span>
                      )}
                    </div>
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
