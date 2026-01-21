import { useState, useCallback, useRef } from 'react';
import * as tus from 'tus-js-client';
import { supabase } from '@/integrations/supabase/client';

export interface UploadProgress {
  percentage: number;
  bytesUploaded: number;
  bytesTotal: number;
  speed: number; // bytes per second
  remainingTime: number; // seconds
  status: 'idle' | 'uploading' | 'paused' | 'completed' | 'error';
  errorMessage?: string;
}

interface UseResumableUploadOptions {
  bucketName: string;
  onComplete?: (filePath: string) => void;
  onError?: (error: Error) => void;
}

export function useResumableUpload(options: UseResumableUploadOptions) {
  const { bucketName, onComplete, onError } = options;
  
  const [progress, setProgress] = useState<UploadProgress>({
    percentage: 0,
    bytesUploaded: 0,
    bytesTotal: 0,
    speed: 0,
    remainingTime: 0,
    status: 'idle',
  });
  
  const uploadRef = useRef<tus.Upload | null>(null);
  const lastProgressTime = useRef<number>(0);
  const lastBytesUploaded = useRef<number>(0);
  const speedSamples = useRef<number[]>([]);
  const noProgressTimeout = useRef<NodeJS.Timeout | null>(null);

  const calculateSpeed = useCallback((bytesUploaded: number, bytesTotal: number) => {
    const now = Date.now();
    const timeDiff = (now - lastProgressTime.current) / 1000; // seconds
    
    if (timeDiff > 0 && lastProgressTime.current > 0) {
      const bytesDiff = bytesUploaded - lastBytesUploaded.current;
      const instantSpeed = bytesDiff / timeDiff;
      
      // Keep last 5 samples for smoothing
      speedSamples.current.push(instantSpeed);
      if (speedSamples.current.length > 5) {
        speedSamples.current.shift();
      }
      
      // Average speed
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

  const resetNoProgressTimer = useCallback(() => {
    if (noProgressTimeout.current) {
      clearTimeout(noProgressTimeout.current);
    }
    noProgressTimeout.current = setTimeout(() => {
      setProgress(prev => ({
        ...prev,
        status: 'error',
        errorMessage: 'Upload sem progresso há 60 segundos. Verifique sua conexão.',
      }));
    }, 60000); // 60 seconds without progress
  }, []);

  const startUpload = useCallback(async (file: File, filePath: string): Promise<void> => {
    return new Promise(async (resolve, reject) => {
      try {
        // Get session for auth
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
          throw new Error('Usuário não autenticado');
        }

        // Reset state
        speedSamples.current = [];
        lastProgressTime.current = 0;
        lastBytesUploaded.current = 0;

        setProgress({
          percentage: 0,
          bytesUploaded: 0,
          bytesTotal: file.size,
          speed: 0,
          remainingTime: 0,
          status: 'uploading',
        });

        resetNoProgressTimer();

        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const uploadUrl = `${supabaseUrl}/storage/v1/upload/resumable`;

        const upload = new tus.Upload(file, {
          endpoint: uploadUrl,
          retryDelays: [0, 1000, 3000, 5000, 10000], // Retry delays in ms
          chunkSize: 50 * 1024 * 1024, // 50MB chunks to reduce request count and potential overhead
          headers: {
            authorization: `Bearer ${session.access_token}`,
            'x-upsert': 'true', // Changed to true to allow overwriting if needed, helps with retries
          },
          uploadDataDuringCreation: false, // Changed to false to prevent 413 on initial creation
          removeFingerprintOnSuccess: true,
          metadata: {
            bucketName: bucketName,
            objectName: filePath,
            contentType: file.type || 'text/plain',
            cacheControl: '3600',
          },
          onError: (error) => {
            console.error('TUS upload error:', error);
            if (noProgressTimeout.current) {
              clearTimeout(noProgressTimeout.current);
            }
            
            const errorMessage = error.message || 'Erro desconhecido no upload';
            setProgress(prev => ({
              ...prev,
              status: 'error',
              errorMessage,
            }));
            
            onError?.(error);
            reject(error);
          },
          onProgress: (bytesUploaded, bytesTotal) => {
            resetNoProgressTimer();
            
            const percentage = Math.round((bytesUploaded / bytesTotal) * 100);
            const { speed, remainingTime } = calculateSpeed(bytesUploaded, bytesTotal);
            
            setProgress({
              percentage,
              bytesUploaded,
              bytesTotal,
              speed,
              remainingTime,
              status: 'uploading',
            });

            console.log(`Upload progress: ${percentage}% (${formatBytes(bytesUploaded)}/${formatBytes(bytesTotal)}) - ${formatBytes(speed)}/s`);
          },
          onSuccess: () => {
            console.log('TUS upload completed:', filePath);
            if (noProgressTimeout.current) {
              clearTimeout(noProgressTimeout.current);
            }
            
            setProgress(prev => ({
              ...prev,
              percentage: 100,
              status: 'completed',
            }));
            
            onComplete?.(filePath);
            resolve();
          },
        });

        uploadRef.current = upload;

        // Check for previous uploads (resumable)
        const previousUploads = await upload.findPreviousUploads();
        if (previousUploads.length > 0) {
          console.log('Resuming previous upload');
          upload.resumeFromPreviousUpload(previousUploads[0]);
        }

        upload.start();
      } catch (error) {
        console.error('Failed to start upload:', error);
        const err = error instanceof Error ? error : new Error('Falha ao iniciar upload');
        setProgress(prev => ({
          ...prev,
          status: 'error',
          errorMessage: err.message,
        }));
        onError?.(err);
        reject(err);
      }
    });
  }, [bucketName, onComplete, onError, calculateSpeed, resetNoProgressTimer]);

  const pauseUpload = useCallback(() => {
    if (uploadRef.current) {
      uploadRef.current.abort();
      if (noProgressTimeout.current) {
        clearTimeout(noProgressTimeout.current);
      }
      setProgress(prev => ({
        ...prev,
        status: 'paused',
      }));
    }
  }, []);

  const resumeUpload = useCallback(() => {
    if (uploadRef.current) {
      resetNoProgressTimer();
      setProgress(prev => ({
        ...prev,
        status: 'uploading',
        errorMessage: undefined,
      }));
      uploadRef.current.start();
    }
  }, [resetNoProgressTimer]);

  const cancelUpload = useCallback(() => {
    if (uploadRef.current) {
      uploadRef.current.abort();
      if (noProgressTimeout.current) {
        clearTimeout(noProgressTimeout.current);
      }
      uploadRef.current = null;
    }
    setProgress({
      percentage: 0,
      bytesUploaded: 0,
      bytesTotal: 0,
      speed: 0,
      remainingTime: 0,
      status: 'idle',
    });
  }, []);

  const resetUpload = useCallback(() => {
    if (noProgressTimeout.current) {
      clearTimeout(noProgressTimeout.current);
    }
    uploadRef.current = null;
    setProgress({
      percentage: 0,
      bytesUploaded: 0,
      bytesTotal: 0,
      speed: 0,
      remainingTime: 0,
      status: 'idle',
    });
  }, []);

  return {
    progress,
    startUpload,
    pauseUpload,
    resumeUpload,
    cancelUpload,
    resetUpload,
    isUploading: progress.status === 'uploading',
    isPaused: progress.status === 'paused',
    isCompleted: progress.status === 'completed',
    hasError: progress.status === 'error',
  };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
