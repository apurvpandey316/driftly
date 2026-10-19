-- Driftly test database: TARGET ("Production")
-- Run against an empty database, e.g. driftly_prod.

CREATE TABLE public.users (
  id            bigserial PRIMARY KEY,
  email         text NOT NULL UNIQUE,                -- type mismatch: text vs varchar(255)
  display_name  text,                                -- nullability mismatch
  created_at    timestamptz NOT NULL DEFAULT now(),
  legacy_id     integer                              -- extra column only in target
);

CREATE TABLE public.projects (
  id         bigserial PRIMARY KEY,
  owner_id   bigint NOT NULL,
  name       text NOT NULL,
  archived   boolean NOT NULL DEFAULT false,
  CONSTRAINT projects_owner_id_fkey FOREIGN KEY (owner_id)
    REFERENCES public.users(id) ON DELETE NO ACTION   -- FK action differs: CASCADE vs NO ACTION
);
CREATE INDEX projects_owner_idx ON public.projects (owner_id);  -- equivalent, no difference

CREATE TABLE public.feature_flags (                  -- extra table only in target
  key     text PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT false
);
