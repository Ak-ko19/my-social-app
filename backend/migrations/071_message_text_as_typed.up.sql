-- Migration: 071_message_text_as_typed (UP)
-- Purpose: Day 75 -- messages are now kept as typed, like posts and
-- comments. Until now they went through an HTML sanitizer that stored
-- & < > as &amp; &lt; &gt;, which the app then showed as such
-- ("Tom &amp; Jerry"). This turns them back into the characters, in the
-- messages themselves and in the copy a report keeps of a reported one.
-- &amp; goes last, so "&amp;lt;" (someone who typed "&lt;") becomes
-- "&lt;", not "<". Only rows with an entity are touched. Data only: no
-- table, column or index changes.
-- Run it ONCE: a second run would also decode text someone typed as an
-- entity after the first ("&lt;" -> "<"). Messages the old code saves in
-- the minutes between this and the deploy keep the old form (cosmetic).

BEGIN;
UPDATE messages
SET content = replace(replace(replace(content, '&lt;', '<'), '&gt;', '>'), '&amp;', '&')
WHERE content ~ '&(amp|lt|gt);';

UPDATE reports
SET target_snapshot = replace(replace(replace(target_snapshot, '&lt;', '<'), '&gt;', '>'), '&amp;', '&')
WHERE target_type = 'message' AND target_snapshot ~ '&(amp|lt|gt);';
COMMIT;
