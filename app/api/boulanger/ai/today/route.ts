// app/api/boulanger/ai/today/route.ts
// Retourne la date "aujourd'hui" dans le fuseau horaire de la boulangerie.
// Utilisé par le frontend pour détecter le changement de jour à minuit.

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getTodayInTimezone } from '@/lib/ai-anonymize';

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  const { data: { user }, error } = await admin.auth.getUser(authHeader.slice(7));
  if (error || !user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  const { data: boulangerie } = await admin
    .from('boulangeries')
    .select('id, timezone')
    .eq('user_id', user.id)
    .single();

  if (!boulangerie) {
    return NextResponse.json({ error: 'Boulangerie introuvable' }, { status: 404 });
  }

  const timezone = (boulangerie.timezone as string) ?? 'Europe/Paris';
  const today    = getTodayInTimezone(timezone);

  return NextResponse.json({ today, timezone });
}