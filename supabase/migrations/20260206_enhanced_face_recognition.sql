-- Migration: Add Enhanced Face Recognition Feature Flag
-- Date: 2026-02-06
-- Purpose: Enable per-site feature flag for improved facial recognition
-- Impact: Default FALSE preserves current behavior for all existing sites

-- Add feature flag column
ALTER TABLE sites 
ADD COLUMN IF NOT EXISTS enhanced_face_recognition BOOLEAN DEFAULT FALSE;

-- Add descriptive comment
COMMENT ON COLUMN sites.enhanced_face_recognition IS 
'Enables enhanced face recognition with better low-light performance using Modern-Face-API. Default FALSE preserves existing behavior.';

-- Ensure all existing sites have the flag set to FALSE (explicit)
UPDATE sites SET enhanced_face_recognition = FALSE WHERE enhanced_face_recognition IS NULL;
