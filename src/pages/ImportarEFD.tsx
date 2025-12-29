import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Loader2, CheckCircle, FileText, ArrowRight, AlertCircle, Upload, Clock, XCircle, RefreshCw, Zap } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

interface ImportCounts {
  mercadorias: number;
  energia_agua: number;
  fretes: number;
}

interface ImportJob {
  id: string;
  user_id: string;
  empresa_id: string;
  filial_id: string | null;
  file_path: string;
  file_name: string;
  file_size: number;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { session } = useAuth();
  const navigate = useNavigate();

  // Load empresas
  useEffect(() => {
    const loadEmpresas = async () => {
      const { data: empresasData } = await supabase
        .from('empresas')
        .select('id, nome, grupo_id');
      if (empresasData) {
        setEmpresas(empresasData);
        if (empresasData.length > 0) {
          setSelectedEmpresa(empresasData[0].id);
        }
      }
    };
    loadEmpresas();
  }, []);

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
              counts: (newJob.counts || { mercadorias: 0, energia_agua: 0, fretes: 0 }) as ImportCounts,
              status: newJob.status as ImportJob['status'],
            }, ...prev].slice(0, 10));
          } else if (payload.eventType === 'UPDATE') {
            const updatedJob = payload.new as any;
            setJobs(prev => prev.map(job => 
              job.id === updatedJob.id 
                ? {
                    ...updatedJob,
                    counts: (updatedJob.counts || { mercadorias: 0, energia_agua: 0, fretes: 0 }) as ImportCounts,
                    status: updatedJob.status as ImportJob['status'],
                  }
                : job
            ));
            
            // Show toast on completion and redirect
            if (updatedJob.status === 'completed') {
              const counts = updatedJob.counts as ImportCounts;
              const total = counts.mercadorias + counts.energia_agua + counts.fretes;
              toast.success(`Importação concluída! ${total} registros importados. Redirecionando...`);
              
              // Redirect to Mercadorias after 2 seconds
              setTimeout(() => {
                navigate('/mercadorias');
              }, 2000);
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

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Upload Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Importar EFD
          </CardTitle>
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
                  ? `Importará até ${recordLimit} registros de cada bloco (C100, C500, C600, D100, D500)`
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
