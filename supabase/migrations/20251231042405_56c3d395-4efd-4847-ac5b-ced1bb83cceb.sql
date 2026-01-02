-- Allow the trigger to insert site_settings (it runs as SECURITY DEFINER so should work)
-- But let's also make sure the function has proper permissions

-- Drop and recreate the trigger function with proper settings
CREATE OR REPLACE FUNCTION public.create_site_settings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.site_settings (site_id)
  VALUES (NEW.id);
  RETURN NEW;
END;
$$;