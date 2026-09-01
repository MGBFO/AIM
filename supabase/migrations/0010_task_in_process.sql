-- ============================================================================
-- Add an "In Process" task status. The Analyst Bandwidth Edit Task popup now
-- offers open / in_process / completed. Additive and backward-compatible: the
-- enum value is appended, existing rows are untouched, and older code that only
-- reads/writes 'open'/'completed' keeps working.
-- ============================================================================
alter type task_status add value if not exists 'in_process';
