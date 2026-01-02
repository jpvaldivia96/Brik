-- Migration: Add DELETE policies for people and related tables
-- Run this in Supabase SQL Editor (Database → SQL Editor)

-- 1. Policy for people table
CREATE POLICY "Allow delete for site members" 
ON people 
FOR DELETE 
USING (is_member(site_id));

-- 2. Policy for access_logs table
CREATE POLICY "Allow delete for site members" 
ON access_logs 
FOR DELETE 
USING (is_member(site_id));

-- 3. Policy for workers_profile table
CREATE POLICY "Allow delete" 
ON workers_profile 
FOR DELETE 
USING (EXISTS (
  SELECT 1 FROM people 
  WHERE people.id = workers_profile.person_id 
  AND is_member(people.site_id)
));

-- 4. Policy for visitors_profile table
CREATE POLICY "Allow delete" 
ON visitors_profile 
FOR DELETE 
USING (EXISTS (
  SELECT 1 FROM people 
  WHERE people.id = visitors_profile.person_id 
  AND is_member(people.site_id)
));

-- 5. Policy for favorites table (if needed)
CREATE POLICY "Allow delete" 
ON favorites 
FOR DELETE 
USING (EXISTS (
  SELECT 1 FROM people 
  WHERE people.id = favorites.person_id 
  AND is_member(people.site_id)
));
