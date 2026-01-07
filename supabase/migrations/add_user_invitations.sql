-- User Invitations Table
-- Allows supervisors to invite users to their site

CREATE TABLE IF NOT EXISTS user_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role role_enum NOT NULL DEFAULT 'guard',
  invited_by UUID REFERENCES auth.users(id),
  token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  accepted_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast lookup by token
CREATE INDEX IF NOT EXISTS idx_invitations_token ON user_invitations(token);

-- Index for listing invitations by site
CREATE INDEX IF NOT EXISTS idx_invitations_site ON user_invitations(site_id);

-- RLS Policies
ALTER TABLE user_invitations ENABLE ROW LEVEL SECURITY;

-- Supervisors can view invitations for their site
CREATE POLICY "Supervisors can view site invitations"
  ON user_invitations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM site_memberships
      WHERE site_memberships.site_id = user_invitations.site_id
        AND site_memberships.user_id = auth.uid()
        AND site_memberships.role = 'supervisor'
    )
  );

-- Supervisors can create invitations for their site
CREATE POLICY "Supervisors can create invitations"
  ON user_invitations
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM site_memberships
      WHERE site_memberships.site_id = user_invitations.site_id
        AND site_memberships.user_id = auth.uid()
        AND site_memberships.role = 'supervisor'
    )
  );

-- Supervisors can delete invitations for their site
CREATE POLICY "Supervisors can delete invitations"
  ON user_invitations
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM site_memberships
      WHERE site_memberships.site_id = user_invitations.site_id
        AND site_memberships.user_id = auth.uid()
        AND site_memberships.role = 'supervisor'
    )
  );

-- Anyone can view invitation by token (for accepting)
CREATE POLICY "Anyone can view invitation by token"
  ON user_invitations
  FOR SELECT
  USING (true);

-- Function to accept invitation
CREATE OR REPLACE FUNCTION accept_invitation(invitation_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  inv RECORD;
BEGIN
  -- Find valid invitation
  SELECT * INTO inv
  FROM user_invitations
  WHERE token = invitation_token
    AND accepted_at IS NULL
    AND expires_at > now();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invitación inválida o expirada');
  END IF;

  -- Create site membership
  INSERT INTO site_memberships (site_id, user_id, role)
  VALUES (inv.site_id, auth.uid(), inv.role)
  ON CONFLICT (site_id, user_id) DO NOTHING;

  -- Mark invitation as accepted
  UPDATE user_invitations
  SET accepted_at = now()
  WHERE id = inv.id;

  RETURN jsonb_build_object(
    'success', true,
    'site_id', inv.site_id,
    'role', inv.role
  );
END;
$$;
