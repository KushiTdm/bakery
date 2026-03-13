// app/api/boulanger/airtable/route.ts
// Proxy serveur pour toutes les requêtes Airtable.
// Avant : parametres.tsx appelait Airtable directement depuis le navigateur
//         → clé API visible dans DevTools / Network tab.
// Après : le client n'envoie jamais la clé. Elle reste côté serveur.

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// ── Auth helper ───────────────────────────────────────────────────────────────

async function getAuthenticatedBoulangerie(req: NextRequest) {
  const cookieStore = cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!, // service_role pour decrypt_text
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {}, // lecture seule ici
      },
    }
  )

  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return { supabase, user: null, boulangerie: null }

  // Récupère la boulangerie + les clés chiffrées
  const { data: boulangerie } = await supabase
    .from('boulangeries')
    .select('id, airtable_api_key, airtable_base_id, airtable_api_key_enc, airtable_base_id_enc')
    .eq('user_id', user.id)
    .single()

  return { supabase, user, boulangerie }
}

// Déchiffre une clé stockée en base (via la fonction SQL decrypt_text)
async function decryptKey(
  supabase: ReturnType<typeof createServerClient>,
  encryptedValue: string | null,
  plaintextFallback: string | null
): Promise<string | null> {
  if (plaintextFallback) return plaintextFallback // migration progressive
  if (!encryptedValue) return null

  const secret = process.env.AIRTABLE_ENCRYPTION_SECRET
  if (!secret) return null

  const { data } = await supabase.rpc('decrypt_text', {
    ciphertext: encryptedValue,
    secret,
  })
  return data ?? null
}

// ── GET /api/boulanger/airtable?table=Produits&fields=Nom,Prix ────────────────
// Récupère des enregistrements depuis une table Airtable.

export async function GET(req: NextRequest) {
  const { supabase, user, boulangerie } = await getAuthenticatedBoulangerie(req)

  if (!user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }
  if (!boulangerie) {
    return NextResponse.json({ error: 'Boulangerie introuvable' }, { status: 404 })
  }

  const apiKey = await decryptKey(supabase, boulangerie.airtable_api_key_enc, boulangerie.airtable_api_key)
  const baseId = await decryptKey(supabase, boulangerie.airtable_base_id_enc, boulangerie.airtable_base_id)

  if (!apiKey || !baseId) {
    return NextResponse.json(
      { error: 'Clés Airtable non configurées. Rendez-vous dans Paramètres.' },
      { status: 422 }
    )
  }

  const { searchParams } = new URL(req.url)
  const table  = searchParams.get('table')
  const fields = searchParams.get('fields')  // ex: "Nom,Prix,Catégorie"
  const filterFormula = searchParams.get('filter') // ex: "{Actif}=1"
  const maxRecords    = searchParams.get('max') ?? '100'

  if (!table) {
    return NextResponse.json({ error: 'Paramètre "table" requis' }, { status: 400 })
  }

  // Construit l'URL Airtable
  const airtableUrl = new URL(
    `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`
  )
  if (fields) {
    fields.split(',').forEach(f => airtableUrl.searchParams.append('fields[]', f.trim()))
  }
  if (filterFormula) airtableUrl.searchParams.set('filterByFormula', filterFormula)
  airtableUrl.searchParams.set('maxRecords', maxRecords)

  try {
    const airtableRes = await fetch(airtableUrl.toString(), {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      // Cache 60s côté serveur pour éviter de martelar Airtable
      next: { revalidate: 60 },
    })

    if (!airtableRes.ok) {
      const err = await airtableRes.json()
      return NextResponse.json(
        { error: err?.error?.message ?? 'Erreur Airtable' },
        { status: airtableRes.status }
      )
    }

    const data = await airtableRes.json()
    return NextResponse.json(data)

  } catch {
    return NextResponse.json({ error: 'Impossible de joindre Airtable' }, { status: 502 })
  }
}

// ── POST /api/boulanger/airtable ─────────────────────────────────────────────
// Crée ou met à jour un enregistrement.
// Body attendu : { table: string, fields: Record<string, unknown>, recordId?: string }

export async function POST(req: NextRequest) {
  const { supabase, user, boulangerie } = await getAuthenticatedBoulangerie(req)

  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  if (!boulangerie) return NextResponse.json({ error: 'Boulangerie introuvable' }, { status: 404 })

  const apiKey = await decryptKey(supabase, boulangerie.airtable_api_key_enc, boulangerie.airtable_api_key)
  const baseId = await decryptKey(supabase, boulangerie.airtable_base_id_enc, boulangerie.airtable_base_id)

  if (!apiKey || !baseId) {
    return NextResponse.json({ error: 'Clés Airtable non configurées' }, { status: 422 })
  }

  const body = await req.json()
  const { table, fields, recordId } = body

  if (!table || !fields) {
    return NextResponse.json({ error: 'Champs "table" et "fields" requis' }, { status: 400 })
  }

  // PATCH si recordId fourni, POST sinon
  const method = recordId ? 'PATCH' : 'POST'
  const urlPath = recordId
    ? `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}/${recordId}`
    : `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}`

  try {
    const airtableRes = await fetch(urlPath, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fields }),
    })

    const data = await airtableRes.json()

    if (!airtableRes.ok) {
      return NextResponse.json(
        { error: data?.error?.message ?? 'Erreur Airtable' },
        { status: airtableRes.status }
      )
    }

    return NextResponse.json(data)

  } catch {
    return NextResponse.json({ error: 'Impossible de joindre Airtable' }, { status: 502 })
  }
}

// ── PATCH /api/boulanger/airtable/test ───────────────────────────────────────
// Teste la validité des clés (utilisé dans parametres.tsx au lieu du fetch direct).
// Body : { apiKey: string, baseId: string }

export async function PATCH(req: NextRequest) {
  const { user } = await getAuthenticatedBoulangerie(req)
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { apiKey, baseId } = await req.json()

  if (!apiKey || !baseId) {
    return NextResponse.json({ error: 'apiKey et baseId requis' }, { status: 400 })
  }

  try {
    const testRes = await fetch(
      `https://api.airtable.com/v0/${baseId}?maxRecords=1`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
      }
    )

    if (testRes.status === 401) {
      return NextResponse.json({ valid: false, error: 'Clé API invalide' })
    }
    if (testRes.status === 404) {
      return NextResponse.json({ valid: false, error: 'Base introuvable (baseId incorrect)' })
    }

    return NextResponse.json({ valid: testRes.ok })

  } catch {
    return NextResponse.json({ valid: false, error: 'Impossible de joindre Airtable' })
  }
}