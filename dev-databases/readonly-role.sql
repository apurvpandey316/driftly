-- Least-privilege user for Driftly. Run on EACH inspected database as an admin.
-- Driftly only reads catalog metadata (pg_catalog), never row data,
-- so no SELECT on tables is granted.
CREATE ROLE driftly_reader LOGIN PASSWORD 'change-me';
DO $$ BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO driftly_reader', current_database());
END $$;
GRANT USAGE ON SCHEMA public TO driftly_reader;
