-- ===========================================================================
-- Reconcile downtime_events with wells.status.
--
-- Down Wells and the dashboard read downtime_events, but a well's status can
-- also be set from the Wells page dropdown, the in-app importer and
-- scripts/py/load_wells.py. Those paths write wells.status only, so a well
-- could read DOWN while nothing showed up as down anywhere else.
--
-- setWellStatus now opens/resolves an event itself. This file fixes the wells
-- that were already out of step, and is safe to re-run after any bulk import
-- to pick up statuses loaded from a spreadsheet.
-- ===========================================================================

-- 1) every well marked DOWN gets an open event if it hasn't got one.
--    start_at uses updated_at (when the status was last changed) rather than
--    now(), so the "down for" durations stay truthful.
--    est_bopd_loss comes from the well's own oil test rate; wells with no test
--    on file are left null rather than counted as zero loss.
insert into downtime_events
  (well_id, battery_id, reason, start_at, est_bopd_loss)
select w.id,
       w.battery_id,
       'Synced from well status',
       coalesce(w.updated_at, now()),
       w.test_oil_bopd
  from wells w
 where w.status = 'DOWN'
   and not exists (
     select 1 from downtime_events d
      where d.well_id = w.id and d.status = 'OPEN'
   );

-- 2) close out open events for wells that are no longer DOWN.
update downtime_events d
   set status = 'RESOLVED', end_at = now(), updated_at = now()
  from wells w
 where d.well_id = w.id
   and d.status = 'OPEN'
   and w.status <> 'DOWN';
