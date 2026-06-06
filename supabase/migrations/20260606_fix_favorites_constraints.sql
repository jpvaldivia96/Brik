-- Fix favorites table: drop old unique constraint that blocks per-user favorites,
-- clean orphan records, add blocked uniqueness, and add missing UPDATE policy.

-- 1. Drop old constraint that prevents multiple users from favoriting the same person
ALTER TABLE public.favorites 
  DROP CONSTRAINT IF EXISTS favorites_site_id_person_id_key;

-- 2. Clean orphan favorites (old global favorites with no user_id that aren't blocked)
DELETE FROM public.favorites 
  WHERE user_id IS NULL AND is_blocked = false;

-- 3. Ensure a person can only be blocked once per site
CREATE UNIQUE INDEX IF NOT EXISTS idx_favorites_unique_blocked 
  ON public.favorites(site_id, person_id) WHERE is_blocked = true;

-- 4. Add missing UPDATE policy (needed for block/unblock operations)
CREATE POLICY "Members can update favorites"
  ON public.favorites FOR UPDATE
  TO authenticated
  USING (public.is_member(site_id))
  WITH CHECK (public.is_member(site_id));
