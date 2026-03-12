// app/api/test-supabase/route.ts
// ─────────────────────────────────────────────────────────────
// Route de TEST uniquement — à supprimer avant la production
// Accès : GET /api/test-supabase
// ─────────────────────────────────────────────────────────────
import { NextResponse } from 'next/server'

export async function GET() {
  const results: Record<string, unknown> = {}

  // ── 1. Variables d'environnement présentes ? ───────────────
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const service = process.env.SUPABASE_SERVICE_KEY

  results.env = {
    NEXT_PUBLIC_SUPABASE_URL: url ? `✅ ${url.slice(0, 30)}...` : '❌ MANQUANTE',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: anon ? `✅ ${anon.slice(0, 20)}...` : '❌ MANQUANTE',
    SUPABASE_SERVICE_KEY: service ? `✅ ${service.slice(0, 20)}...` : '❌ MANQUANTE',
  }

  if (!url || !anon) {
    return NextResponse.json({
      status: 'error',
      message: 'Variables Supabase manquantes dans .env.local',
      ...results,
    }, { status: 500 })
  }

  // ── 2. Test connexion basique (anon key) ───────────────────
  try {
    const { createClient } = await import('@supabase/supabase-js')
    const supabase = createClient(url, anon)

    // Ping simple : lister les boulangeries (RLS → retourne 0 ligne sans auth, mais la connexion fonctionne)
    const { data, error, status } = await supabase
      .from('boulangeries')
      .select('id, nom, slug, plan')
      .limit(10)

    results.connexion_anon = {
      status: error ? '❌ Erreur' : '✅ OK',
      http_status: status,
      error: error?.message ?? null,
      lignes_retournees: data?.length ?? 0,
      note: 'RLS actif → 0 ligne normal sans authentification',
    }
  } catch (e: unknown) {
    results.connexion_anon = {
      status: '❌ Exception',
      error: e instanceof Error ? e.message : String(e),
    }
  }

  // ── 3. Test avec service key (bypass RLS) ──────────────────
  if (service) {
    try {
      const { createClient } = await import('@supabase/supabase-js')
      const supabaseAdmin = createClient(url, service)

      // Récupère toutes les boulangeries
      const { data: boulangeries, error: errB } = await supabaseAdmin
        .from('boulangeries')
        .select('id, nom, slug, plan, actif')

      // Récupère les journées avec stats
      const { data: journees, error: errJ } = await supabaseAdmin
        .from('journees')
        .select('id, date, commandes_online, ca_estime, taux_invendu, cloturee')
        .order('date', { ascending: false })
        .limit(5)

      // Récupère les stocks de la journée en cours
      const today = new Date().toISOString().split('T')[0]
      const { data: stocks, error: errS } = await supabaseAdmin
        .from('stocks_journaliers')
        .select(`
          produit_nom, produit_emoji, categorie,
          production, snapshot_10h, snapshot_14h, stock_final,
          snapshot_10h_done, snapshot_14h_done
        `)
        .eq('boulangerie_id', '00000000-0000-0000-0000-000000000002')
        .order('categorie')

      results.service_key = {
        status: '✅ OK (bypass RLS)',
        boulangeries: errB ? `❌ ${errB.message}` : boulangeries,
        journees_recentes: errJ ? `❌ ${errJ.message}` : journees,
        stocks_count: errS ? `❌ ${errS.message}` : `✅ ${stocks?.length ?? 0} produits en base`,
        stocks_apercu: stocks?.slice(0, 3).map(s => ({
          produit: `${s.produit_emoji} ${s.produit_nom}`,
          production: s.production,
          snapshot_10h: s.snapshot_10h_done ? s.snapshot_10h : 'non fait',
          snapshot_14h: s.snapshot_14h_done ? s.snapshot_14h : 'non fait',
          stock_final: s.stock_final,
        })),
        date_test: today,
      }
    } catch (e: unknown) {
      results.service_key = {
        status: '❌ Exception',
        error: e instanceof Error ? e.message : String(e),
      }
    }
  } else {
    results.service_key = {
      status: '⚠️ Skipped',
      note: 'SUPABASE_SERVICE_KEY non définie',
    }
  }

  // ── 4. Test auth : login avec le compte de démo ───────────
  try {
    const { createClient } = await import('@supabase/supabase-js')
    const supabase = createClient(url, anon)

    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: 'contact@neuraweb.tech',
      password: 'Demo1234!',
    })

    if (authError) {
      results.auth_demo = {
        status: '❌ Login échoué',
        error: authError.message,
        note: 'As-tu exécuté supabase-seed.sql ? L\'utilisateur demo doit exister.',
      }
    } else {
      const userId = authData.user?.id
      const token = authData.session?.access_token

      // Avec le token, récupère sa boulangerie (RLS respecté)
      const supabaseAuth = createClient(url, anon, {
        global: { headers: { Authorization: `Bearer ${token}` } }
      })
      const { data: boulangerieData } = await supabaseAuth
        .from('boulangeries')
        .select('nom, slug, plan')
        .single()

      results.auth_demo = {
        status: '✅ Login réussi',
        user_id: userId,
        email: authData.user?.email,
        boulangerie: boulangerieData ?? 'Aucune boulangerie trouvée pour cet utilisateur',
      }

      // Déconnexion propre
      await supabase.auth.signOut()
    }
  } catch (e: unknown) {
    results.auth_demo = {
      status: '❌ Exception',
      error: e instanceof Error ? e.message : String(e),
    }
  }

  // ── Résumé ─────────────────────────────────────────────────
  const allOk = [
    results.connexion_anon,
    results.service_key,
    results.auth_demo,
  ].every((r: unknown) => {
    if (typeof r === 'object' && r !== null && 'status' in r) {
      return String((r as Record<string, unknown>).status).startsWith('✅')
    }
    return false
  })

  return NextResponse.json({
    résumé: allOk ? '🎉 Tout fonctionne !' : '⚠️ Voir les détails ci-dessous',
    timestamp: new Date().toISOString(),
    ...results,
  }, { status: 200 })
}