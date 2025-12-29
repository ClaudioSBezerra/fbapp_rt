-- Create storage bucket for EFD files
INSERT INTO storage.buckets (id, name, public)
VALUES ('efd-files', 'efd-files', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for efd-files bucket
CREATE POLICY "Users can upload their own EFD files"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'efd-files' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can view their own EFD files"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'efd-files' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can delete their own EFD files"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'efd-files' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Create import_jobs table
CREATE TABLE public.import_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  filial_id UUID REFERENCES public.filiais(id) ON DELETE SET NULL,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size BIGINT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  progress INTEGER NOT NULL DEFAULT 0,
  total_lines INTEGER NOT NULL DEFAULT 0,
  counts JSONB NOT NULL DEFAULT '{"mercadorias": 0, "energia_agua": 0, "fretes": 0}'::jsonb,
  error_message TEXT,
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on import_jobs
ALTER TABLE public.import_jobs ENABLE ROW LEVEL SECURITY;

-- RLS policies for import_jobs
CREATE POLICY "Users can view their own import jobs"
ON public.import_jobs FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own import jobs"
ON public.import_jobs FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own import jobs"
ON public.import_jobs FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own import jobs"
ON public.import_jobs FOR DELETE
USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_import_jobs_updated_at
BEFORE UPDATE ON public.import_jobs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable Realtime for import_jobs
ALTER PUBLICATION supabase_realtime ADD TABLE public.import_jobs;