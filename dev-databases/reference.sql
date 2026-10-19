-- Driftly test database: REFERENCE ("Development")
-- Run against an empty database, e.g. driftly_dev.

CREATE TABLE public.users (
  id            bigserial PRIMARY KEY,
  email         varchar(255) NOT NULL UNIQUE,
  phone_number  varchar(20),                       -- missing in target
  display_name  text NOT NULL,                       -- nullable in target
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX users_email_idx ON public.users (lower(email));  -- missing in target

CREATE TABLE public.projects (
  id         bigserial PRIMARY KEY,
  owner_id   bigint NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name       text NOT NULL,
  archived   boolean NOT NULL DEFAULT false
);
-- Equivalent to the target's index, written differently -> must NOT be reported
CREATE INDEX projects_owner_idx ON public.projects USING btree (owner_id ASC);

CREATE TABLE public.audit_logs (                     -- whole table missing in target
  id         bigserial PRIMARY KEY,
  user_id    bigint REFERENCES public.users(id),
  action     text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
