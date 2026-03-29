// app/api/boulanger/dashboard-supervision/route.ts
// ─────────────────────────────────────────────────────────────
// Dashboard Supervision — Vue gérant/owner pour le suivi équipe
// Retourne : journée en cours, commandes, équipe, alertes, activité 7j
// ─────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';
import { getBoulangerSession, canAccess } from '@/lib/auth-boulanger';

// ── Types de réponse ──────────────────────────────────────────

interface JourneeData {
  date: string;
  production_saisie: boolean;
  snapshot_10h_fait: boolean;
  snapshot_10h_at: string | null;
  snapshot_14h_fait: boolean;
  snapshot_14h_at: string | null;
  flash_actif: boolean;
  cloturee: boolean;
  ca_estime: number;
  taux_invendu: number | null;
}

interface CommandesData {
  total: number;
  en_attente: number;
  confirmee: number;
  prete: number;
  recuperee: number;
  annulee: number;
}

interface EquipeMembre {
  id: string;
  prenom: string;
  role: 'gerant' | 'employe';
  statut: string;
  last_login_at: string | null;
}

interface Alerte {
  niveau: 'rouge' | 'orange' | 'jaune';
  message: string;
  action: string | null;
}

interface ActiviteJour {
  date: string;
  actif: boolean;
}

interface ActiviteMembre {
  membre_id: string;
  prenom: string;
  jours: ActiviteJour[];
}

interface DashboardSupervisionResponse {
  journee: JourneeData;
  commandes: CommandesData;
  equipe: EquipeMembre[];
  alertes: Alerte[];
  activite_7j: ActiviteMembre[];
}

// ── Helper pour obtenir la date dans le timezone de la boulangerie ───────────

function getTodayInTimezone(timezone: string): string {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(now);
}

function getCurrentHourInTimezone(timezone: string): number {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('sv-SE', {
    timeZone: timezone,
    hour: '2-digit',
    hour12: false,
  });
  return parseInt(formatter.format(now), 10);
}

// ── Handler GET ───────────────────────────────────────────────

export async function GET(req: NextRequest) {
  // 1. Auth
  const session = await getBoulangerSession(req);
  if (!session) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  // 2. Vérification permission dashboard
  if (!canAccess(session, 'dashboard', 'read')) {
    return NextResponse.json({ error: 'Accès refusé' }, { status: 403 });
  }

  const admin = getSupabaseAdmin();
  const boulangerieId = session.boulangerieId;

  try {
    // 3. Récupérer timezone de la boulangerie
    const { data: boulangerie } = await admin
      .from('boulangeries')
      .select('timezone')
      .eq('id', boulangerieId)
      .single();

    const timezone = boulangerie?.timezone || 'Europe/Paris';
    const today = getTodayInTimezone(timezone);
    const currentHour = getCurrentHourInTimezone(timezone);

    // 4. Récupérer la journée du jour
    const { data: journee } = await admin
      .from('journees')
      .select('*')
      .eq('boulangerie_id', boulangerieId)
      .eq('date', today)
      .single();

    // 5. Récupérer les stocks du jour
    const { data: stocks } = await admin
      .from('stocks_journaliers')
      .select('production, snapshot_10h_done, snapshot_14h_done')
      .eq('boulangerie_id', boulangerieId)
      .eq('journee_id', journee?.id || '00000000-0000-0000-0000-000000000000');

    const production_saisie = (stocks?.some(s => s.production > 0)) ?? false;
    const snapshot_10h_fait = (stocks?.some(s => s.snapshot_10h_done)) ?? false;
    const snapshot_14h_fait = (stocks?.some(s => s.snapshot_14h_done)) ?? false;

    // 6. Récupérer timestamps snapshots depuis audit_logs
    // Note: Ces champs seront null si les actions ne sont pas loggées
    let snapshot_10h_at: string | null = null;
    let snapshot_14h_at: string | null = null;

    const { data: auditSnapshots } = await admin
      .from('audit_logs')
      .select('action, created_at')
      .eq('boulangerie_id', boulangerieId)
      .in('action', ['snapshot_10h', 'snapshot_14h', 'validate_snapshot_10h', 'validate_snapshot_14h'])
      .gte('created_at', `${today}T00:00:00`)
      .lte('created_at', `${today}T23:59:59`)
      .order('created_at', { ascending: true });

    if (auditSnapshots) {
      const snapshot10h = auditSnapshots.find(a => 
        a.action === 'snapshot_10h' || a.action === 'validate_snapshot_10h'
      );
      const snapshot14h = auditSnapshots.find(a => 
        a.action === 'snapshot_14h' || a.action === 'validate_snapshot_14h'
      );
      snapshot_10h_at = snapshot10h?.created_at || null;
      snapshot_14h_at = snapshot14h?.created_at || null;
    }

    // 7. Vérifier paniers flash actifs
    const { count: flashCount } = await admin
      .from('paniers_flash')
      .select('*', { count: 'exact', head: true })
      .eq('boulangerie_id', boulangerieId)
      .eq('date', today)
      .eq('actif', true)
      .gt('quantite_restante', 0);

    const flash_actif = (flashCount ?? 0) > 0;

    // 8. Commandes du jour
    const { data: commandes } = await admin
      .from('commandes')
      .select('statut')
      .eq('boulangerie_id', boulangerieId)
      .gte('created_at', `${today}T00:00:00`)
      .lte('created_at', `${today}T23:59:59`);

    const commandesData: CommandesData = {
      total: commandes?.length ?? 0,
      en_attente: commandes?.filter(c => c.statut === 'en_attente').length ?? 0,
      confirmee: commandes?.filter(c => c.statut === 'confirmee').length ?? 0,
      prete: commandes?.filter(c => c.statut === 'prete').length ?? 0,
      recuperee: commandes?.filter(c => c.statut === 'recuperee').length ?? 0,
      annulee: commandes?.filter(c => c.statut === 'annulee').length ?? 0,
    };

    // 9. Équipe
    const { data: employes } = await admin
      .from('employes')
      .select('id, role, statut, invite_email, prenom, last_login_at')
      .eq('boulangerie_id', boulangerieId)
      .order('created_at', { ascending: true });

    const equipe: EquipeMembre[] = (employes ?? []).map(e => ({
      id: e.id,
      prenom: e.prenom || e.invite_email.split('@')[0],
      role: e.role as 'gerant' | 'employe',
      statut: e.statut,
      last_login_at: e.last_login_at,
    }));

    // 10. Calculer les alertes
    const alertes: Alerte[] = [];
    const cloturee = journee?.cloturee ?? false;

    if (!production_saisie && currentHour >= 9.5) {
      alertes.push({
        niveau: 'rouge',
        message: 'Production du matin non saisie',
        action: '/boulanger?tab=matin',
      });
    }

    if (!snapshot_10h_fait && currentHour >= 10.5) {
      alertes.push({
        niveau: 'orange',
        message: 'Snapshot 10h non effectué',
        action: '/boulanger?tab=snapshot',
      });
    }

    if (!snapshot_14h_fait && currentHour >= 14.5) {
      alertes.push({
        niveau: 'orange',
        message: 'Snapshot 14h non effectué',
        action: '/boulanger?tab=snapshot',
      });
    }

    if (!flash_actif && currentHour >= 17.5) {
      alertes.push({
        niveau: 'jaune',
        message: 'Paniers flash non configurés',
        action: '/boulanger?tab=flash',
      });
    }

    if (!cloturee && currentHour >= 20) {
      alertes.push({
        niveau: 'rouge',
        message: 'Journée non clôturée',
        action: '/boulanger?tab=soir',
      });
    }

    if (commandesData.en_attente > 0) {
      alertes.push({
        niveau: 'orange',
        message: `${commandesData.en_attente} commande${commandesData.en_attente > 1 ? 's' : ''} en attente de confirmation`,
        action: '/boulanger?tab=commandes',
      });
    }

    // 11. Activité 7 jours (depuis audit_logs)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString();

    const { data: auditLogs } = await admin
      .from('audit_logs')
      .select('user_id, created_at')
      .eq('boulangerie_id', boulangerieId)
      .gte('created_at', sevenDaysAgoStr);

    // Construire les 7 derniers jours
    const last7Days: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      last7Days.push(d.toISOString().split('T')[0]);
    }

    // Mapper user_id → membre
    const userIdToMembre: Record<string, { id: string; prenom: string }> = {};
    for (const e of employes ?? []) {
      if (e.id) {
        userIdToMembre[e.id] = { id: e.id, prenom: e.prenom || e.invite_email.split('@')[0] };
      }
    }

    // Calculer activité par membre et par jour
    const activiteMap: Record<string, Set<string>> = {};
    if (auditLogs) {
      for (const log of auditLogs) {
        if (log.user_id && !activiteMap[log.user_id]) {
          activiteMap[log.user_id] = new Set();
        }
        if (log.user_id && log.created_at) {
          const jour = log.created_at.split('T')[0];
          activiteMap[log.user_id].add(jour);
        }
      }
    }

    const activite_7j: ActiviteMembre[] = (employes ?? [])
      .filter(e => e.statut === 'actif')
      .map(e => {
        const joursActifs = activiteMap[e.id] || new Set();
        return {
          membre_id: e.id,
          prenom: e.prenom || e.invite_email.split('@')[0],
          jours: last7Days.map(date => ({
            date,
            actif: joursActifs.has(date),
          })),
        };
      });

    // 12. Construire la réponse
    const response: DashboardSupervisionResponse = {
      journee: {
        date: today,
        production_saisie,
        snapshot_10h_fait,
        snapshot_10h_at,
        snapshot_14h_fait,
        snapshot_14h_at,
        flash_actif,
        cloturee,
        ca_estime: journee?.ca_estime ?? 0,
        taux_invendu: cloturee ? (journee?.taux_invendu ?? null) : null,
      },
      commandes: commandesData,
      equipe,
      alertes,
      activite_7j,
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error('[dashboard-supervision] Error:', error);
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    );
  }
}