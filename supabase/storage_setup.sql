-- =============================================
-- BRIK - Storage Bucket Setup
-- Run this in Supabase SQL Editor AFTER schema
-- =============================================

-- Create storage bucket for worker photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('worker-photos', 'worker-photos', true);

-- Allow authenticated users to upload
CREATE POLICY "Authenticated users can upload photos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'worker-photos');

-- Allow authenticated users to update their uploads
CREATE POLICY "Authenticated users can update photos"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'worker-photos');

-- Allow public read access
CREATE POLICY "Public can view photos"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'worker-photos');

-- Allow authenticated users to delete
CREATE POLICY "Authenticated users can delete photos"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'worker-photos');
