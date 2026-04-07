// app/api/boulanger/clients/[email]/debloquer/route.ts
// ─────────────────────────────────────────────────────────────
// POST — débloque un client pénalisé (owner/gérant uniquement)
// Reset nb_non_recupere = 0, bloque = false, log audit
// ─────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getBoulangerSession, canAccess } from '@/lib/auth-boulanger';

const DebloquerSchema = z.object({
  note: z.string().max(500).optional().default(''),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ email: string }> }
) {
  const session = await getBoulangerSession(req);
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

  // Owner ou gérant avec commandes:write
  if (!canAccess(session, 'commandes', 'write')) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
  }

  const { email: rawEmail } = await params;
  const email = decodeURIComponent(rawEmail ?? '').toLowerCase().trim();
  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'Email invalide' }, { status: 400 });
  }

  let body: unknown;
  try { body = await req.json(); }
  catch { body = {}; }

  const parsed = DebloquerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Données invalides' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  try {
    // Vérifier que le client existe dans les pénalités
    const { data: penalite } = await admin
      .from('client_penalites')
      .select('id, bloque')
      .eq('boulangerie_id', session.boulangerieId)
      .eq('client_email', email)
      .single();

    if (!penalite) {
      return NextResponse.json({ error: 'Client non trouvé dans les pénalités' }, { status: 404 });
    }

    // Débloquer : reset compteur + marquer débloqué
    const { error: updateErr } = await admin
      .from('client_penalites')
      .update({
        nb_non_recupere: 0,
        bloque:          false,
        debloque_par_id: session.userId,
        debloque_le:     new Date().toISOString(),
        note_deblocage:  parsed.data.note || null,
      })
      .eq('id', penalite.id);

    if (updateErr) {
      console.error('[POST debloquer]', updateErr);
      return NextResponse.json({ error: 'Erreur lors du déblocage' }, { status: 500 });
    }

    // Audit log (non-bloquant)
    admin.from('audit_logs').insert({
      boulangerie_id: session.boulangerieId,
      user_id:        session.userId,
      action:         'client_debloque',
      details:        { client_email: email, note: parsed.data.note },
    }).then(() => {}, () => {});

    return NextResponse.json({ success: true, email });

  } catch (err) {
    console.error('[POST debloquer]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
