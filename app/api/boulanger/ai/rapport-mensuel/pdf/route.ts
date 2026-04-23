// app/api/boulanger/ai/rapport-mensuel/pdf/route.ts
// ─────────────────────────────────────────────────────────────
// GET → Stream PDF du rapport mensuel (runtime nodejs pour @react-pdf/renderer)
// ─────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getBoulangerSession, canAccess } from '@/lib/auth-boulanger';
import { renderToStream } from '@react-pdf/renderer';
import { createElement } from 'react';
import RapportMensuelPdf from '@/components/boulanger/rapport-mensuel-pdf';

export const runtime = 'nodejs';
export const maxDuration = 60;

function normalizeMoisParam(raw: string | null): string | null {
  if (!raw) return null;
  if (/^\d{4}-\d{2}$/.test(raw))    return `${raw}-01`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw.slice(0, 8) + '01';
  return null;
}

export async function GET(req: NextRequest) {
  const session = await getBoulangerSession(req);
  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  if (!canAccess(session, 'dashboard', 'read')) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
  }

  const admin = getSupabaseAdmin();
  const { boulangerieId } = session;
  const mois = normalizeMoisParam(new URL(req.url).searchParams.get('mois'));
  if (!mois) {
    return NextResponse.json({ error: 'Paramètre mois manquant (?mois=YYYY-MM)' }, { status: 400 });
  }

  const { data: rapport } = await admin
    .from('ai_rapports')
    .select('*')
    .eq('boulangerie_id', boulangerieId)
    .eq('type', 'mensuel')
    .eq('mois_reference', mois)
    .maybeSingle();

  if (!rapport || rapport.statut !== 'genere') {
    return NextResponse.json({ error: 'Rapport indisponible' }, { status: 404 });
  }

  const { data: boul } = await admin
    .from('boulangeries')
    .select('nom, ville, adresse')
    .eq('id', boulangerieId)
    .single();

  const element = createElement(RapportMensuelPdf, {
    rapport: rapport,
    nomBoulangerie: (boul?.nom as string | null) ?? 'Boulangerie',
    ville:          (boul?.ville as string | null) ?? null,
  });

  const stream = await renderToStream(element as React.ReactElement);

  const filename = `rapport-mensuel-${mois.slice(0, 7)}.pdf`;

  return new NextResponse(stream as unknown as ReadableStream, {
    headers: {
      'Content-Type':        'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control':       'no-store',
    },
  });
}
