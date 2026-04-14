// app/api/boulanger/defis/resolve/route.ts
// ─────────────────────────────────────────────────────────────
// POST → Résout les défis actifs du jour à la clôture soir
//   - Compare chaque défi aux données réelles (journee + stocks)
//   - Met à jour statut (reussi/echoue) + valeur_actuelle
//   - Attribue XP + met à jour streak + badges
// ─────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getBoulangerSession, canAccess } from '@/lib/auth-boulanger';
import { levelFromXP, computeNewBadges } from '@/lib/gamification';

export async function POST(req: NextRequest) {
  try {
    const session = await getBoulangerSession(req);
    if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    if (!canAccess(session, 'dashboard', 'write')) {
      return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
    }

    const admin = getSupabaseAdmin();
    const { boulangerieId } = session;

    // Date from body or today
    const body = await req.json().catch(() => ({}));
    const date = body.date || new Date().toISOString().split('T')[0];

    // 1. Get today's closed journee
    const { data: journee } = await admin
      .from('journees')
      .select('id, ca_estime, taux_invendu, commandes_online, cloturee')
      .eq('boulangerie_id', boulangerieId)
      .eq('date', date)
      .single();

    if (!journee || !journee.cloturee) {
      return NextResponse.json({ error: 'Journée non clôturée' }, { status: 400 });
    }

    // 2. Get stocks for product-level challenges
    const { data: stocks } = await admin
      .from('stocks_journaliers')
      .select('produit_id, production, stock_final, prix_vente')
      .eq('journee_id', journee.id);

    const stockMap = new Map(
      (stocks ?? []).map(s => [s.produit_id, s])
    );

    // 3. Get active defis for today
    const { data: defis } = await admin
      .from('defis')
      .select('*')
      .eq('boulangerie_id', boulangerieId)
      .eq('date_defi', date)
      .eq('statut', 'actif');

    if (!defis || defis.length === 0) {
      return NextResponse.json({ resolved: 0, xpEarned: 0 });
    }

    // 4. Resolve each defi
    let xpEarned = 0;
    const updates: { id: string; statut: string; valeur_actuelle: number; resolved_at: string }[] = [];

    for (const defi of defis) {
      let actualValue: number | null = null;

      // Determine actual value based on metric
      switch (defi.metric_cible) {
        case 'ca_estime':
          actualValue = journee.ca_estime ?? 0;
          break;
        case 'taux_invendu':
          actualValue = journee.taux_invendu ?? 0;
          break;
        case 'taux_invendu_produit': {
          if (defi.produit_id) {
            const stock = stockMap.get(defi.produit_id);
            if (stock && stock.production > 0) {
              actualValue = (stock.stock_final / stock.production) * 100;
            } else {
              actualValue = 0;
            }
          }
          break;
        }
        case 'stock_final': {
          if (defi.produit_id) {
            const stock = stockMap.get(defi.produit_id);
            actualValue = stock?.stock_final ?? 0;
          }
          break;
        }
        case 'commandes_online':
          actualValue = journee.commandes_online ?? 0;
          break;
        case 'paniers_flash_vendus': {
          // Count sold flash baskets for today
          const { count } = await admin
            .from('paniers_flash')
            .select('*', { count: 'exact', head: true })
            .eq('boulangerie_id', boulangerieId)
            .eq('date_panier', date)
            .eq('quantite_restante', 0);
          actualValue = count ?? 0;
          break;
        }
        default:
          actualValue = null;
      }

      if (actualValue === null) {
        updates.push({
          id: defi.id,
          statut: 'expire',
          valeur_actuelle: 0,
          resolved_at: new Date().toISOString(),
        });
        continue;
      }

      // Compare
      let success = false;
      const target = Number(defi.valeur_cible);
      switch (defi.comparaison) {
        case 'gte': success = actualValue >= target; break;
        case 'lte': success = actualValue <= target; break;
        case 'gt':  success = actualValue > target;  break;
        case 'lt':  success = actualValue < target;  break;
        case 'eq':  success = actualValue === target; break;
      }

      if (success) xpEarned += defi.xp_reward;

      updates.push({
        id: defi.id,
        statut: success ? 'reussi' : 'echoue',
        valeur_actuelle: Math.round(actualValue * 100) / 100,
        resolved_at: new Date().toISOString(),
      });
    }

    // 5. Batch update defis
    for (const u of updates) {
      await admin
        .from('defis')
        .update({
          statut: u.statut,
          valeur_actuelle: u.valeur_actuelle,
          resolved_at: u.resolved_at,
        })
        .eq('id', u.id);
    }

    // 6. Update gamification profile
    let { data: profil } = await admin
      .from('gamification_profil')
      .select('*')
      .eq('boulangerie_id', boulangerieId)
      .single();

    if (!profil) {
      const { data: newProfil } = await admin
        .from('gamification_profil')
        .insert({ boulangerie_id: boulangerieId })
        .select()
        .single();
      profil = newProfil;
    }

    if (profil) {
      const newXP = profil.xp_total + xpEarned;
      const newNiveau = levelFromXP(newXP);

      // Streak calculation
      let newStreak = profil.streak_actuel;
      const lastClose = profil.derniere_cloture;
      const today = new Date(date);
      if (lastClose) {
        const lastDate = new Date(lastClose);
        const diffDays = Math.floor(
          (today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)
        );
        if (diffDays === 1) {
          newStreak += 1;
        } else if (diffDays > 1) {
          newStreak = 1;
        }
        // diffDays === 0 means same day, keep streak
      } else {
        newStreak = 1;
      }

      const newStreakMax = Math.max(profil.streak_max, newStreak);

      // Check new badges
      const newBadges = computeNewBadges(
        { niveau: newNiveau, streak_max: newStreakMax, xp_total: newXP },
        profil.badges ?? []
      );
      const allBadges = [...(profil.badges ?? []), ...newBadges];

      await admin
        .from('gamification_profil')
        .update({
          xp_total: newXP,
          niveau: newNiveau,
          streak_actuel: newStreak,
          streak_max: newStreakMax,
          derniere_cloture: date,
          badges: allBadges,
        })
        .eq('boulangerie_id', boulangerieId);

      return NextResponse.json({
        resolved: updates.length,
        xpEarned,
        newBadges,
        streak: newStreak,
        niveau: newNiveau,
        xpTotal: newXP,
      });
    }

    return NextResponse.json({ resolved: updates.length, xpEarned });
  } catch (err) {
    console.error('[defis/resolve] unexpected error', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
