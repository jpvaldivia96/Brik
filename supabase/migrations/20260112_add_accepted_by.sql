-- Add accepted_by column to track who accepted the invitation
ALTER TABLE user_invitations 
ADD COLUMN IF NOT EXISTS accepted_by UUID REFERENCES auth.users(id);

-- Update the accept_invitation function to record who accepted
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

  -- Mark invitation as accepted and record who accepted
  UPDATE user_invitations
  SET accepted_at = now(),
      accepted_by = auth.uid()
  WHERE id = inv.id;

  RETURN jsonb_build_object(
    'success', true,
    'site_id', inv.site_id,
    'role', inv.role
  );
END;
$$;
