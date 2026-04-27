-- Migration 0008: per-message reactions on agent <-> resident chats
--
-- Stored as a jsonb array on agent_messages so the chat list endpoint
-- doesn't need a join. Each entry: { emoji, by, byName, at }.

ALTER TABLE "agent_messages"
  ADD COLUMN IF NOT EXISTS "reactions" jsonb DEFAULT '[]'::jsonb;
