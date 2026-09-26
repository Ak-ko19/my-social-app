-- Migration: 021_add_message_image_type (UP)
-- Purpose: B9 image messages -- step 1 of 2.
--
-- A standalone file on purpose: Postgres can't USE a newly added enum
-- value in the same transaction that adds it, and scripts/run-migration.js
-- runs each file as one implicit transaction. So the value is added here
-- and first used by 022 (the CHECK constraint + image rows).
ALTER TYPE message_type ADD VALUE IF NOT EXISTS 'image';
