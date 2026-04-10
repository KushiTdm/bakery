// app/api/boulanger/ai/today/route.ts
// Retourne la date "aujourd'hui" dans le fuseau horaire de la boulangerie.
// Utilisé par le frontend pour détecter le changement de jour à minuit.

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getTodayInTimezone } from '@/lib/ai-anonymize';
import { getBoulangerSession, unauthorized } from '@/lib/auth-boulanger';

export async function GET(req: NextRequest) {
  const session = await getBoulangerSession(req);
  if (!session) return unauthorized();

  const admin = getSupabaseAdmin();
  const { data: boulangerie } = await admin
    .from('boulangeries')
    .select('id, timezone')
    .eq('id', session.boulangerieId)
    .single();

  if (!boulangerie) {
    return NextResponse.json({ error: 'Boulangerie introuvable' }, { status: 404 });
  }

  const timezone = (boulangerie.timezone as string) ?? 'Europe/Paris';
  const today    = getTodayInTimezone(timezone);

  return NextResponse.json({ today, timezone });
}