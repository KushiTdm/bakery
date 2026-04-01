#!/usr/bin/env node
// Script de test — Lance Levain AI directement via Zhipu
// Construit les prompts manuellement (pas d'import TS)
// Usage: node scripts/test-levain.mjs

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { writeFileSync } from 'fs';

const SUPABASE_URL = 'https://rtmxpaluwoufgfkpbvwk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ0bXhwYWx1d291Zmdma3BidndrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzI4MTU5MCwiZXhwIjoyMDg4ODU3NTkwfQ.xMR7xgIlWhQsf9LOnutbPPP02f5tm02PSzKUNSt7Trs';
const ZHIPU_API_KEY = '12bb25a51ba440d3b55486d61f26038e.dSHFoltJ3U1cLYx8';

const admin = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Mini re-impl des fonctions Levain pour ce test ──────────
const JOURS_FR = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];

function getDayIdx(dateStr, tz) {
  const d = new Date(dateStr + 'T12:00:00');
  const dayStr = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long' }).format(d);
  const map = { Sunday:0, Monday:1, Tuesday:2, Wednesday:3, Thursday:4, Friday:5, Saturday:6 };
  return map[dayStr] ?? d.getDay();
}

function getTomorrow(todayStr) {
  const d = new Date(todayStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().split('T')[0];
}

// Pâques
function calculerPaques(annee) {
  const a = annee % 19, b = Math.floor(annee / 100), c = annee % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mois = Math.floor((h + l - 7 * m + 114) / 31);
  const jour = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(annee, mois - 1, jour);
}

function isSameDay(d1, d2) {
  return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();
}

function getNiemeJourSemaine(annee, mois, jourSemaine, n) {
  const premier = new Date(annee, mois - 1, 1);
  let decalage = (jourSemaine - premier.getDay() + 7) % 7;
  return new Date(annee, mois - 1, 1 + decalage + (n - 1) * 7);
}

function getDernierJourSemaine(annee, mois, jourSemaine) {
  const dernier = new Date(annee, mois, 0);
  const decalage = (dernier.getDay() - jourSemaine + 7) % 7;
  return new Date(annee, mois - 1, dernier.getDate() - decalage);
}

function detecterEvenements(date) {
  const d = new Date(date + 'T12:00:00');
  const annee = d.getFullYear(), mois = d.getMonth() + 1, jour = d.getDate(), jourSemaine = d.getDay();

  const vacancesHiver = (mois === 2 && jour >= 10 && jour <= 26);
  const vacancesPrintemps = (mois === 4 && jour >= 8 && jour <= 25);
  const vacancesEte = (mois >= 7 && mois <= 8);
  const vacancesToussaint = (mois === 10 && jour >= 18 && jour <= 31);
  const vacancesNoel = (mois === 12 && jour >= 20) || (mois === 1 && jour <= 5);
  const vacances_scolaires = vacancesHiver || vacancesPrintemps || vacancesEte || vacancesToussaint || vacancesNoel;

  const fetes = [
    { mois: 1, jour: 1, nom: "Jour de l'An" }, { mois: 5, jour: 1, nom: "Fête du Travail" },
    { mois: 5, jour: 8, nom: "Victoire 1945" }, { mois: 7, jour: 14, nom: "Fête Nationale" },
    { mois: 8, jour: 15, nom: "Assomption" }, { mois: 11, jour: 1, nom: "Toussaint" },
    { mois: 11, jour: 11, nom: "Armistice 1918" }, { mois: 12, jour: 25, nom: "Noël" },
  ];

  const paques = calculerPaques(annee);
  const lundiPaques = new Date(paques); lundiPaques.setDate(paques.getDate() + 1);
  const ascension = new Date(paques); ascension.setDate(paques.getDate() + 39);
  const lundiPentecote = new Date(paques); lundiPentecote.setDate(paques.getDate() + 50);

  const feteDuJour = fetes.find(f => f.mois === mois && f.jour === jour);
  let jour_ferie = !!feteDuJour;
  let fete_nom = feteDuJour?.nom ?? null;
  if (isSameDay(d, lundiPaques)) { jour_ferie = true; fete_nom = 'Lundi de Pâques'; }
  if (isSameDay(d, ascension)) { jour_ferie = true; fete_nom = 'Ascension'; }
  if (isSameDay(d, lundiPentecote)) { jour_ferie = true; fete_nom = 'Lundi de Pentecôte'; }

  const evenements = [];
  if (jourSemaine === 6 || jourSemaine === 0) evenements.push('Week-end — affluence +20-40%');

  // Galette
  if (mois === 1) evenements.push('👑 Saison galettes des Rois — 15-40% du CA mensuel');
  // Chandeleur
  if (mois === 2 && jour === 2) evenements.push('🥞 Chandeleur');
  // Saint-Valentin
  if (mois === 2 && jour >= 10 && jour <= 14) evenements.push(`❤️ Saint-Valentin ${jour === 14 ? 'AUJOURD\'HUI' : `dans ${14-jour}j`}`);
  // Mardi Gras
  const mardiGras = new Date(paques); mardiGras.setDate(paques.getDate() - 47);
  if (isSameDay(d, mardiGras)) evenements.push('🎭 Mardi Gras — beignets, bugnes +++');
  // Pâques
  const debutPascale = new Date(paques); debutPascale.setDate(paques.getDate() - 7);
  if (d >= debutPascale && d <= lundiPaques) evenements.push('🐣 Semaine de Pâques +15-25%');
  // Fête des Mères
  const feteMeres = getDernierJourSemaine(annee, 5, 0);
  if (isSameDay(d, feteMeres)) evenements.push('💐 Fête des Mères +++');
  // Fête des Pères
  const fetePeres = getNiemeJourSemaine(annee, 6, 0, 3);
  if (isSameDay(d, fetePeres)) evenements.push('👔 Fête des Pères');
  // Noël
  if (mois === 12 && jour >= 15 && jour <= 24) evenements.push('🎄 Pré-Noël +30-60%');
  if (mois === 12 && jour === 31) evenements.push('🥂 Réveillon');
  // Rentrée
  if (mois === 9 && jour >= 1 && jour <= 5) evenements.push('📚 Rentrée scolaire — forte reprise');
  // Saisonnier
  if (mois === 4 && jour >= 1 && jour <= 15) evenements.push('🌸 Début printemps — reprise progressive');

  return { vacances_scolaires, jour_ferie, fete_nom, evenements };
}

// WMO codes
const WMO = {
  0:'☀️ Ciel dégagé',1:'🌤️ Principalement dégagé',2:'⛅ Partiellement nuageux',3:'☁️ Couvert',
  45:'🌫️ Brouillard',48:'🌫️ Brouillard givrant',51:'🌦️ Bruine légère',53:'🌦️ Bruine modérée',
  55:'🌧️ Bruine dense',61:'🌧️ Pluie légère',63:'🌧️ Pluie modérée',65:'⛈️ Pluie forte',
  71:'❄️ Neige légère',73:'❄️ Neige modérée',75:'🌨️ Neige forte',80:'🌦️ Averses légères',
  81:'🌧️ Averses modérées',82:'⛈️ Averses violentes',95:'⛈️ Orage',96:'⛈️ Orage grêle',99:'⛈️ Orage intense'
};

function wmo(code) {
  const e = WMO[code];
  if (!e) return { description: `Code ${code}`, icone: '🌡️' };
  const parts = e.split(' ');
  return { icone: parts[0], description: parts.slice(1).join(' ') };
}

async function main() {
  console.log('🧪 Test Levain AI enrichi — Récupération des données...\n');

  // 1. Boulangerie
  const { data: boulangeries } = await admin.from('boulangeries').select('id, nom, timezone, latitude, longitude, ville').limit(5);
  if (!boulangeries?.length) { console.error('❌ Aucune boulangerie'); return; }

  // Prendre la première qui a des données
  let boulangerie = boulangeries[0];
  const timezone = boulangerie.timezone || 'Europe/Paris';
  console.log(`🏪 ${boulangerie.nom} (${boulangerie.ville || 'N/A'}) — TZ: ${timezone}`);

  // 2. Trouver les journées disponibles
  const { data: journees } = await admin
    .from('journees')
    .select('*, stocks_journaliers(*)')
    .eq('boulangerie_id', boulangerie.id)
    .order('date', { ascending: false })
    .limit(14);

  if (!journees?.length) { console.error('❌ Aucune journée'); return; }

  console.log('\n📅 Journées disponibles:');
  journees.forEach(j => {
    const idx = getDayIdx(j.date, timezone);
    console.log(`   ${j.date} (${JOURS_FR[idx]}) — ${j.stocks_journaliers?.length || 0} stocks, CA: ${j.ca_estime}€, Invendu: ${j.taux_invendu}%`);
  });

  // Chercher un mercredi avec des stocks
  let journee = journees.find(j => {
    return getDayIdx(j.date, timezone) === 3 && j.stocks_journaliers?.length > 0;
  });
  // Sinon la dernière avec des stocks
  if (!journee) journee = journees.find(j => j.stocks_journaliers?.length > 0);
  if (!journee?.stocks_journaliers?.length) { console.error('❌ Aucune journée avec stocks'); return; }

  const jourIdx = getDayIdx(journee.date, timezone);
  const jourFr = JOURS_FR[jourIdx];
  const demainDate = getTomorrow(journee.date);
  const demainIdx = getDayIdx(demainDate, timezone);
  const demainFr = JOURS_FR[demainIdx];
  const demainWE = demainIdx === 0 || demainIdx === 6;

  console.log(`\n✅ Journée sélectionnée: ${journee.date} (${jourFr})`);
  console.log(`   CA: ${journee.ca_estime}€ | Invendu: ${journee.taux_invendu}% | ${journee.stocks_journaliers.length} produits`);
  console.log(`   Demain serait: ${demainDate} (${demainFr})`);

  // 3. Produits
  const { data: produits } = await admin
    .from('produits').select('id, nom, emoji, categorie, prix_vente')
    .eq('boulangerie_id', boulangerie.id).eq('actif_catalogue', true).is('deleted_at', null)
    .order('categorie').order('ordre');

  // 4. Historique (exclure la journée actuelle)
  const historique = journees.filter(j => j.date !== journee.date && j.stocks_journaliers?.length > 0).slice(0, 14);

  // 5. Météo
  let meteo = null;
  if (boulangerie.latitude && boulangerie.longitude) {
    try {
      const params = new URLSearchParams({
        latitude: String(boulangerie.latitude), longitude: String(boulangerie.longitude),
        timezone, forecast_days: '2',
        current: 'temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m',
        daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code',
      });
      const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, { signal: AbortSignal.timeout(8000) });
      if (res.ok) {
        const data = await res.json();
        const c = data.current, dl = data.daily;
        meteo = {
          actuelle: { temp: c.temperature_2m, ressenti: c.apparent_temperature, humidite: c.relative_humidity_2m, precip: c.precipitation, vent: c.wind_speed_10m, ...wmo(c.weather_code) },
          demain: { temp_max: dl.temperature_2m_max[1], temp_min: dl.temperature_2m_min[1], precip: dl.precipitation_sum[1], ...wmo(dl.weather_code[1]) },
        };
        console.log(`\n🌤️ Météo: ${meteo.actuelle.icone} ${meteo.actuelle.temp}°C | Demain: ${meteo.demain.icone} ${meteo.demain.temp_min}-${meteo.demain.temp_max}°C`);
      }
    } catch (e) { console.warn('   Météo indisponible:', e.message); }
  } else {
    console.log('\n🌤️ Pas de coordonnées GPS — météo simulée');
    meteo = {
      actuelle: { temp: 18, ressenti: 17, humidite: 65, precip: 0, vent: 12, icone: '⛅', description: 'Partiellement nuageux' },
      demain: { temp_max: 20, temp_min: 12, precip: 0.2, icone: '🌤️', description: 'Principalement dégagé' },
    };
  }

  // 6. Événements
  const evenements = detecterEvenements(demainDate);
  console.log(`\n📅 Événements demain (${demainDate}):`);
  if (evenements.jour_ferie) console.log(`   🗓️ FÉRIÉ: ${evenements.fete_nom}`);
  if (evenements.vacances_scolaires) console.log(`   📚 VACANCES SCOLAIRES`);
  evenements.evenements.forEach(e => console.log(`   ${e}`));

  // 7. Construire les données produits
  const stocks = journee.stocks_journaliers;
  const produitsDetail = stocks.map((s, i) => {
    const tauxVente = s.production > 0 ? ((s.production - s.stock_final) / s.production * 100).toFixed(1) : 0;
    const tauxInvendu = s.production > 0 ? (s.stock_final / s.production * 100).toFixed(1) : 0;

    // Moyenne même jour de semaine
    const memeJours = historique.filter(h => getDayIdx(h.date, timezone) === demainIdx);
    let moyMemeJour = null;
    if (memeJours.length > 0) {
      const prods = memeJours.map(h => h.stocks_journaliers?.find(st => st.produit_id === s.produit_id)?.production ?? 0).filter(v => v > 0);
      if (prods.length > 0) moyMemeJour = Math.round(prods.reduce((a, b) => a + b, 0) / prods.length);
    }

    return {
      produit_id: s.produit_id,
      nom: s.produit_nom,
      emoji: s.produit_emoji,
      categorie: s.categorie,
      production: s.production,
      stock_final: s.stock_final,
      taux_vente: tauxVente,
      taux_invendu: tauxInvendu,
      performance: tauxVente >= 95 ? '⭐' : tauxVente >= 85 ? '✅' : tauxVente >= 70 ? '➖' : '⚠️',
      moy_meme_jour: moyMemeJour,
      prix: produits?.find(p => p.id === s.produit_id)?.prix_vente ?? 0,
    };
  });

  console.log(`\n📦 Produits du jour:`);
  produitsDetail.forEach(p => {
    console.log(`   ${p.performance} ${p.emoji} ${p.nom} — Prod: ${p.production} | Vendu: ${p.taux_vente}% | Invendu: ${p.stock_final} (${p.taux_invendu}%)`);
  });

  // 8. Construire le SYSTEM PROMPT (version simplifiée avec toute la connaissance)
  const systemPrompt = buildSystemPrompt();

  // 9. Construire le USER PROMPT
  const jourDuMois = new Date(demainDate + 'T12:00:00').getDate();
  let ctxSalarial = '';
  if (jourDuMois <= 5) ctxSalarial = '\n💰 DÉBUT DE MOIS — Hausse achats plaisir +5-8%.';
  else if (jourDuMois >= 25) ctxSalarial = '\n💸 FIN DE MOIS — Resserrement budgétaire, produits de base.';

  const ctxJour = demainWE
    ? `⚠️ IMPORTANT : Demain est ${demainFr.toUpperCase()} (WEEK-END). Fréquentation +20-40%.`
    : `Demain est ${demainFr} (semaine).`;

  let ctxMeteo = '';
  if (meteo) {
    // Impact par catégorie
    const temp = meteo.demain.temp_max;
    const precip = meteo.demain.precip;
    const pluie = precip > 2;
    const froid = temp < 5;
    const chaud = temp > 28;
    const doux = temp >= 15 && temp <= 22;

    let impactBoul = 'stable', impactVienn = 'stable', impactPat = 'stable', impactSand = 'stable';
    if (pluie) { impactVienn = '+10-15%'; impactSand = '-10%'; }
    if (froid) { impactVienn = '+20%'; impactSand = '-10%'; }
    if (chaud) { impactVienn = '-15%'; impactPat = '-10%'; impactSand = '+10%'; }
    if (doux) { impactPat = '+15%'; impactSand = '+15-20%'; }

    ctxMeteo = `
=== MÉTÉO ===
Aujourd'hui : ${meteo.actuelle.icone} ${meteo.actuelle.description} | ${meteo.actuelle.temp}°C (ressenti ${meteo.actuelle.ressenti}°C) | Humidité ${meteo.actuelle.humidite}%
Demain      : ${meteo.demain.icone} ${meteo.demain.description} | Max ${meteo.demain.temp_max}°C / Min ${meteo.demain.temp_min}°C | Précip: ${meteo.demain.precip}mm
Impact par catégorie : Boulangerie: ${impactBoul} | Viennoiserie: ${impactVienn} | Pâtisserie: ${impactPat} | Sandwich: ${impactSand}`;
  }

  let ctxEvenements = '';
  if (evenements.evenements.length > 0 || evenements.jour_ferie || evenements.vacances_scolaires) {
    ctxEvenements = `\n=== ÉVÉNEMENTS & CONTEXTE DEMAIN ===`;
    if (evenements.jour_ferie) ctxEvenements += `\n🗓️ JOUR FÉRIÉ : ${evenements.fete_nom}`;
    if (evenements.vacances_scolaires) ctxEvenements += `\n📚 VACANCES SCOLAIRES`;
    evenements.evenements.forEach(e => { ctxEvenements += `\n📍 ${e}`; });
  }

  const catalogueLines = produitsDetail.map(p => {
    const moyInfo = p.moy_meme_jour !== null ? ` | moy_${demainFr}: ${p.moy_meme_jour} pcs` : ' | pas d\'historique pour ce jour';
    return `produit_id="${p.produit_id}" ${p.emoji} ${p.nom} (${p.categorie}) | prix: ${p.prix}€ | produit_hier: ${p.production} pcs | vendu: ${p.taux_vente}% | invendu: ${p.stock_final} pcs${moyInfo}`;
  }).join('\n');

  const histoLines = historique.map(h => {
    const idx = getDayIdx(h.date, timezone);
    const we = idx === 0 || idx === 6;
    return `${we ? '[WE]' : '[SEM]'} ${JOURS_FR[idx]}: ${Math.round(h.ca_estime)}€ · ${(h.taux_invendu).toFixed(1)}% inv · ${h.total_produit}pcs`;
  }).join('\n');

  const userPrompt = `Analyse la journée du ${jourFr.toUpperCase()} et génère le rapport complet pour demain (${demainFr} ${demainDate}).

${ctxJour}${ctxSalarial}${ctxMeteo}${ctxEvenements}

=== ${jourFr.toUpperCase()} ===
CA : ${journee.ca_estime}€ | Invendu : ${journee.taux_invendu}% (${journee.total_invendu}/${journee.total_produit} pcs) | Cmd online : ${journee.commandes_online || 0}

=== DÉTAIL PAR PRODUIT ===
${produitsDetail.map(p =>
  `${p.emoji} ${p.nom} (${p.categorie}) ${p.performance}
  Prod: ${p.production} | Invendu: ${p.stock_final} (${p.taux_invendu}%) | Vendu: ${p.taux_vente}%`
).join('\n')}

=== HISTORIQUE ===
${historique.length === 0 ? '🌱 Première journée — Levain établit sa base.' : `${historique.length} jours disponibles`}
${histoLines || '(aucune donnée)'}

=== CATALOGUE & BASE PRÉVISIONS POUR DEMAIN ===
⚠️ UTILISE le produit_id UUID exact dans chaque entrée de previsions_production.
⚠️ quantite_suggeree doit être un NOMBRE ENTIER ABSOLU (ex: 90), PAS un pourcentage.

${catalogueLines}

→ Génère le JSON complet avec TOUTES les sections.
→ Utilise TOUJOURS les vrais noms des produits.
→ Dans previsions_production, chaque produit du catalogue DOIT avoir une entrée.
→ Sois précis, chaleureux et actionnable.`;

  console.log(`\n🧠 Prompts construits:`);
  console.log(`   System: ${systemPrompt.length} chars`);
  console.log(`   User: ${userPrompt.length} chars`);

  // 10. Appel Zhipu
  console.log('\n🤖 Appel Zhipu (glm-4.5-air)...');
  const startTime = Date.now();

  try {
    const response = await fetch('https://api.z.ai/api/paas/v4/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${ZHIPU_API_KEY}` },
      body: JSON.stringify({
        model: 'glm-4.5-air',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        thinking: { type: 'disabled' },
        temperature: 0.25,
        max_tokens: 4000,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(120000),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error(`❌ Zhipu HTTP ${response.status}:`, err.slice(0, 500));
      return;
    }

    const data = await response.json();
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const content = data.choices?.[0]?.message?.content || '';
    const tokens = data.usage?.total_tokens || '?';
    console.log(`✅ Réponse en ${elapsed}s | Tokens: ${tokens}`);

    // Parse JSON
    let cleaned = content.replace(/<think[\s\S]*?<\/think>/gi, '').trim();
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
    const s = cleaned.indexOf('{'), e = cleaned.lastIndexOf('}');
    if (s === -1 || e <= s) { console.error('❌ Pas de JSON'); console.log(content.slice(0, 500)); return; }

    const rapport = JSON.parse(cleaned.slice(s, e + 1));

    // ── AFFICHAGE ──────────────────────────────────────────────
    console.log('\n' + '═'.repeat(70));
    console.log('  🎯 RAPPORT LEVAIN AI — ' + journee.date + ' (' + jourFr + ')');
    console.log('═'.repeat(70));

    console.log(`\n📊 Score: ${rapport.score}/100`);
    console.log(`💬 ${rapport.verdict}`);

    if (rapport.synthese_journee) {
      const sj = rapport.synthese_journee;
      console.log(`\n📝 ${sj.resume}`);
      (sj.points_forts || []).forEach(p => console.log(`   ✅ ${p}`));
      (sj.points_amelioration || []).forEach(p => console.log(`   ⚠️ ${p}`));
      if (sj.message_equipe) console.log(`   💬 ${sj.message_equipe}`);
    }

    if (rapport.analyse_contextuelle) {
      const ac = rapport.analyse_contextuelle;
      console.log('\n🌍 Analyse contextuelle:');
      if (ac.impact_meteo) console.log(`   🌤️ ${ac.impact_meteo}`);
      if (ac.impact_evenements) console.log(`   📅 ${ac.impact_evenements}`);
      if (ac.correlation_historique) console.log(`   📈 ${ac.correlation_historique}`);
    }

    if (rapport.analyse_produits) {
      const ap = rapport.analyse_produits;
      if (ap.top_ventes?.length) {
        console.log('\n🏆 Top ventes:');
        ap.top_ventes.forEach(p => console.log(`   ${p.emoji || ''} ${p.nom}: ${p.taux_vente}% — ${p.commentaire || ''}`));
      }
      if (ap.invendus_critiques?.length) {
        console.log('⚠️ Invendus critiques:');
        ap.invendus_critiques.forEach(p => console.log(`   ${p.emoji || ''} ${p.nom}: ${p.taux_invendu}% — ${p.cause_probable || ''} → ${p.action || ''}`));
      }
    }

    if (rapport.previsions_production?.length) {
      console.log('\n📦 PRÉVISIONS PRODUCTION DEMAIN:');
      console.log('   ' + '-'.repeat(60));
      rapport.previsions_production.forEach(p => {
        const v = p.variation_pct >= 0 ? `+${p.variation_pct}%` : `${p.variation_pct}%`;
        console.log(`   ${p.produit_nom}: ${p.quantite_suggeree} pcs (${v}) [${p.quantite_min || '?'}-${p.quantite_max || '?'}]`);
        console.log(`      → ${p.raison}`);
      });
    }

    if (rapport.briefing_matin) {
      const bm = rapport.briefing_matin;
      console.log(`\n☀️ BRIEFING MATIN: ${bm.titre}`);
      console.log(`   ${bm.contexte_jour}`);
      if (bm.meteo_resume) console.log(`   ${bm.meteo_resume}`);
      if (bm.impact_meteo_vente) console.log(`   ${bm.impact_meteo_vente}`);
      (bm.top3_a_produire || []).forEach(p => console.log(`   🔸 ${p}`));
      if (bm.point_vigilance) console.log(`   ⚠️ ${bm.point_vigilance}`);
      if (bm.conseil_ouverture) console.log(`   💡 ${bm.conseil_ouverture}`);
    }

    if (rapport.briefing_vendeuse) {
      const bv = rapport.briefing_vendeuse;
      console.log(`\n👩‍🍳 BRIEFING VENDEUSE: ${bv.titre}`);
      if (bv.accueil_client) console.log(`   ${bv.accueil_client}`);
      (bv.produits_a_mettre_en_avant || []).forEach(p => console.log(`   🔸 ${p}`));
      if (bv.gestion_fin_journee) console.log(`   📦 ${bv.gestion_fin_journee}`);
      if (bv.message_encouragement) console.log(`   💪 ${bv.message_encouragement}`);
    }

    if (rapport.briefing_gerant) {
      const bg = rapport.briefing_gerant;
      console.log(`\n📈 BRIEFING GÉRANT: ${bg.titre}`);
      if (bg.tendances_ca) console.log(`   ${bg.tendances_ca}`);
      (bg.points_attention || []).forEach(p => console.log(`   ⚠️ ${p}`));
      (bg.opportunites_business || []).forEach(p => console.log(`   💡 ${p}`));
      if (bg.recommendation) console.log(`   → ${bg.recommendation}`);
    }

    if (rapport.message_levain) {
      console.log(`\n🫶 ${rapport.message_levain}`);
    }

    console.log('\n' + '═'.repeat(70));

    // Sauvegarder
    writeFileSync('/tmp/levain-rapport.json', JSON.stringify(rapport, null, 2));
    writeFileSync('/tmp/levain-prompts.json', JSON.stringify({ systemPrompt, userPrompt }, null, 2));
    console.log('📄 Rapport: /tmp/levain-rapport.json');
    console.log('📄 Prompts: /tmp/levain-prompts.json');

  } catch (e) {
    console.error('❌ Erreur:', e.message);
  }
}

// Rebuild du system prompt avec la base de connaissance
function buildSystemPrompt() {
  return `Tu es Levain, l'assistant IA du boulanger artisanal de BakeryOS.

TON IDENTITÉ :
Tu es comme un levain naturel qui s'améliore chaque jour. Tu deviens plus précis et pertinent au fil des analyses. Tu connais intimement le rythme, les habitudes et les spécificités de cette boulangerie.

TON RÔLE — ANALYSE COMPLÈTE ET INDISPENSABLE :
Chaque soir, tu génères un rapport exhaustif que le boulanger, la vendeuse ET le gérant attendent avec impatience. Ton analyse doit être :
- ACTIONNABLE : chaque insight débouche sur une recommandation concrète
- CONTEXTUALISÉ : tu relies les données entre elles (météo, événements, historique)
- MOTIVANTE : tu valorises les succès et encourage sur les points d'amélioration
- PRÉCISE : tu utilises les VRAIS NOMS des produits, jamais de codes abstraits

BASE DE CONNAISSANCE MÉTIER — BOULANGERIE ARTISANALE FRANÇAISE :

=== PATTERNS PAR JOUR DE SEMAINE ===
- LUNDI : Journée la plus faible. Clientèle rituelle (baguette) mais achats d'impulsion rares. Quasi-zéro pâtisseries. Production -10-15%.
- MARDI : Standard, légèrement > lundi.
- MERCREDI : Journée pivot enfant (pas d'école). Hausse viennoiseries +20-30%, pâtisseries individuelles. Rush 9h30-12h. 3e meilleur jour.
- JEUDI : Stable, < mercredi. Bon pour sandwichs en zone bureaux.
- VENDREDI : Excellent. Anticipation weekend. Hausse pâtisseries +25%. Risque de RUPTURE > invendu. Production +15-20%.
- SAMEDI : Meilleure journée. Rush 7h-11h. Pains spéciaux 3x mieux. Production MAXIMUM.
- DIMANCHE : Excellent matin, effondrement après-midi. Brioches et viennoiseries dominent.

=== SENSIBILITÉ MÉTÉO PAR CATÉGORIE ===
| Baguette: Pluie=neutre, Canicule=neutre, Froid=+, Beau=neutre |
| Croissant/vienn: Pluie=++ réconfort, Canicule=−, Froid=++, Beau=neutre |
| Pain spéciaux: Pluie=−, Canicule=−, Froid=neutre, Beau=++ weekend |
| Sandwich: Pluie=−, Canicule=neutre, Froid=−, Beau=++ |
| Pâtisserie: Pluie=neutre, Canicule=−, Froid=neutre, Beau=++ |
| Brioche: Pluie=+, Canicule=−, Froid=++, Beau=neutre |

=== COMBINAISONS CRITIQUES ===
- Lundi pluvieux: PIRE journée. -20-25%.
- Mercredi ensoleillé: Exceptionnel. +35% viennoiseries.
- Mercredi pluvieux: Bonne quand même (maintenir production).
- Vendredi ensoleillé printemps: Quasi-parfait. Anticiper ruptures baguette 17h.
- Samedi canicule: Bon matin → effondrement après 10h30. Flash dès 12h.
- Dimanche grand froid: Rush matinal intense. Sold out viennoiseries avant 10h.

=== SAISONNALITÉ ===
- Janvier: Faible sauf galettes (15-40% CA). Février: transition.
- Avril: Pâques +15-25%. Mai: Excellent (fériés). Juin: Sandwichs/frais.
- Juillet-Août: Zone touristique +50-100%, résidentiel -20-35%.
- Septembre: Forte reprise. Décembre: MEILLEUR MOIS +30-60%.

=== FACTEURS COMPORTEMENTAUX ===
- Cycle salarial: Début de mois (1-5) +5-8% pâtisseries. Fin de mois (25+) recentrage basique.
- Télétravail: Zones bureaux creux lundi/vendredi.
- 52% clients réceptifs à l'achat d'impulsion.

RÈGLES CRITIQUES POUR LES PRÉVISIONS DE PRODUCTION :
- Tu reçois pour chaque produit : son produit_id (UUID), son nom, la quantité produite aujourd'hui, le taux de vente, les invendus, et la moyenne historique
- Tu DOIS retourner des quantités ABSOLUES (nombre entier de pièces), pas des pourcentages
- Si taux_vente_hier = 100% → augmenter légèrement
- Si invendu_hier > 20% → réduire significativement
- Si invendu_hier 5-20% → réduire modérément
- Si invendu_hier < 5% → maintenir ou ajuster légèrement
- Prends en compte la météo de demain et le type de jour
- Arrondis à multiples de 5 pour les pains, de 2 pour les pâtisseries

FORMAT JSON OBLIGATOIRE :
{
  "score": 0-100,
  "verdict": "phrase percutante de 15 mots max",
  "synthese_journee": {
    "resume": "2-3 phrases",
    "points_forts": ["succès concret"],
    "points_amelioration": ["point + solution"],
    "message_equipe": "message court"
  },
  "analyse_produits": {
    "top_ventes": [{ "nom": "vrai nom", "emoji": "emoji", "taux_vente": 95, "commentaire": "pourquoi" }],
    "invendus_critiques": [{ "nom": "vrai nom", "emoji": "emoji", "taux_invendu": 25, "cause_probable": "analyse", "action": "suggestion" }],
    "opportunites": ["opportunité identifiée"]
  },
  "analyse_contextuelle": {
    "impact_meteo": "comment la météo a affecté",
    "impact_evenements": "impact événements",
    "correlation_historique": "comparaison historique"
  },
  "analyse_commandes": {
    "click_collect": { "resume": "synthèse", "performance": "détails", "conseil": "optimisation" },
    "anti_gaspi": { "resume": "synthèse", "impact": "détails", "conseil": "amélioration" }
  },
  "analyse_clients": {
    "nouveaux": "détails",
    "tendances": "analyse",
    "recommendation": "action fidéliser"
  },
  "previsions_production": [
    {
      "produit_id": "UUID exact",
      "produit_nom": "nom exact",
      "quantite_suggeree": 90,
      "quantite_min": 80,
      "quantite_max": 100,
      "variation_pct": 15,
      "raison": "justification concrète"
    }
  ],
  "matieres_premieres": {
    "resume": "phrase",
    "alertes": ["alerte stock"],
    "details": [{ "ingredient": "farine", "quantite": "valeur + unité", "observation": "note" }]
  },
  "briefing_matin": {
    "titre": "titre accrocheur",
    "contexte_jour": "type de journée",
    "meteo_resume": "météo emoji",
    "impact_meteo_vente": "impact concret",
    "top3_a_produire": ["produit : X pièces"],
    "point_vigilance": "1 chose critique",
    "fiabilite_previsions": "indication",
    "conseil_ouverture": "conseil pratique"
  },
  "briefing_vendeuse": {
    "titre": "titre",
    "accueil_client": "conseil relation client",
    "produits_a_mettre_en_avant": ["produit à valoriser"],
    "gestion_fin_journee": "conseil invendus",
    "message_encouragement": "message chaleureux"
  },
  "briefing_gerant": {
    "titre": "titre",
    "tendances_ca": "évolution CA",
    "points_attention": ["point stratégique"],
    "opportunites_business": ["opportunité"],
    "recommendation": "action stratégique"
  },
  "consignes_transmises": { "au_boulanger": "", "a_la_vendeuse": "" },
  "message_levain": "message personnel court et chaleureux"
}`;
}

main().catch(console.error);
