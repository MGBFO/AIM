-- ============================================================================
-- One-off data cleanup: remove the "Test It" New Calls test entry that was
-- created while validating the New Calls feature. Same net effect as deleting
-- the task that produced it — the Dashboard total and Mike Gregory's count both
-- subtract this record. No-op on databases where the row doesn't exist.
-- ============================================================================
delete from new_calls
where name = 'Test It' and 'Mike Gregory' = any(analysts);
