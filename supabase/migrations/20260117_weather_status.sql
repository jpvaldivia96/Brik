-- Add table for weather status (shown in UI next to date/time)
CREATE TABLE IF NOT EXISTS site_weather_status (
  site_id UUID PRIMARY KEY REFERENCES sites(id) ON DELETE CASCADE,
  status TEXT NOT NULL, -- e.g., "🥶 Frío extremo", "💨 Vientos fuertes"
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE site_weather_status ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Site members can view weather" ON site_weather_status;
CREATE POLICY "Site members can view weather" ON site_weather_status
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM site_memberships WHERE site_id = site_weather_status.site_id AND user_id = auth.uid())
  );

-- Index
CREATE INDEX IF NOT EXISTS idx_weather_site ON site_weather_status(site_id);
