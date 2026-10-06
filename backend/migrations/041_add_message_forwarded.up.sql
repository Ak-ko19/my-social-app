-- Migration: 041_add_message_forwarded (UP)
-- Purpose: Day 32 -- forwarding a message. A forward is a new message from
-- the person forwarding it, marked so the chat can label it "Forwarded".
-- Who wrote the original is deliberately not stored (like WhatsApp).

BEGIN;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_forwarded BOOLEAN NOT NULL DEFAULT false;
COMMIT;
