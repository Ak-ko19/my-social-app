-- Migration: 071_message_text_as_typed (DOWN)
-- Nothing to undo: 071 changes no schema, and the old code shows message
-- text either way (it only ever displayed it; turning "<" back into "&lt;"
-- would just bring the bug back). Kept so every migration has a down.

BEGIN;
SELECT 1;
COMMIT;
