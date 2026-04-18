-- =============================================================================
-- SAUVE MIE — Table waitlist (inscriptions bêta landing page)
-- =============================================================================

create table if not exists public.waitlist (
  id              uuid        primary key default gen_random_uuid(),
  nom_boulangerie text        not null,
  ville           text        not null,
  email_contact   text        not null unique,
  created_at      timestamptz not null default now()
);

-- RLS désactivé : accès uniquement via service key côté serveur (API route)
alter table public.waitlist disable row level security;
