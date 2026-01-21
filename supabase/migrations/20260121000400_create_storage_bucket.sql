-- Create the bucket 'efd-files' if it doesn't exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('efd-files', 'efd-files', false, 1073741824, null)
ON CONFLICT (id) DO UPDATE SET 
  file_size_limit = 1073741824,
  public = false;

-- Drop existing policies to avoid conflicts (and clean up potentially old ones)
DROP POLICY IF EXISTS "Authenticated users can upload EFD files" ON storage.objects;
DROP POLICY IF EXISTS "Users can view their own EFD files" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own EFD files" ON storage.objects;

-- Policy: Authenticated users can upload (INSERT)
CREATE POLICY "Authenticated users can upload EFD files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'efd-files' AND 
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: Users can view their own files (SELECT)
CREATE POLICY "Users can view their own EFD files"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'efd-files' AND 
  (storage.foldername(name))[1] = auth.uid()::text
);

-- Policy: Users can delete their own files (DELETE)
CREATE POLICY "Users can delete their own EFD files"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'efd-files' AND 
  (storage.foldername(name))[1] = auth.uid()::text
);
