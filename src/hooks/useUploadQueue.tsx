import { useState, useCallback, useRef } from 'react';
import * as tus from 'tus-js-client';
import { supabase } from '@/integrations/supabase/client';

export interface QueuedFileProgress {
  percentage: number;
  bytesUploaded: number;
  bytesTotal: number;
  speed: number;
  remainingTime: number;
}

export interface QueuedFile {
  id: string;
  file: File;
  status: 'pending' | 'uploading' | 'processing' | 'completed' | 'error' | 'cancelled' | 'duplicate';
  progress: QueuedFileProgress;
  filePath?: string;
  error?: string;
  duplicateInfo?: {
    period: string;
    cnpj: string;
    existingImportId: string;
  };
}

export interface OverallProgress {
  completed: number;
  total: number;
  percentage: number;
  currentFile?: string;
}

interface UseUploadQueueOptions {
  bucketName: string;
  onFileComplete?: (file: QueuedFile, filePath: string) => Promise<void>;
  onAllComplete?: () => void;
  onError?: (file: QueuedFile, error: Error) => void;
  onDuplicate?: (file: QueuedFile, duplicateInfo: { period: string; cnpj: string; existingImportId: string }) => void;
}

export function useUploadQueue(options: UseUploadQueueOptions) {
  const { bucketName, onFileComplete, onAllComplete, onError, onDuplicate } = options;
  
  const [queue, setQueue] = useState<QueuedFile[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  
  const currentUploadRef = useRef<tus.Upload | null>(null);
  const processingRef = useRef(false);
  const pausedRef = useRef(false);
  const lastProgressTime = useRef<number>(0);
  const lastBytesUploaded = useRef<number>(0);
  const speedSamples = useRef<number[]>([]);

  const generateId = () => `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  const calculateSpeed = useCallback((bytesUploaded: number, bytesTotal: number) => {
    const now = Date.now();
    const timeDiff = (now - lastProgressTime.current) / 1000;
    
    if (timeDiff > 0 && lastProgressTime.current > 0) {
      const bytesDiff = bytesUploaded - lastBytesUploaded.current;
      const instantSpeed = bytesDiff / timeDiff;
      
      speedSamples.current.push(instantSpeed);
      if (speedSamples.current.length > 5) {
        speedSamples.current.shift();
      }
      
      const avgSpeed = speedSamples.current.reduce((a, b) => a + b, 0) / speedSamples.current.length;
      const remainingBytes = bytesTotal - bytesUploaded;
      const remainingTime = avgSpeed > 0 ? remainingBytes / avgSpeed : 0;
      
      lastProgressTime.current = now;
      lastBytesUploaded.current = bytesUploaded;
      
      return { speed: Math.max(0, avgSpeed), remainingTime: Math.max(0, remainingTime) };
    }
    
    lastProgressTime.current = now;
    lastBytesUploaded.current = bytesUploaded;
    return { speed: 0, remainingTime: 0 };
  }, []);

  const updateFileInQueue = useCallback((id: string, updates: Partial<QueuedFile>) => {
    setQueue(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f));
  }, []);

  const uploadSingleFile = useCallback(async (queuedFile: QueuedFile): Promise<string> => {
    return new Promise(async (resolve, reject) => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
          throw new Error('Usuário não autenticado');
        }

        speedSamples.current = [];
        lastProgressTime.current = 0;
        lastBytesUploaded.current = 0;

        const timestamp = Date.now();
        const filePath = `${session.user.id}/${timestamp}_${queuedFile.file.name}`;

        updateFileInQueue(queuedFile.id, {
          status: 'uploading',
          filePath,
          progress: {
            percentage: 0,
            bytesUploaded: 0,
            bytesTotal: queuedFile.file.size,
            speed: 0,
            remainingTime: 0,
          },
        });

        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const uploadUrl = `${supabaseUrl}/storage/v1/upload/resumable`;

        const upload = new tus.Upload(queuedFile.file, {
          endpoint: uploadUrl,
          retryDelays: [0, 1000, 3000, 5000, 10000],
          chunkSize: 6 * 1024 * 1024,
          headers: {
            authorization: `Bearer ${session.access_token}`,
            'x-upsert': 'false',
          },
          uploadDataDuringCreation: true,
          removeFingerprintOnSuccess: true,
          metadata: {
            bucketName: bucketName,
            objectName: filePath,
            contentType: queuedFile.file.type || 'text/plain',
            cacheControl: '3600',
          },
          onError: (error) => {
            console.error('TUS upload error:', error);
            updateFileInQueue(queuedFile.id, {
              status: 'error',
              error: error.message || 'Erro desconhecido no upload',
            });
            reject(error);
          },
          onProgress: (bytesUploaded, bytesTotal) => {
            if (pausedRef.current) return;
            
            const percentage = Math.round((bytesUploaded / bytesTotal) * 100);
            const { speed, remainingTime } = calculateSpeed(bytesUploaded, bytesTotal);
            
            updateFileInQueue(queuedFile.id, {
              progress: {
                percentage,
                bytesUploaded,
                bytesTotal,
                speed,
                remainingTime,
              },
            });
          },
          onSuccess: () => {
            console.log('TUS upload completed:', filePath);
            updateFileInQueue(queuedFile.id, {
              status: 'processing',
              progress: {
                ...queuedFile.progress,
                percentage: 100,
                bytesUploaded: queuedFile.file.size,
                bytesTotal: queuedFile.file.size,
              },
            });
            resolve(filePath);
          },
        });

        currentUploadRef.current = upload;

        const previousUploads = await upload.findPreviousUploads();
        if (previousUploads.length > 0) {
          upload.resumeFromPreviousUpload(previousUploads[0]);
        }

        upload.start();
      } catch (error) {
        console.error('Failed to start upload:', error);
        const err = error instanceof Error ? error : new Error('Falha ao iniciar upload');
        updateFileInQueue(queuedFile.id, {
          status: 'error',
          error: err.message,
        });
        reject(err);
      }
    });
  }, [bucketName, calculateSpeed, updateFileInQueue]);

  const processQueue = useCallback(async () => {
    if (processingRef.current || pausedRef.current) return;
    
    processingRef.current = true;
    setIsProcessing(true);

    const pendingFiles = queue.filter(f => f.status === 'pending');
    
    for (const queuedFile of pendingFiles) {
      if (pausedRef.current) break;
      
      try {
        const filePath = await uploadSingleFile(queuedFile);
        
        // Call onFileComplete callback
        if (onFileComplete) {
          try {
            await onFileComplete(queuedFile, filePath);
            updateFileInQueue(queuedFile.id, { status: 'completed' });
          } catch (callbackError: any) {
            console.error('Error in onFileComplete callback:', callbackError);
            
            // Check if it's a duplicate error (409)
            const errorMessage = callbackError?.message || '';
            const isDuplicate = errorMessage.includes('duplicate') || 
                               callbackError?.duplicate === true ||
                               (callbackError?.context?.json?.duplicate === true);
            
            if (isDuplicate || callbackError?.context?.json?.duplicate) {
              const duplicateData = callbackError?.context?.json || {};
              const duplicateInfo = {
                period: duplicateData.period || '',
                cnpj: duplicateData.cnpj || '',
                existingImportId: duplicateData.existing_import_id || '',
              };
              updateFileInQueue(queuedFile.id, {
                status: 'duplicate',
                error: duplicateData.error || errorMessage,
                duplicateInfo,
              });
              onDuplicate?.(queuedFile, duplicateInfo);
            } else {
              updateFileInQueue(queuedFile.id, {
                status: 'error',
                error: callbackError instanceof Error ? callbackError.message : 'Erro ao processar arquivo',
              });
              onError?.(queuedFile, callbackError instanceof Error ? callbackError : new Error('Erro ao processar arquivo'));
            }
          }
        } else {
          updateFileInQueue(queuedFile.id, { status: 'completed' });
        }
      } catch (error) {
        console.error('Error uploading file:', error);
        onError?.(queuedFile, error instanceof Error ? error : new Error('Erro no upload'));
      }
    }

    processingRef.current = false;
    setIsProcessing(false);
    currentUploadRef.current = null;

    // Check if all files are done
    setQueue(prev => {
      const allDone = prev.every(f => 
        f.status === 'completed' || f.status === 'error' || f.status === 'cancelled' || f.status === 'duplicate'
      );
      if (allDone && prev.length > 0) {
        onAllComplete?.();
      }
      return prev;
    });
  }, [queue, uploadSingleFile, onFileComplete, onAllComplete, onError, onDuplicate, updateFileInQueue]);

  const addFiles = useCallback((files: File[]) => {
    const validFiles = files.filter(file => {
      if (!file.name.toLowerCase().endsWith('.txt')) {
        console.warn(`Arquivo ignorado (não é .txt): ${file.name}`);
        return false;
      }
      if (file.size > 1024 * 1024 * 1024) {
        console.warn(`Arquivo muito grande (>1GB): ${file.name}`);
        return false;
      }
      return true;
    });

    const newQueuedFiles: QueuedFile[] = validFiles.map(file => ({
      id: generateId(),
      file,
      status: 'pending',
      progress: {
        percentage: 0,
        bytesUploaded: 0,
        bytesTotal: file.size,
        speed: 0,
        remainingTime: 0,
      },
    }));

    setQueue(prev => {
      // Avoid duplicates by file name
      const existingNames = new Set(prev.map(f => f.file.name));
      const uniqueFiles = newQueuedFiles.filter(f => !existingNames.has(f.file.name));
      return [...prev, ...uniqueFiles];
    });

    return newQueuedFiles.length;
  }, []);

  const removeFile = useCallback((id: string) => {
    setQueue(prev => {
      const file = prev.find(f => f.id === id);
      if (file?.status === 'uploading' && currentUploadRef.current) {
        currentUploadRef.current.abort();
        currentUploadRef.current = null;
      }
      return prev.filter(f => f.id !== id);
    });
  }, []);

  const clearQueue = useCallback(() => {
    if (currentUploadRef.current) {
      currentUploadRef.current.abort();
      currentUploadRef.current = null;
    }
    processingRef.current = false;
    pausedRef.current = false;
    setIsProcessing(false);
    setIsPaused(false);
    setQueue([]);
  }, []);

  const startQueue = useCallback(() => {
    pausedRef.current = false;
    setIsPaused(false);
    processQueue();
  }, [processQueue]);

  const pauseQueue = useCallback(() => {
    pausedRef.current = true;
    setIsPaused(true);
    if (currentUploadRef.current) {
      currentUploadRef.current.abort();
    }
    setQueue(prev => prev.map(f => 
      f.status === 'uploading' ? { ...f, status: 'pending' as const } : f
    ));
  }, []);

  const cancelAll = useCallback(() => {
    if (currentUploadRef.current) {
      currentUploadRef.current.abort();
      currentUploadRef.current = null;
    }
    processingRef.current = false;
    pausedRef.current = false;
    setIsProcessing(false);
    setIsPaused(false);
    setQueue(prev => prev.map(f => 
      f.status === 'pending' || f.status === 'uploading' 
        ? { ...f, status: 'cancelled' as const } 
        : f
    ));
  }, []);

  const retryFailed = useCallback(() => {
    setQueue(prev => prev.map(f => 
      f.status === 'error' || f.status === 'cancelled'
        ? { ...f, status: 'pending' as const, error: undefined }
        : f
    ));
  }, []);

  // Calculate overall progress
  const overallProgress: OverallProgress = {
    completed: queue.filter(f => f.status === 'completed').length,
    total: queue.length,
    percentage: queue.length > 0 
      ? Math.round(
          queue.reduce((sum, f) => {
            if (f.status === 'completed') return sum + 100;
            if (f.status === 'uploading' || f.status === 'processing') return sum + f.progress.percentage;
            return sum;
          }, 0) / queue.length
        )
      : 0,
    currentFile: queue.find(f => f.status === 'uploading')?.file.name,
  };

  return {
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
    hasFiles: queue.length > 0,
    hasPendingFiles: queue.some(f => f.status === 'pending'),
    hasErrors: queue.some(f => f.status === 'error'),
  };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatSpeed(bytesPerSecond: number): string {
  return `${formatBytes(bytesPerSecond)}/s`;
}

export function formatTime(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}
