-- ============================================================================
-- Robust retry of the "Test It" New Calls cleanup. The exact-match delete in
-- 0008 apparently matched nothing (likely surrounding whitespace or letter
-- case in the stored name), so remove it case-insensitively and trimmed.
-- RETURNING surfaces the removed row(s) in the migration logs for confirmation.
-- ============================================================================
delete from new_calls
where lower(btrim(name)) = 'test it'
returning id, name, analysts, year;
