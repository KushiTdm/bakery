import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

// Client anon avec le JWT du client (pas service_role)
function getSupabaseClient(token: string) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );
}

const ProfilSchema = z.object({
  prenom:          z.string().min(1).max(50),
  telephone:       z.string().min(8).max(20).optional().nullable(),
  optin_flash:     z.boolean().optional().default(false),
  optin_marketing: z.boolean().optional().default(false),
  rgpd_accepted:   z.boolean().refine(v => v === true, {
    message: 'Vous devez accepter la politique de confidentialité',
  }),
});

// ── GET ───────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ profil: null }, { status: 200 });
  }

  const token = authHeader.slice(7);
  const supabase = getSupabaseClient(token);

  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return NextResponse.json({ profil: null });

  const { data: profil } = await supabase
    .from('profils_clients')
    .select('id, prenom, telephone, optin_flash, optin_marketing, profil_completed, rgpd_accepted_at')
    .eq('user_id', user.id)
    .single();

  return NextResponse.json({ profil: profil ?? null });
}

// ── POST — Upsert ─────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  const token    = authHeader.slice(7);
  const supabase = getSupabaseClient(token);

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Token invalide' }, { status: 401 });
  }

  const body   = await req.json();
  const parsed = ProfilSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Données invalides', details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { rgpd_accepted, ...data } = parsed.data;

  const { data: profil, error: upsertError } = await supabase
    .from('profils_clients')
    .upsert(
      {
        user_id:          user.id,
        prenom:           data.prenom,
        telephone:        data.telephone ?? null,
        optin_flash:      data.optin_flash,
        optin_marketing:  data.optin_marketing,
        rgpd_accepted_at: new Date().toISOString(),
        rgpd_version:     '1.0',
        profil_completed: true,
      },
      { onConflict: 'user_id' }
    )
    .select()
    .single();

  if (upsertError) {
    console.error('[POST /api/client/profil]', upsertError);
    return NextResponse.json({ error: 'Erreur sauvegarde' }, { status: 500 });
  }

  return NextResponse.json({ profil, success: true });
}