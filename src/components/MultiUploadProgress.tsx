import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  CheckCircle, 
  Clock, 
  Loader2, 
  XCircle, 
  X, 
  Pause, 
  Play, 
  AlertCircle,
  FileText,
  Upload,
  Trash2,
  AlertTriangle
} from 'lucide-react';
import { QueuedFile, OverallProgress, formatBytes, formatSpeed, formatTime } from '@/hooks/useUploadQueue';

interface MultiUploadProgressProps {
  queue: QueuedFile[];
  overallProgress: OverallProgress;
  isProcessing: boolean;
  isPaused: boolean;
  onRemoveFile: (id: string) => void;
  onStartQueue: () => void;
  onPauseQueue: () => void;
  onCancelAll: () => void;
  onRetryFailed: () => void;
  onClearQueue: () => void;
}

function getStatusIcon(status: QueuedFile['status']) {
  switch (status) {
    case 'pending':
      return <Clock className="h-4 w-4 text-muted-foreground" />;
    case 'uploading':
      return <Loader2 className="h-4 w-4 text-primary animate-spin" />;
    case 'processing':
      return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
    case 'completed':
      return <CheckCircle className="h-4 w-4 text-positive" />;
    case 'error':
      return <XCircle className="h-4 w-4 text-destructive" />;
    case 'cancelled':
      return <XCircle className="h-4 w-4 text-warning" />;
    case 'duplicate':
      return <AlertTriangle className="h-4 w-4 text-warning" />;
  }
}

function getStatusLabel(status: QueuedFile['status'], progress: QueuedFile['progress']) {
  switch (status) {
    case 'pending':
      return 'Aguardando';
    case 'uploading':
      return `${progress.percentage}% - ${formatSpeed(progress.speed)}`;
    case 'processing':
      return 'Processando...';
    case 'completed':
      return 'Concluído';
    case 'error':
      return 'Erro';
    case 'cancelled':
      return 'Cancelado';
    case 'duplicate':
      return 'Período já importado';
  }
}

export function MultiUploadProgress({
  queue,
  overallProgress,
  isProcessing,
  isPaused,
  onRemoveFile,
  onStartQueue,
  onPauseQueue,
  onCancelAll,
  onRetryFailed,
  onClearQueue,
}: MultiUploadProgressProps) {
  if (queue.length === 0) return null;

  const hasErrors = queue.some(f => f.status === 'error' || f.status === 'cancelled');
  const hasDuplicates = queue.some(f => f.status === 'duplicate');
  const allDone = queue.every(f => f.status === 'completed' || f.status === 'error' || f.status === 'cancelled' || f.status === 'duplicate');
  const hasCompletedFiles = queue.some(f => f.status === 'completed');
  const pendingCount = queue.filter(f => f.status === 'pending').length;
  const uploadingCount = queue.filter(f => f.status === 'uploading' || f.status === 'processing').length;
  const duplicateCount = queue.filter(f => f.status === 'duplicate').length;

  return (
    <div className="border rounded-lg bg-card">
      {/* Header with overall progress */}
      <div className="p-4 border-b">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Upload className="h-5 w-5 text-primary" />
            <span className="font-medium">
              {allDone 
                ? `Upload concluído (${overallProgress.completed} de ${overallProgress.total})` 
                : isProcessing
                  ? `Enviando arquivos (${overallProgress.completed} de ${overallProgress.total} concluídos)`
                  : `${queue.length} arquivo${queue.length > 1 ? 's' : ''} selecionado${queue.length > 1 ? 's' : ''}`
              }
            </span>
          </div>
          {!isProcessing && !allDone && (
            <Button 
              variant="ghost" 
              size="icon" 
              className="h-8 w-8"
              onClick={onClearQueue}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
        
        <Progress value={overallProgress.percentage} className="h-2" />
        
        {isProcessing && overallProgress.currentFile && (
          <p className="text-xs text-muted-foreground mt-1">
            Enviando: {overallProgress.currentFile}
          </p>
        )}
      </div>

      {/* File list */}
      <ScrollArea className="max-h-60">
        <div className="divide-y">
          {queue.map((file) => (
            <div 
              key={file.id} 
              className={`px-4 py-3 flex items-center gap-3 ${
                file.status === 'error' ? 'bg-destructive/5' : 
                file.status === 'completed' ? 'bg-positive/5' :
                file.status === 'duplicate' ? 'bg-warning/10' : ''
              }`}
            >
              {getStatusIcon(file.status)}
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium truncate">
                    {file.file.name}
                  </span>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatBytes(file.file.size)}
                  </span>
                </div>
                
                {file.status === 'uploading' && (
                  <Progress value={file.progress.percentage} className="h-1 mt-1" />
                )}
                
                <div className="flex items-center justify-between mt-0.5">
                  <span className={`text-xs ${
                    file.status === 'error' ? 'text-destructive' :
                    file.status === 'completed' ? 'text-positive' :
                    file.status === 'duplicate' ? 'text-warning' :
                    'text-muted-foreground'
                  }`}>
                    {file.error || getStatusLabel(file.status, file.progress)}
                  </span>
                  
                  {file.status === 'uploading' && file.progress.remainingTime > 0 && (
                    <span className="text-xs text-muted-foreground">
                      ~{formatTime(file.progress.remainingTime)}
                    </span>
                  )}
                </div>
              </div>

              {(file.status === 'pending' || file.status === 'error' || file.status === 'cancelled' || file.status === 'duplicate') && !isProcessing && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0"
                  onClick={() => onRemoveFile(file.id)}
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>

      {/* Actions */}
      <div className="p-3 border-t bg-muted/30 flex items-center justify-between gap-2">
        {!allDone ? (
          <>
            {!isProcessing ? (
              <>
                <div className="text-xs text-muted-foreground">
                  {pendingCount} arquivo{pendingCount !== 1 ? 's' : ''} para enviar
                </div>
                <div className="flex gap-2">
                  {hasErrors && (
                    <Button variant="outline" size="sm" onClick={onRetryFailed}>
                      <AlertCircle className="h-4 w-4 mr-1" />
                      Retentar falhos
                    </Button>
                  )}
                  <Button size="sm" onClick={onStartQueue}>
                    <Play className="h-4 w-4 mr-1" />
                    Iniciar Upload
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="text-xs text-muted-foreground">
                  {uploadingCount > 0 && `Enviando ${uploadingCount} arquivo${uploadingCount !== 1 ? 's' : ''}...`}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={onPauseQueue}>
                    <Pause className="h-4 w-4 mr-1" />
                    Pausar
                  </Button>
                  <Button variant="destructive" size="sm" onClick={onCancelAll}>
                    <XCircle className="h-4 w-4 mr-1" />
                    Cancelar Todos
                  </Button>
                </div>
              </>
            )}
          </>
        ) : (
          <>
            <div className="text-xs">
              {hasCompletedFiles && (
                <span className="text-positive">
                  <CheckCircle className="h-3 w-3 inline mr-1" />
                  {queue.filter(f => f.status === 'completed').length} concluído{queue.filter(f => f.status === 'completed').length !== 1 ? 's' : ''}
                </span>
              )}
              {hasErrors && (
                <span className="text-destructive ml-2">
                  <XCircle className="h-3 w-3 inline mr-1" />
                  {queue.filter(f => f.status === 'error' || f.status === 'cancelled').length} com erro
                </span>
              )}
              {hasDuplicates && (
                <span className="text-warning ml-2">
                  <AlertTriangle className="h-3 w-3 inline mr-1" />
                  {duplicateCount} já importado{duplicateCount !== 1 ? 's' : ''}
                </span>
              )}
            </div>
            <div className="flex gap-2">
              {hasErrors && (
                <Button variant="outline" size="sm" onClick={onRetryFailed}>
                  <AlertCircle className="h-4 w-4 mr-1" />
                  Retentar
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={onClearQueue}>
                Limpar Lista
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

interface FileSelectionListProps {
  files: File[];
  onRemoveFile: (index: number) => void;
  onClearAll: () => void;
}

export function FileSelectionList({ files, onRemoveFile, onClearAll }: FileSelectionListProps) {
  if (files.length === 0) return null;

  const totalSize = files.reduce((sum, f) => sum + f.size, 0);

  return (
    <div className="border rounded-lg bg-card">
      <div className="p-3 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">
            {files.length} arquivo{files.length > 1 ? 's' : ''} selecionado{files.length > 1 ? 's' : ''}
          </span>
          <span className="text-xs text-muted-foreground">
            ({formatBytes(totalSize)} total)
          </span>
        </div>
        <Button variant="ghost" size="sm" onClick={onClearAll}>
          Limpar
        </Button>
      </div>
      
      <ScrollArea className="max-h-40">
        <div className="divide-y">
          {files.map((file, index) => (
            <div key={index} className="px-3 py-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-sm truncate">{file.name}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-muted-foreground">{formatBytes(file.size)}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => onRemoveFile(index)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
