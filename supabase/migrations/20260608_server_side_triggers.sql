-- ─── Database Webhook: Trigger alerts on access_log changes ──────────────────
-- Run this in Supabase Dashboard → SQL Editor

-- 1. Ensure pg_net extension is enabled (for HTTP calls from Postgres)
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Create the trigger function that calls our edge function
CREATE OR REPLACE FUNCTION public.notify_access_log_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    payload jsonb;
BEGIN
    -- Build payload based on operation type
    IF TG_OP = 'INSERT' THEN
        payload := jsonb_build_object(
            'type', 'INSERT',
            'table', TG_TABLE_NAME,
            'record', row_to_json(NEW)::jsonb,
            'old_record', null
        );
    ELSIF TG_OP = 'UPDATE' THEN
        -- Only trigger on meaningful updates (exit_at changed)
        IF OLD.exit_at IS NOT DISTINCT FROM NEW.exit_at 
           AND OLD.voided_at IS NOT DISTINCT FROM NEW.voided_at THEN
            RETURN NEW; -- Skip non-relevant updates
        END IF;
        
        payload := jsonb_build_object(
            'type', 'UPDATE',
            'table', TG_TABLE_NAME,
            'record', row_to_json(NEW)::jsonb,
            'old_record', row_to_json(OLD)::jsonb
        );
    END IF;

    -- Call the edge function asynchronously (non-blocking)
    PERFORM net.http_post(
        url := 'https://xtemforvpgqnalhmekgj.supabase.co/functions/v1/on-access-log',
        headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh0ZW1mb3J2cGdxbmFsaG1la2dqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc0NDQyNTAsImV4cCI6MjA4MzAyMDI1MH0.iiFb17p_lXSF0q3UQFXbAVsfUjfvRXgc1SA0km2CYBY'
        ),
        body := payload
    );

    RETURN COALESCE(NEW, OLD);
END;
$$;

-- 3. Drop existing trigger if any (safe re-run)
DROP TRIGGER IF EXISTS on_access_log_change ON public.access_logs;

-- 4. Create the trigger on access_logs table
CREATE TRIGGER on_access_log_change
    AFTER INSERT OR UPDATE
    ON public.access_logs
    FOR EACH ROW
    EXECUTE FUNCTION public.notify_access_log_change();

-- Done! Now every INSERT (entry) and UPDATE (exit) on access_logs
-- will automatically call the on-access-log edge function,
-- which runs all alert triggers server-side.
