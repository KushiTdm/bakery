#!/usr/bin/env node
// Test Levain AI — L'Artisan Doré, mardi 31 mars 2026
// Boulangerie ID: 00000000-0000-0000-0000-000000000002
// Timezone: America/Bogota

import { createClient } from '@supabase/supabase-js';
import { writeFileSync } from 'fs';

const SUPABASE_URL = 'https://rtmxpaluwoufgfkpbvwk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ0bXhwYWx1d291Zmdma3BidndrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzI4MTU5MCwiZXhwIjoyMDg4ODU3NTkwfQ.xMR7xgIlWhQsf9LOnutbPPP02f5tm02PSzKUNSt7Trs';
const ZHIPU_API_KEY = '12bb25a51ba440d3b55486d61f26038e.dSHFoltJ3U1cLYx8';
const BOULANGERIE_ID = '00000000-0000-0000-0000-000000000002';
const TARGET_DATE = '2026-03-31'; // mardi
const TIMEZONE = 'America/Bogota';

const admin = createClient(SUPABASE_URL, SUPABASE_KEY);
const JOURS_FR = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];

function getDayIdx(dateStr, tz) {
  const d = new Date(dateStr + 'T12:00:00');
  const dayStr = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long' }).format(d);
  return { Sunday:0,Monday:1,Tuesday:2,Wednesday:3,Thursday:4,Friday:5,Saturday:6 }[dayStr] ?? d.getDay();
}

function getTomorrow(dateStr) {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().split('T')[0];
}

// Pâques
function calculerPaques(annee) {
  const a=annee%19,b=Math.floor(annee/100),c=annee%100,d=Math.floor(b/4),e=b%4;
  const f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),h=(19*a+b-d-g+15)%30;
  const i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7;
  const m=Math.floor((a+11*h+22*l)/451),mois=Math.floor((h+l-7*m+114)/31);
  return new Date(annee, mois-1, ((h+l-7*m+114)%31)+1);
}
function isSameDay(a,b) { return a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate(); }
function getNieme(annee,mois,js,n) { const p=new Date(annee,mois-1,1); return new Date(annee,mois-1,1+((js-p.getDay()+7)%7)+(n-1)*7); }
function getDernier(annee,mois,js) { const d=new Date(annee,mois,0); return new Date(annee,mois-1,d.getDate()-((d.getDay()-js+7)%7)); }

function detecterEvenements(date) {
  const d = new Date(date+'T12:00:00'), annee=d.getFullYear(), mois=d.getMonth()+1, jour=d.getDate(), js=d.getDay();
  const vacH=(mois===2&&jour>=10&&jour<=26), vacP=(mois===4&&jour>=8&&jour<=25);
  const vacE=(mois>=7&&mois<=8), vacT=(mois===10&&jour>=18), vacN=(mois===12&&jour>=20)||(mois===1&&jour<=5);
  const vac=vacH||vacP||vacE||vacT||vacN;

  const feries=[{m:1,j:1,n:"Jour de l'An"},{m:5,j:1,n:"Fête du Travail"},{m:5,j:8,n:"Victoire 1945"},
    {m:7,j:14,n:"Fête Nationale"},{m:8,j:15,n:"Assomption"},{m:11,j:1,n:"Toussaint"},
    {m:11,j:11,n:"Armistice"},{m:12,j:25,n:"Noël"}];
  const paques=calculerPaques(annee);
  const lPaques=new Date(paques);lPaques.setDate(paques.getDate()+1);
  const ascension=new Date(paques);ascension.setDate(paques.getDate()+39);
  const lPentecote=new Date(paques);lPentecote.setDate(paques.getDate()+50);

  const fete=feries.find(f=>f.m===mois&&f.j===jour);
  let jf=!!fete, fn=fete?.n??null;
  if(isSameDay(d,lPaques)){jf=true;fn='Lundi de Pâques';}
  if(isSameDay(d,ascension)){jf=true;fn='Ascension';}
  if(isSameDay(d,lPentecote)){jf=true;fn='Lundi de Pentecôte';}

  // Pont
  const dem=new Date(d);dem.setDate(d.getDate()+1);
  const hier=new Date(d);hier.setDate(d.getDate()-1);
  const estVeille=feries.some(f=>dem.getMonth()+1===f.m&&dem.getDate()===f.j)||isSameDay(dem,lPaques)||isSameDay(dem,ascension)||isSameDay(dem,lPentecote);
  const estLendemain=feries.some(f=>hier.getMonth()+1===f.m&&hier.getDate()===f.j)||isSameDay(hier,lPaques)||isSameDay(hier,ascension)||isSameDay(hier,lPentecote);

  const evts=[];
  if(js===6||js===0) evts.push('Week-end — affluence +20-40%');
  if(!jf&&(estVeille||estLendemain)) evts.push('⚡ Pont probable — hausse +20-35%');
  if(mois===1) evts.push('👑 Saison galettes des Rois');
  if(mois===2&&jour===2) evts.push('🥞 Chandeleur');
  if(mois===2&&jour>=10&&jour<=14) evts.push(`❤️ Saint-Valentin ${jour===14?'AUJOURD\'HUI':'dans '+(14-jour)+'j'}`);
  const mg=new Date(paques);mg.setDate(paques.getDate()-47);
  if(isSameDay(d,mg)) evts.push('🎭 Mardi Gras — beignets +++');
  const dpascale=new Date(paques);dpascale.setDate(paques.getDate()-7);
  if(d>=dpascale&&d<=lPaques) evts.push('🐣 Semaine de Pâques +15-25%');
  if(isSameDay(d,getDernier(annee,5,0))) evts.push('💐 Fête des Mères +++');
  if(isSameDay(d,getNieme(annee,6,0,3))) evts.push('👔 Fête des Pères');
  if(mois===12&&jour>=15&&jour<=24) evts.push('🎄 Pré-Noël +30-60%');
  if(mois===12&&jour===31) evts.push('🥂 Réveillon');
  if(mois===9&&jour>=1&&jour<=5) evts.push('📚 Rentrée — forte reprise');
  if(mois===3) evts.push('🌸 Mars — reprise progressive, espoir du printemps');
  if(mois===4&&jour>=1&&jour<=15) evts.push('🌸 Début printemps');

  return { vac, jf, fn, evts };
}

const WMO={0:'☀️ Ciel dégagé',1:'🌤️ Principalement dégagé',2:'⛅ Partiellement nuageux',3:'☁️ Couvert',45:'🌫️ Brouillard',51:'🌦️ Bruine légère',53:'🌦️ Bruine modérée',55:'🌧️ Bruine dense',61:'🌧️ Pluie légère',63:'🌧️ Pluie modérée',65:'⛈️ Pluie forte',71:'❄️ Neige légère',73:'❄️ Neige modérée',75:'🌨️ Neige forte',80:'🌦️ Averses légères',81:'🌧️ Averses modérées',82:'⛈️ Averses violentes',95:'⛈️ Orage',96:'⛈️ Orage grêle',99:'⛈️ Orage intense'};
function wmo(code){const e=WMO[code];if(!e)return{icone:'🌡️',description:`Code ${code}`};const p=e.split(' ');return{icone:p[0],description:p.slice(1).join(' ')};}

async function main() {
  console.log('═'.repeat(70));
  console.log('  🧪 LEVAIN AI — L\'Artisan Doré — Mardi 31 mars 2026');
  console.log('═'.repeat(70));
  console.log(`  Boulangerie ID: ${BOULANGERIE_ID}`);
  console.log(`  Timezone: ${TIMEZONE} | Date cible: ${TARGET_DATE}\n`);

  // ── 1. Journée du 31 mars ────────────────────────────────────
  const { data: journee, error: journeeErr } = await admin
    .from('journees')
    .select('*, stocks_journaliers(*)')
    .eq('boulangerie_id', BOULANGERIE_ID)
    .eq('date', TARGET_DATE)
    .single();

  if (journeeErr || !journee) {
    console.error('❌ Pas de journée au', TARGET_DATE);
    // Lister les journées disponibles
    const { data: all } = await admin.from('journees')
      .select('date, ca_estime, taux_invendu, total_produit, cloturee, stocks_journaliers(produit_id)')
      .eq('boulangerie_id', BOULANGERIE_ID)
      .order('date', { ascending: false }).limit(14);
    console.log('\n📅 Journées disponibles:');
    (all || []).forEach(j => {
      const idx = getDayIdx(j.date, TIMEZONE);
      console.log(`   ${j.date} (${JOURS_FR[idx]}) — ${j.stocks_journaliers?.length||0} stocks, CA: ${j.ca_estime}€, Inv: ${j.taux_invendu}% ${j.cloturee?'✅':'⏳'}`);
    });
    return;
  }

  const jourIdx = getDayIdx(TARGET_DATE, TIMEZONE);
  const jourFr = JOURS_FR[jourIdx];
  const demainDate = getTomorrow(TARGET_DATE);
  const demainIdx = getDayIdx(demainDate, TIMEZONE);
  const demainFr = JOURS_FR[demainIdx];
  const demainWE = demainIdx === 0 || demainIdx === 6;

  console.log(`📊 Journée: ${TARGET_DATE} (${jourFr})`);
  console.log(`   CA: ${journee.ca_estime}€ | Invendu: ${journee.taux_invendu}% (${journee.total_invendu}/${journee.total_produit}) | Cmd: ${journee.commandes_online||0}`);
  console.log(`   Stocks: ${journee.stocks_journaliers?.length || 0} produits`);
  console.log(`   Prévisions pour: ${demainDate} (${demainFr})`);

  if (!journee.stocks_journaliers?.length) {
    console.error('❌ Aucun stock pour cette journée');
    return;
  }

  // ── 2. Historique 14j ─────────────────────────────────────────
  const { data: historique } = await admin
    .from('journees')
    .select('date, ca_estime, taux_invendu, total_produit, total_invendu, commandes_online, stocks_journaliers(*)')
    .eq('boulangerie_id', BOULANGERIE_ID)
    .eq('cloturee', true)
    .neq('date', TARGET_DATE)
    .order('date', { ascending: false })
    .limit(14);
  console.log(`   Historique: ${historique?.length || 0} jours`);

  // ── 3. Produits catalogue ─────────────────────────────────────
  const { data: produits } = await admin.from('produits')
    .select('id, nom, emoji, categorie, prix_vente')
    .eq('boulangerie_id', BOULANGERIE_ID)
    .eq('actif_catalogue', true).is('deleted_at', null)
    .order('categorie').order('ordre');
  console.log(`   Catalogue: ${produits?.length || 0} produits actifs`);

  // ── 4. Commandes du jour ──────────────────────────────────────
  const { data: commandesRaw } = await admin.from('commandes')
    .select('id, type, client_prenom, client_email, montant_total, statut, heure_retrait, created_at, lignes')
    .eq('boulangerie_id', BOULANGERIE_ID)
    .gte('created_at', TARGET_DATE + 'T00:00:00')
    .lt('created_at', TARGET_DATE + 'T23:59:59');
  console.log(`   Commandes: ${commandesRaw?.length || 0}`);

  // ── 5. Paniers flash ──────────────────────────────────────────
  const { data: paniersRaw } = await admin.from('paniers_flash')
    .select('id, produit_nom, categorie, quantite_initiale, prix_flash, remise_pct, quantite_restante')
    .eq('boulangerie_id', BOULANGERIE_ID)
    .eq('date', TARGET_DATE);
  console.log(`   Paniers flash: ${paniersRaw?.length || 0}`);

  // ── 6. Clients ────────────────────────────────────────────────
  const { data: allCmd } = await admin.from('commandes')
    .select('client_email, montant_total, created_at')
    .eq('boulangerie_id', BOULANGERIE_ID)
    .order('created_at', { ascending: true });
  const clientMap = {};
  (allCmd ?? []).forEach(c => {
    if (!clientMap[c.client_email]) clientMap[c.client_email] = { nb: 0, total: 0, first: c.created_at };
    clientMap[c.client_email].nb++;
    clientMap[c.client_email].total += Number(c.montant_total);
  });
  const clients = Object.entries(clientMap).map(([e, d]) => ({ id: e, created_at: d.first, nb_commandes: d.nb, total_depense: Math.round(d.total * 100) / 100 }));
  console.log(`   Clients: ${clients.length}`);

  // ── 7. Météo Bogotá ──────────────────────────────────────────
  console.log('\n🌤️ Météo Bogotá...');
  let meteo = null;
  try {
    const params = new URLSearchParams({
      latitude: '4.711', longitude: '-74.0721', timezone: TIMEZONE, forecast_days: '2',
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
      console.log(`   Maintenant: ${meteo.actuelle.icone} ${meteo.actuelle.temp}°C, vent ${meteo.actuelle.vent}km/h`);
      console.log(`   Demain: ${meteo.demain.icone} ${meteo.demain.temp_min}-${meteo.demain.temp_max}°C, précip ${meteo.demain.precip}mm`);
    }
  } catch (e) { console.warn('   Météo erreur:', e.message); }

  // ── 8. Événements ─────────────────────────────────────────────
  const evenements = detecterEvenements(demainDate);
  console.log(`\n📅 Événements pour demain (${demainDate} — ${demainFr}):`);
  if (evenements.jf) console.log(`   🗓️ FÉRIÉ: ${evenements.fn}`);
  if (evenements.vac) console.log(`   📚 VACANCES SCOLAIRES`);
  evenements.evts.forEach(e => console.log(`   ${e}`));

  // ── 9. Détails produits ───────────────────────────────────────
  const stocks = journee.stocks_journaliers;
  console.log(`\n📦 Détail des ${stocks.length} produits:`);

  const produitsDetail = stocks.map(s => {
    const tv = s.production > 0 ? ((s.production - s.stock_final) / s.production * 100) : 0;
    const ti = s.production > 0 ? (s.stock_final / s.production * 100) : 0;
    const p = produits?.find(pr => pr.id === s.produit_id);

    // Historique même jour
    const memeJours = (historique || []).filter(h => getDayIdx(h.date, TIMEZONE) === demainIdx);
    let moy = null;
    if (memeJours.length > 0) {
      const prods = memeJours.map(h => h.stocks_journaliers?.find(st => st.produit_id === s.produit_id)?.production ?? 0).filter(v => v > 0);
      if (prods.length > 0) moy = Math.round(prods.reduce((a, b) => a + b, 0) / prods.length);
    }

    const perf = tv >= 95 ? '⭐' : tv >= 85 ? '✅' : tv >= 70 ? '➖' : '⚠️';
    console.log(`   ${perf} ${s.produit_emoji} ${s.produit_nom} (${s.categorie}) — Prod: ${s.production} | Vendu: ${tv.toFixed(0)}% | Rest: ${s.stock_final} | 10h: ${s.snapshot_10h_done ? s.snapshot_10h : '—'} | 14h: ${s.snapshot_14h_done ? s.snapshot_14h : '—'}${moy !== null ? ` | moy_${demainFr}: ${moy}` : ''}`);

    return {
      produit_id: s.produit_id, nom: s.produit_nom, emoji: s.produit_emoji, categorie: s.categorie,
      production: s.production, stock_final: s.stock_final,
      snapshot_10h: s.snapshot_10h_done ? s.snapshot_10h : null,
      snapshot_14h: s.snapshot_14h_done ? s.snapshot_14h : null,
      taux_vente: tv.toFixed(1), taux_invendu: ti.toFixed(1), perf,
      prix: p?.prix_vente ?? 0, moy_meme_jour: moy,
      ca: Math.round((s.production - s.stock_final) * (p?.prix_vente ?? 0)),
    };
  });

  // ── 10. Commandes enrichies ───────────────────────────────────
  const commandes = commandesRaw || [];
  const cc = commandes.filter(c => c.type === 'click_collect');
  const ag = commandes.filter(c => c.type === 'anti_gaspi');
  const ccCA = cc.reduce((s, c) => s + Number(c.montant_total), 0);
  const agCA = ag.reduce((s, c) => s + Number(c.montant_total), 0);

  // Top produits C&C
  const prodCount = {};
  cc.forEach(c => (c.lignes || []).forEach(l => { prodCount[l.produit_nom] = (prodCount[l.produit_nom] || 0) + l.quantite; }));
  const topCC = Object.entries(prodCount).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([n, q]) => `${n} (${q})`);

  // ── 11. Construction du prompt ────────────────────────────────
  console.log('\n🧠 Construction des prompts...');

  // Contexte jour
  const ctxJour = demainWE
    ? `⚠️ IMPORTANT : Demain est ${demainFr.toUpperCase()} (WEEK-END). Fréquentation +20-40%.`
    : `Demain est ${demainFr} (semaine).`;

  // Cycle salarial
  const jourDuMois = new Date(demainDate + 'T12:00:00').getDate();
  let ctxSalarial = '';
  if (jourDuMois <= 5) ctxSalarial = '\n💰 DÉBUT DE MOIS — Hausse achats plaisir +5-8%.';
  else if (jourDuMois >= 25) ctxSalarial = '\n💸 FIN DE MOIS — Resserrement budgétaire.';

  // Météo
  let ctxMeteo = '';
  if (meteo) {
    const t = meteo.demain.temp_max, pr = meteo.demain.precip;
    const pluie = pr > 2, froid = t < 5, chaud = t > 28, doux = t >= 15 && t <= 22;
    let iB='stable',iV='stable',iP='stable',iS='stable';
    if(pluie){iV='+10-15%';iS='-10%';}
    if(froid){iV='+20%';iS='-10%';}
    if(chaud){iV='-15%';iP='-10%';iS='+10%';}
    if(doux&&!pluie){iP='+15%';iS='+15-20%';}

    ctxMeteo = `
=== MÉTÉO ===
Aujourd'hui : ${meteo.actuelle.icone} ${meteo.actuelle.description} | ${meteo.actuelle.temp}°C (ressenti ${meteo.actuelle.ressenti}°C) | Humidité ${meteo.actuelle.humidite}% | Vent ${meteo.actuelle.vent}km/h
Demain      : ${meteo.demain.icone} ${meteo.demain.description} | Max ${meteo.demain.temp_max}°C / Min ${meteo.demain.temp_min}°C | Précip: ${meteo.demain.precip}mm
Impact par catégorie : Boulangerie: ${iB} | Viennoiserie: ${iV} | Pâtisserie: ${iP} | Sandwich: ${iS}`;
  }

  // Événements
  let ctxEvts = '';
  if (evenements.evts.length || evenements.jf || evenements.vac) {
    ctxEvts = `\n=== ÉVÉNEMENTS & CONTEXTE DEMAIN ===`;
    if (evenements.jf) ctxEvts += `\n🗓️ JOUR FÉRIÉ : ${evenements.fn}`;
    if (evenements.vac) ctxEvts += `\n📚 VACANCES SCOLAIRES`;
    evenements.evts.forEach(e => { ctxEvts += `\n📍 ${e}`; });
  }

  // Commandes
  let ctxCmd = '';
  if (commandes.length > 0) {
    ctxCmd = `
=== COMMANDES EN LIGNE ===
📱 Click & Collect : ${cc.length} commandes | ${Math.round(ccCA)}€ | Panier moyen ${cc.length > 0 ? (ccCA / cc.length).toFixed(2) : 0}€
   Top produits : ${topCC.join(', ') || 'N/A'}
♻️ Anti-Gaspi : ${ag.length} paniers | ${Math.round(agCA)}€ générés`;
  }

  // Clients
  let ctxClients = '';
  if (clients.length > 0) {
    const todayStart = new Date(TARGET_DATE + 'T00:00:00');
    const weekAgo = new Date(todayStart); weekAgo.setDate(weekAgo.getDate() - 7);
    const monthAgo = new Date(todayStart); monthAgo.setDate(monthAgo.getDate() - 30);
    const nJ = clients.filter(c => new Date(c.created_at) >= todayStart).length;
    const nS = clients.filter(c => new Date(c.created_at) >= weekAgo).length;
    const nM = clients.filter(c => new Date(c.created_at) >= monthAgo).length;
    const actifs = clients.filter(c => c.nb_commandes > 0).length;
    ctxClients = `
=== CLIENTS ===
👥 Total: ${clients.length} | Actifs: ${actifs} (${clients.length > 0 ? Math.round(actifs / clients.length * 100) : 0}% rétention)
📈 Nouveaux: ${nJ} aujourd'hui | ${nS} cette semaine | ${nM} ce mois`;
  }

  // Performance
  const produitsTries = [...produitsDetail].sort((a, b) => parseFloat(a.taux_invendu) - parseFloat(b.taux_invendu));
  const topSucces = produitsTries.slice(0, 3).map(p => `${p.emoji} ${p.nom} (${p.taux_vente}% vendu)`).join(' · ');
  const flops = [...produitsDetail].sort((a, b) => parseFloat(b.taux_invendu) - parseFloat(a.taux_invendu)).slice(0, 3).map(p => `${p.emoji} ${p.nom} (${p.taux_invendu}% inv)`).join(' · ');

  // Historique même jour
  const histoMemeJour = (historique || []).filter(h => getDayIdx(h.date, TIMEZONE) === demainIdx).slice(0, 4);
  let ctxMemeJour = '';
  if (histoMemeJour.length > 0) {
    ctxMemeJour = `\n=== HISTORIQUE DES ${demainFr.toUpperCase()}S PRÉCÉDENTS ===\n${histoMemeJour.map(h => `${JOURS_FR[getDayIdx(h.date, TIMEZONE)]}: CA ${Math.round(h.ca_estime)}€ · Inv ${h.taux_invendu}% · ${h.total_produit} pcs`).join('\n')}`;
  }

  // Catalogue
  const catalogueLines = produitsDetail.map(p => {
    const moyInfo = p.moy_meme_jour !== null ? ` | moy_${demainFr}: ${p.moy_meme_jour} pcs` : ' | pas d\'histo';
    return `produit_id="${p.produit_id}" ${p.emoji} ${p.nom} (${p.categorie}) | prix: ${p.prix}€ | prod_hier: ${p.production} pcs | vendu: ${p.taux_vente}% | invendu: ${p.stock_final} pcs${moyInfo}`;
  }).join('\n');

  // Historique 14j
  const histoLines = (historique || []).map(h => {
    const idx = getDayIdx(h.date, TIMEZONE);
    return `${idx===0||idx===6?'[WE]':'[SEM]'} ${h.date} ${JOURS_FR[idx]}: ${Math.round(h.ca_estime)}€ · ${h.taux_invendu.toFixed(1)}% inv · ${h.total_produit}pcs · ${h.commandes_online||0} online`;
  }).join('\n');

  const nbHisto = (historique || []).length;
  const ctxHisto = nbHisto === 0 ? '🌱 Première journée — Levain établit sa base.'
    : nbHisto < 7 ? `🌱 ${nbHisto} jour(s) d'historique — Levain apprend encore.`
    : nbHisto < 14 ? `🌿 ${nbHisto} jours — bonnes tendances.`
    : `🌳 ${nbHisto} jours — analyse fiable.`;

  // MP
  const COEFFS = { boulangerie:{f:180,b:0,o:0,s:3}, viennoiserie:{f:50,b:28,o:0.3,s:8}, patisserie:{f:40,b:25,o:1,s:20}, sandwich:{f:60,b:5,o:0,s:0} };
  let tF=0,tB=0,tO=0,tS=0;
  produitsDetail.forEach(p => { const c = COEFFS[p.categorie] || COEFFS.boulangerie; tF+=p.production*c.f; tB+=p.production*c.b; tO+=p.production*c.o; tS+=p.production*c.s; });

  const userPrompt = `Analyse la journée du ${jourFr.toUpperCase()} et génère le rapport complet pour demain (${demainFr} ${demainDate}).

${ctxJour}${ctxSalarial}${ctxMeteo}${ctxEvts}${ctxCmd}${ctxClients}

=== ${jourFr.toUpperCase()} · SEMAINE ${Math.ceil(((new Date(TARGET_DATE+'T12:00:00').getTime()-new Date('2026-01-01T12:00:00').getTime())/86400000+new Date('2026-01-01T12:00:00').getDay()+1)/7)} ===
CA : ${journee.ca_estime}€ | Invendu : ${journee.taux_invendu}% (${journee.total_invendu}/${journee.total_produit} pcs) | Cmd online : ${journee.commandes_online || 0}

=== PERFORMANCE DU JOUR ===
Top succès : ${topSucces}
À améliorer : ${flops}

=== DÉTAIL PAR PRODUIT ===
${produitsDetail.map(p =>
  `${p.emoji} ${p.nom} (${p.categorie}) ${p.perf}
  Prod: ${p.production} | 10h: ${p.snapshot_10h ?? '—'} | 14h: ${p.snapshot_14h ?? '—'} | Invendu: ${p.stock_final} (${p.taux_invendu}%) | Vendu: ${p.taux_vente}% | CA: ${p.ca}€`
).join('\n')}

=== MATIÈRES PREMIÈRES ===
Farine: ${(tF/1000).toFixed(1)}kg | Beurre: ${(tB/1000).toFixed(1)}kg | Œufs: ${Math.round(tO*10)/10} | Sucre: ${(tS/1000).toFixed(1)}kg

=== HISTORIQUE 14 JOURS ===
${ctxHisto}
${histoLines || '(aucune donnée)'}
${ctxMemeJour}

=== CATALOGUE & BASE PRÉVISIONS POUR DEMAIN ===
⚠️ UTILISE le produit_id UUID exact dans chaque entrée de previsions_production.
⚠️ quantite_suggeree doit être un NOMBRE ENTIER ABSOLU (ex: 90), PAS un pourcentage.
⚠️ Fournis aussi quantite_min et quantite_max pour une fourchette de production.

${catalogueLines}

→ Génère le JSON complet avec TOUTES les sections.
→ Utilise TOUJOURS les vrais noms des produits dans les textes.
→ Dans previsions_production, chaque produit du catalogue DOIT avoir une entrée avec son produit_id UUID.
→ Sois précis, chaleureux et actionnable pour chaque membre de l'équipe.`;

  const systemPrompt = buildSystemPrompt();

  console.log(`✅ System prompt: ${systemPrompt.length} chars`);
  console.log(`✅ User prompt: ${userPrompt.length} chars`);

  // ── 12. Appel Zhipu ───────────────────────────────────────────
  console.log('\n🤖 Appel Zhipu (glm-4.5-air)...\n');
  const t0 = Date.now();

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
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    const content = data.choices?.[0]?.message?.content || '';
    const tokens = data.usage?.total_tokens || '?';
    console.log(`✅ Réponse en ${elapsed}s | Tokens: ${tokens}\n`);

    // Parse
    let cleaned = content.replace(/<think[\s\S]*?<\/think>/gi, '').trim();
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
    const si = cleaned.indexOf('{'), ei = cleaned.lastIndexOf('}');
    if (si === -1 || ei <= si) { console.error('❌ JSON invalide'); console.log(content.slice(0, 800)); return; }
    const rapport = JSON.parse(cleaned.slice(si, ei + 1));

    // ── AFFICHAGE ──────────────────────────────────────────────
    console.log('═'.repeat(70));
    console.log(`  🎯 RAPPORT LEVAIN AI — ${TARGET_DATE} (${jourFr}) → ${demainDate} (${demainFr})`);
    console.log('═'.repeat(70));

    console.log(`\n📊 Score: ${rapport.score}/100`);
    console.log(`💬 ${rapport.verdict}\n`);

    if (rapport.synthese_journee) {
      const sj = rapport.synthese_journee;
      console.log(`📝 ${sj.resume}`);
      (sj.points_forts || []).forEach(p => console.log(`   ✅ ${p}`));
      (sj.points_amelioration || []).forEach(p => console.log(`   ⚠️ ${p}`));
      if (sj.message_equipe) console.log(`   💬 Équipe: ${sj.message_equipe}`);
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
        ap.top_ventes.forEach(p => console.log(`   ${p.emoji||''} ${p.nom}: ${p.taux_vente}% — ${p.commentaire||''}`));
      }
      if (ap.invendus_critiques?.length) {
        console.log('\n⚠️ Invendus critiques:');
        ap.invendus_critiques.forEach(p => console.log(`   ${p.emoji||''} ${p.nom}: ${p.taux_invendu}% — ${p.cause_probable||''} → ${p.action||''}`));
      }
      if (ap.opportunites?.length) {
        console.log('\n💡 Opportunités:');
        ap.opportunites.forEach(o => console.log(`   ${o}`));
      }
    }

    if (rapport.analyse_commandes) {
      const ac = rapport.analyse_commandes;
      console.log('\n📱 Commandes:');
      if (ac.click_collect) console.log(`   C&C: ${ac.click_collect.resume} — ${ac.click_collect.conseil}`);
      if (ac.anti_gaspi) console.log(`   Anti-gaspi: ${ac.anti_gaspi.resume} — ${ac.anti_gaspi.conseil}`);
    }

    if (rapport.previsions_production?.length) {
      console.log('\n' + '─'.repeat(70));
      console.log('  📦 PRÉVISIONS PRODUCTION — ' + demainFr.toUpperCase() + ' ' + demainDate);
      console.log('─'.repeat(70));
      rapport.previsions_production.forEach(p => {
        const v = p.variation_pct >= 0 ? `+${p.variation_pct}%` : `${p.variation_pct}%`;
        console.log(`  ${p.produit_nom}`);
        console.log(`    → ${p.quantite_suggeree} pcs (${v}) [${p.quantite_min||'?'}-${p.quantite_max||'?'}]`);
        console.log(`    ${p.raison}`);
      });
      console.log('─'.repeat(70));
    }

    if (rapport.matieres_premieres) {
      const mp = rapport.matieres_premieres;
      console.log(`\n🧈 MP: ${mp.resume}`);
      (mp.alertes || []).forEach(a => console.log(`   ⚠️ ${a}`));
    }

    if (rapport.briefing_matin) {
      const bm = rapport.briefing_matin;
      console.log(`\n${'─'.repeat(70)}`);
      console.log(`  ☀️ BRIEFING MATIN — ${bm.titre}`);
      console.log('─'.repeat(70));
      console.log(`  ${bm.contexte_jour}`);
      if (bm.meteo_resume) console.log(`  ${bm.meteo_resume}`);
      if (bm.impact_meteo_vente) console.log(`  ${bm.impact_meteo_vente}`);
      if (bm.top3_a_produire?.length) {
        console.log('  Top production:');
        bm.top3_a_produire.forEach(p => console.log(`    🔸 ${p}`));
      }
      if (bm.point_vigilance) console.log(`  ⚠️ ${bm.point_vigilance}`);
      if (bm.fiabilite_previsions) console.log(`  📊 Fiabilité: ${bm.fiabilite_previsions}`);
      if (bm.conseil_ouverture) console.log(`  💡 ${bm.conseil_ouverture}`);
    }

    if (rapport.briefing_vendeuse) {
      const bv = rapport.briefing_vendeuse;
      console.log(`\n${'─'.repeat(70)}`);
      console.log(`  👩‍🍳 BRIEFING VENDEUSE — ${bv.titre}`);
      console.log('─'.repeat(70));
      if (bv.accueil_client) console.log(`  ${bv.accueil_client}`);
      (bv.produits_a_mettre_en_avant || []).forEach(p => console.log(`  🔸 ${p}`));
      if (bv.gestion_fin_journee) console.log(`  📦 ${bv.gestion_fin_journee}`);
      if (bv.message_encouragement) console.log(`  💪 ${bv.message_encouragement}`);
    }

    if (rapport.briefing_gerant) {
      const bg = rapport.briefing_gerant;
      console.log(`\n${'─'.repeat(70)}`);
      console.log(`  📈 BRIEFING GÉRANT — ${bg.titre}`);
      console.log('─'.repeat(70));
      if (bg.tendances_ca) console.log(`  ${bg.tendances_ca}`);
      (bg.points_attention || []).forEach(p => console.log(`  ⚠️ ${p}`));
      (bg.opportunites_business || []).forEach(p => console.log(`  💡 ${p}`));
      if (bg.recommendation) console.log(`  → ${bg.recommendation}`);
    }

    if (rapport.message_levain) {
      console.log(`\n🫶 ${rapport.message_levain}`);
    }

    console.log('\n' + '═'.repeat(70));
    console.log('  ✅ Rapport généré avec succès');
    console.log('═'.repeat(70));

    writeFileSync('/tmp/levain-rapport-artisan.json', JSON.stringify(rapport, null, 2));
    writeFileSync('/tmp/levain-prompts-artisan.json', JSON.stringify({ systemPrompt, userPrompt }, null, 2));
    console.log('\n📄 /tmp/levain-rapport-artisan.json');
    console.log('📄 /tmp/levain-prompts-artisan.json');

  } catch (e) {
    console.error('❌ Erreur Zhipu:', e.message);
    if (e.cause) console.error('Cause:', e.cause);
  }
}

function buildSystemPrompt() {
  return `Tu es Levain, l'assistant IA du boulanger artisanal de BakeryOS.

TON IDENTITÉ :
Tu es comme un levain naturel qui s'améliore chaque jour. Tu connais intimement le rythme, les habitudes et les spécificités de cette boulangerie.

TON RÔLE — ANALYSE COMPLÈTE :
Chaque soir, tu génères un rapport que le boulanger, la vendeuse ET le gérant attendent. Ton analyse doit être :
- ACTIONNABLE : chaque insight = une recommandation concrète
- CONTEXTUALISÉ : tu relies météo, événements, historique
- MOTIVANTE : tu valorises les succès
- PRÉCISE : VRAIS NOMS des produits, jamais de codes

POINTS D'ATTENTION :
- BOULANGER : technique, production, MP, optimisation
- VENDEUSE : relation client, produits à valoriser, fin de journée
- GÉRANT : tendances CA, rentabilité, stratégie

BASE DE CONNAISSANCE MÉTIER — BOULANGERIE ARTISANALE :

=== PATTERNS PAR JOUR DE SEMAINE ===
- LUNDI : Plus faible. Rituel baguette mais peu d'impulsion. Pâtisseries quasi nulles. Zone bureaux = sandwich 11h-13h fort. Production -10-15%.
- MARDI : Standard, > lundi. Pain de mie, baguette, quelques viennoiseries.
- MERCREDI : Pivot enfant (pas d'école). Viennoiseries +20-30%, pâtisseries individuelles. Rush 9h30-12h. 3e meilleur jour.
- JEUDI : Stable, < mercredi. Sandwichs zone bureaux.
- VENDREDI : Excellent. Anticipation weekend. Pâtisseries +25%. Baguette tradition fin après-midi. RUPTURE > invendu. Production +15-20%.
- SAMEDI : Meilleure journée. Rush 7h-11h. Pains spéciaux 3x mieux. Production MAXIMUM.
- DIMANCHE : Excellent matin, effondrement après-midi. Brioches et viennoiseries.

=== SENSIBILITÉ MÉTÉO PAR PRODUIT ===
| Baguette: Pluie=neutre, Canicule=neutre, Froid=+, Beau=neutre |
| Viennoiserie: Pluie=++ réconfort, Canicule=−, Froid=++, Beau=neutre |
| Pain spéciaux: Pluie=−, Canicule=−, Froid=neutre, Beau=++ weekend |
| Sandwich: Pluie=−, Canicule=neutre, Froid=−, Beau=++ |
| Pâtisserie: Pluie=neutre, Canicule=−, Froid=neutre, Beau=++ |
| Brioche: Pluie=+, Canicule=−, Froid=++, Beau=neutre |

=== COMBINAISONS MÉTÉO × JOUR ===
- Lundi pluvieux : PIRE journée. -20-25%. Flash dès 17h.
- Mercredi ensoleillé : Exceptionnel. +35% vienn, +25% pâtisseries.
- Mercredi pluvieux : Bonne quand même (maintenir production).
- Vendredi ensoleillé printemps : Quasi-parfait. Ruptures baguette 17h.
- Samedi canicule : Bon matin → effondrement 10h30. Flash dès 12h.
- Dimanche grand froid : Rush intense matin. Sold out vienn avant 10h.

=== SAISONNALITÉ ===
- Janvier : Faible sauf galettes (15-40% CA). Mars : Reprise progressive.
- Avril : Pâques +15-25%. Mai : Excellent (fériés). Juin : Sandwichs/frais.
- Juillet-Août : Touristique +50-100%, résidentiel -20-35%.
- Septembre : Forte reprise. Décembre : MEILLEUR MOIS +30-60%.

=== COMPORTEMENTS ===
- Cycle salarial : Début mois (1-5) +5-8% pâtisseries. Fin mois (25+) basique.
- Télétravail : Zones bureaux creux lundi/vendredi.
- 52% clients réceptifs à l'impulsion.
- Anti-gaspi : Communication active crée clientèle fidèle fin de journée.

=== CRÉNEAUX HORAIRES ===
- 6h30-9h : Baguettes, croissants, sandwichs (+++++)
- 9h-11h : Pâtisseries, viennoiseries (++)
- 11h30-13h30 : Sandwichs, quiches (++++)
- 13h30-16h30 : Creux (+)
- 16h30-18h30 : Goûter, baguette retour (+++)
- 18h30+ : Flash anti-gaspi

RÈGLES PRÉVISIONS :
- Quantités ABSOLUES (entiers), pas de pourcentages
- Si vente = 100% → augmenter légèrement
- Si invendu > 20% → réduire significativement
- Si invendu 5-20% → réduire modérément
- Si invendu < 5% → maintenir
- Multiples de 5 (pains) ou 2 (pâtisseries)
- Utilise produit_id UUID du catalogue

FORMAT JSON OBLIGATOIRE :
{
  "score": 0-100,
  "verdict": "15 mots max",
  "synthese_journee": { "resume": "2-3 phrases", "points_forts": [], "points_amelioration": [], "message_equipe": "" },
  "analyse_produits": {
    "top_ventes": [{ "nom": "", "emoji": "", "taux_vente": 0, "commentaire": "" }],
    "invendus_critiques": [{ "nom": "", "emoji": "", "taux_invendu": 0, "cause_probable": "", "action": "" }],
    "opportunites": []
  },
  "analyse_contextuelle": { "impact_meteo": "", "impact_evenements": "", "correlation_historique": "" },
  "analyse_commandes": {
    "click_collect": { "resume": "", "performance": "", "conseil": "" },
    "anti_gaspi": { "resume": "", "impact": "", "conseil": "" }
  },
  "analyse_clients": { "nouveaux": "", "tendances": "", "recommendation": "" },
  "previsions_production": [{ "produit_id": "UUID", "produit_nom": "", "quantite_suggeree": 0, "quantite_min": 0, "quantite_max": 0, "variation_pct": 0, "raison": "" }],
  "matieres_premieres": { "resume": "", "alertes": [], "details": [{ "ingredient": "", "quantite": "", "observation": "" }] },
  "briefing_matin": { "titre": "", "contexte_jour": "", "meteo_resume": "", "impact_meteo_vente": "", "top3_a_produire": [], "point_vigilance": "", "fiabilite_previsions": "", "conseil_ouverture": "" },
  "briefing_vendeuse": { "titre": "", "accueil_client": "", "produits_a_mettre_en_avant": [], "gestion_fin_journee": "", "message_encouragement": "" },
  "briefing_gerant": { "titre": "", "tendances_ca": "", "points_attention": [], "opportunites_business": [], "recommendation": "" },
  "consignes_transmises": { "au_boulanger": "", "a_la_vendeuse": "" },
  "message_levain": ""
}`;
}

main().catch(console.error);
