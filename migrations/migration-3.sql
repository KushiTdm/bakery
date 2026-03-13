-- supabase/migrations/20260313_create_commandes.sql
-- Table commandes click & collect

create table if not exists commandes (
  id                uuid primary key default gen_random_uuid(),
  boulangerie_id    uuid not null references boulangeries(id) on delete cascade,
  client_prenom     text not null check (length(client_prenom) between 1 and 50),
  client_email      text not null check (client_email ~* '^[^@]+@[^@]+\.[^@]+$'),
  client_telephone  text,
  heure_retrait     time not null,
  notes             text check (length(notes) <= 500),
  montant_total     numeric(8,2) not null check (montant_total > 0),
  statut            text not null default 'en_attente'
                    check (statut in ('en_attente', 'confirmee', 'prete', 'retiree', 'annulee')),
  lignes            jsonb not null default '[]'::jsonb,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Index pour les requêtes du dashboard baker
create index commandes_boulangerie_date_idx
  on commandes (boulangerie_id, created_at desc);

-- Trigger updated_at
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger commandes_updated_at
  before update on commandes
  for each row execute function set_updated_at();

-- RLS : le baker ne voit que ses propres commandes
alter table commandes enable row level security;

create policy "Baker voit ses commandes"
  on commandes for select
  using (
    boulangerie_id in (
      select id from boulangeries where user_id = auth.uid()
    )
  );

create policy "Baker met à jour le statut"
  on commandes for update
  using (
    boulangerie_id in (
      select id from boulangeries where user_id = auth.uid()
    )
  )
  with check (
    -- Seul le statut est modifiable, pas les données client
    boulangerie_id = boulangerie_id
  );

-- Les insertions passent uniquement par la service role key (API server-side)
-- Pas de policy insert pour les utilisateurs anonymes