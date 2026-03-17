// app/api/boulanger/commandes/route.ts
// GET — Commandes enrichies avec le vrai prénom/téléphone depuis profils_clients
//
// PROBLÈME RÉSOLU : client_prenom et client_telephone dans la table commandes
// peuvent être obsolètes (ex: commandes passées avant la création du profil).
// On enrichit systématiquement depuis profils_clients via une jointure sur l'email.

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase';

async function getBoulangerieId(req: NextRequest): Promise<{
  boulangerieId: string;
  admin: ReturnType<typeof getSupabaseAdmin>;
} | null> {
  const admin = getSupabaseAdmin();
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) return null;

  const { data: boulangerie } = await admin
    .from('boulangeries')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (!boulangerie) return null;
  return { boulangerieId: boulangerie.id, admin };
}

export async function GET(req: NextRequest) {
  try {
    const auth = await getBoulangerieId(req);
    if (!auth) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });

    const { boulangerieId, admin } = auth;
    const { searchParams } = new URL(req.url);

    const date = searchParams.get('date');

    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: 'Format date invalide (YYYY-MM-DD)' }, { status: 400 });
    }

    // 1. Récupère les commandes du jour
    let query = admin
      .from('commandes')
      .select('*')
      .eq('boulangerie_id', boulangerieId)
      .order('created_at', { ascending: false });

    if (date) {
      const dateStart = new Date(`${date}T00:00:00+01:00`).toISOString();
      const dateEnd   = new Date(`${date}T23:59:59+02:00`).toISOString();
      query = query.gte('created_at', dateStart).lte('created_at', dateEnd);
    }

    const { data: commandes, error: commandesError } = await query;

    if (commandesError) {
      console.error('[GET /api/boulanger/commandes]', commandesError);
      return NextResponse.json({ error: 'Erreur chargement commandes' }, { status: 500 });
    }

    if (!commandes || commandes.length === 0) {
      return NextResponse.json({ commandes: [] });
    }

    // 2. Collecte les emails uniques des commandes
    const emails = [...new Set(commandes.map(c => c.client_email).filter(Boolean))];

    // 3. Récupère tous les profils clients correspondants en une seule requête
    //    On utilise auth.admin.listUsers puis filtre par email
    //    pour obtenir les user_id, puis récupère les profils.
    //    Optimisation : on récupère directement via une RPC ou en passant par
    //    une requête SQL qui joint auth.users et profils_clients.
    //
    //    Approche pragmatique : service_role peut lire auth.users directement.
    const emailToProfile: Record<string, { prenom: string; telephone: string | null }> = {};

    // Récupère tous les utilisateurs en une seule passe (max 1000)
    const { data: { users: authUsers } } = await admin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });

    // Filtre sur les emails qui nous intéressent
    const relevantUsers = authUsers.filter(u => u.email && emails.includes(u.email));
    const userIds = relevantUsers.map(u => u.id);

    if (userIds.length > 0) {
      // Récupère tous les profils en une seule requête
      const { data: profils } = await admin
        .from('profils_clients')
        .select('user_id, prenom, telephone')
        .in('user_id', userIds);

      // Construit la map email → profil
      if (profils) {
        profils.forEach(p => {
          const authUser = relevantUsers.find(u => u.id === p.user_id);
          if (authUser?.email) {
            emailToProfile[authUser.email] = {
              prenom:    p.prenom,
              telephone: p.telephone,
            };
          }
        });
      }
    }

    // 4. Enrichit chaque commande avec le profil réel
    //    Le profil DB a toujours priorité sur ce qui est stocké dans la commande.
    const commandesEnrichies = commandes.map(commande => {
      const profil = emailToProfile[commande.client_email];
      return {
        ...commande,
        client_prenom:    profil?.prenom    ?? commande.client_prenom,
        client_telephone: profil?.telephone ?? commande.client_telephone,
      };
    });

    return NextResponse.json({ commandes: commandesEnrichies });

  } catch (err) {
    console.error('[GET /api/boulanger/commandes]', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}