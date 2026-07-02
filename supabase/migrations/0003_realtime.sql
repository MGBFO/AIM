-- ============================================================================
-- Realtime. Add the operational tables to the supabase_realtime publication so
-- each module can subscribe and reflect other users' inserts/updates/deletes
-- live. REPLICA IDENTITY FULL so DELETE/UPDATE payloads include old-row data.
-- ============================================================================

alter table trips        replica identity full;
alter table monitoring   replica identity full;
alter table prc_schedule replica identity full;
alter table prc_archive  replica identity full;
alter table prc_config   replica identity full;
alter table tasks        replica identity full;

alter publication supabase_realtime add table trips;
alter publication supabase_realtime add table monitoring;
alter publication supabase_realtime add table prc_schedule;
alter publication supabase_realtime add table prc_archive;
alter publication supabase_realtime add table prc_config;
alter publication supabase_realtime add table tasks;
