-- Add Telegram columns to notification_settings
ALTER TABLE notification_settings
  ADD COLUMN IF NOT EXISTS telegram_bot_token TEXT,
  ADD COLUMN IF NOT EXISTS telegram_chat_id TEXT;

-- Add comment
COMMENT ON COLUMN notification_settings.telegram_bot_token IS 'Token del bot de Telegram (from @BotFather)';
COMMENT ON COLUMN notification_settings.telegram_chat_id IS 'Chat ID de Telegram (usuario o grupo)';
