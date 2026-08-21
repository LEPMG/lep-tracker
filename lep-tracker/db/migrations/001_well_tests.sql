-- ===========================================================================
-- Migration 001 — well test rates
-- Adds current well-test rates to each well so downtime can auto-estimate the
-- production being lost. Safe to run on your live Supabase database: it only
-- adds columns if they don't already exist and touches no existing data.
-- Paste this whole file into the Supabase SQL Editor and click Run.
-- ===========================================================================

alter table wells add column if not exists test_oil_bopd   double precision;
alter table wells add column if not exists test_water_bwpd double precision;
alter table wells add column if not exists test_gas_mcfd   double precision;
alter table wells add column if not exists test_date       date;
