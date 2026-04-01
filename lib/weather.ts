// lib/weather.ts
// ─────────────────────────────────────────────────────────────
// Météo via Open-Meteo (gratuit, sans clé API, RGPD-compliant)
// https://open-meteo.com/en/docs
// ─────────────────────────────────────────────────────────────

export interface MeteoActuelle {
  temperature_c:     number;
  ressenti_c:        number;
  humidite_pct:      number;
  precipitations_mm: number;
  vitesse_vent_kmh:  number;
  code_meteo:        number;
  description:       string;
  icone:             string;
}

export interface MeteoDemain {
  temp_max_c:    number;
  temp_min_c:    number;
  precip_mm:     number;
  code_meteo:    number;
  description:   string;
  icone:         string;
}

export interface MeteoComplet {
  actuelle: MeteoActuelle;
  demain:   MeteoDemain;
}

// ── Codes WMO → description française + emoji ─────────────────
// https://open-meteo.com/en/docs#weathervariables
const WMO_CODES: Record<number, { label: string; emoji: string }> = {
  0:  { label: 'Ciel dégagé',           emoji: '☀️'  },
  1:  { label: 'Principalement dégagé', emoji: '🌤️' },
  2:  { label: 'Partiellement nuageux', emoji: '⛅'  },
  3:  { label: 'Couvert',               emoji: '☁️'  },
  45: { label: 'Brouillard',            emoji: '🌫️' },
  48: { label: 'Brouillard givrant',    emoji: '🌫️' },
  51: { label: 'Bruine légère',         emoji: '🌦️' },
  53: { label: 'Bruine modérée',        emoji: '🌦️' },
  55: { label: 'Bruine dense',          emoji: '🌧️' },
  61: { label: 'Pluie légère',          emoji: '🌧️' },
  63: { label: 'Pluie modérée',         emoji: '🌧️' },
  65: { label: 'Pluie forte',           emoji: '⛈️'  },
  71: { label: 'Neige légère',          emoji: '❄️'  },
  73: { label: 'Neige modérée',         emoji: '❄️'  },
  75: { label: 'Neige forte',           emoji: '🌨️' },
  80: { label: 'Averses légères',       emoji: '🌦️' },
  81: { label: 'Averses modérées',      emoji: '🌧️' },
  82: { label: 'Averses violentes',     emoji: '⛈️'  },
  95: { label: 'Orage',                 emoji: '⛈️'  },
  96: { label: 'Orage avec grêle',      emoji: '⛈️'  },
  99: { label: 'Orage intense + grêle', emoji: '⛈️'  },
};

function wmoToLabel(code: number): { description: string; icone: string } {
  const entry = WMO_CODES[code];
  return entry
    ? { description: entry.label, icone: entry.emoji }
    : { description: `Conditions météo (code ${code})`, icone: '🌡️' };
}

// ── Fetch météo ───────────────────────────────────────────────

export async function fetchMeteo(
  latitude:  number,
  longitude: number,
  timezone:  string,
): Promise<MeteoComplet | null> {
  try {
    const params = new URLSearchParams({
      latitude:     String(latitude),
      longitude:    String(longitude),
      timezone:     timezone,
      forecast_days: '2',
      // Météo actuelle
      current: [
        'temperature_2m',
        'apparent_temperature',
        'relative_humidity_2m',
        'precipitation',
        'weather_code',
        'wind_speed_10m',
      ].join(','),
      // Prévisions journalières J+1
      daily: [
        'temperature_2m_max',
        'temperature_2m_min',
        'precipitation_sum',
        'weather_code',
      ].join(','),
    });

    const url = `https://api.open-meteo.com/v1/forecast?${params}`;
    const res = await fetch(url, {
      next:   { revalidate: 1800 }, // cache 30min côté Next.js
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      console.warn(`[weather] Open-Meteo HTTP ${res.status}`);
      return null;
    }

    const data = await res.json() as {
      current: {
        temperature_2m:      number;
        apparent_temperature: number;
        relative_humidity_2m: number;
        precipitation:        number;
        weather_code:         number;
        wind_speed_10m:       number;
      };
      daily: {
        time:                string[];
        temperature_2m_max:  number[];
        temperature_2m_min:  number[];
        precipitation_sum:   number[];
        weather_code:        number[];
      };
    };

    const curr = data.current;
    const d1   = data.daily; // index 0 = aujourd'hui, index 1 = demain

    const meteoActuelle: MeteoActuelle = {
      temperature_c:     Math.round(curr.temperature_2m * 10) / 10,
      ressenti_c:        Math.round(curr.apparent_temperature * 10) / 10,
      humidite_pct:      Math.round(curr.relative_humidity_2m),
      precipitations_mm: Math.round((curr.precipitation ?? 0) * 10) / 10,
      vitesse_vent_kmh:  Math.round(curr.wind_speed_10m * 10) / 10,
      code_meteo:        curr.weather_code,
      ...wmoToLabel(curr.weather_code),
    };

    const meteoDemain: MeteoDemain = d1.time.length > 1 ? {
      temp_max_c:  Math.round(d1.temperature_2m_max[1] * 10) / 10,
      temp_min_c:  Math.round(d1.temperature_2m_min[1] * 10) / 10,
      precip_mm:   Math.round((d1.precipitation_sum[1] ?? 0) * 10) / 10,
      code_meteo:  d1.weather_code[1],
      ...wmoToLabel(d1.weather_code[1]),
    } : {
      temp_max_c: meteoActuelle.temperature_c + 2,
      temp_min_c: meteoActuelle.temperature_c - 5,
      precip_mm:  0,
      code_meteo: 0,
      description: 'Non disponible',
      icone: '❓',
    };

    return { actuelle: meteoActuelle, demain: meteoDemain };

  } catch (err) {
    console.warn('[weather] Erreur fetch météo:', err);
    return null;
  }
}

// ── Impact météo sur la consommation (expertise boulangerie) ──
// Basé sur des études de comportement client en boulangerie

// Impact météo par catégorie de produit — basé sur études de consommation boulangerie FR
export interface ImpactParCategorie {
  boulangerie:  string;  // pains
  viennoiserie: string;
  patisserie:   string;
  sandwich:     string;
}

export function analyserImpactMeteo(meteo: MeteoComplet): {
  impact_global:       string;
  conseils:            string[];
  facteur_trafic:      string;
  impact_par_categorie: ImpactParCategorie;
} {
  const { actuelle, demain } = meteo;
  const conseils: string[] = [];
  let facteur = 'stable';
  const impact_cat: ImpactParCategorie = {
    boulangerie:  'stable',
    viennoiserie: 'stable',
    patisserie:   'stable',
    sandwich:     'stable',
  };

  // Classification météo demain
  const pluieLegere = demain.precip_mm > 0.5 && demain.precip_mm <= 5;
  const pluieForte  = demain.precip_mm > 5 || [65,82,95,96,99].includes(demain.code_meteo);
  const pluieDemain = pluieLegere || pluieForte;
  const orageDemain = [95,96,99].includes(demain.code_meteo);
  const neigeLegere = [71].includes(demain.code_meteo);
  const neigeForte  = [73,75].includes(demain.code_meteo);
  const soleilDemain = [0,1].includes(demain.code_meteo);
  const tempDoux = demain.temp_max_c >= 15 && demain.temp_max_c <= 22;
  const froidDemain = demain.temp_max_c < 5;
  const fraisDemain = demain.temp_max_c >= 5 && demain.temp_max_c < 12;
  const chaudDemain = demain.temp_max_c >= 26 && demain.temp_max_c < 30;
  const caniculeDemain = demain.temp_max_c >= 30;
  const ventFort = actuelle.vitesse_vent_kmh > 40;

  // ── Pluie légère à modérée ────────────────────────────────
  if (pluieLegere && !pluieForte) {
    facteur = 'fréquentation -8-12%, panier moyen en hausse';
    impact_cat.boulangerie  = 'neutre';
    impact_cat.viennoiserie = '+10-15% (réconfort)';
    impact_cat.patisserie   = 'neutre à +5%';
    impact_cat.sandwich     = '-10%';
    conseils.push(`${demain.icone} Pluie légère (${demain.precip_mm}mm) — fréquentation en baisse mais compensée par panier moyen plus élevé. Les clients achètent "plus en une fois" pour éviter de ressortir.`);
    conseils.push('Hausse viennoiseries réconfort +10-15%. Réduire les sandwichs froids.');
  }

  // ── Pluie forte / orage ───────────────────────────────────
  if (pluieForte || orageDemain) {
    facteur = '-25 à -40% fréquentation';
    impact_cat.boulangerie  = '+5% (achats de base rapides)';
    impact_cat.viennoiserie = '+10% (réconfort)';
    impact_cat.patisserie   = '-10%';
    impact_cat.sandwich     = '-25% (gens restent chez eux)';
    conseils.push(`⛈️ Pluie forte/orage prévus (${demain.precip_mm}mm) — forte baisse de passage -25-40%. Réduire la production globale de 20%.`);
    conseils.push('Ceux qui viennent ont une vraie intention d\'achat. Hausse baguette. Sandwichs fortement délaissés.');
    conseils.push('Prévoir paniers flash dès 17h — risque d\'invendu élevé.');
  }

  // ── Vent fort ─────────────────────────────────────────────
  if (ventFort) {
    conseils.push(`💨 Vent fort (${actuelle.vitesse_vent_kmh} km/h) — fréquentation -10-15%, surtout personnes âgées et familles avec enfants. Peu d'impact sur les types de produits achetés.`);
    if (facteur === 'stable') facteur = '-10-15%';
  }

  // ── Soleil doux (15-22°C) — MEILLEURE MÉTÉO ──────────────
  if (soleilDemain && tempDoux) {
    facteur = '+15% achats d\'impulsion';
    impact_cat.boulangerie  = 'neutre';
    impact_cat.viennoiserie = 'neutre';
    impact_cat.patisserie   = '+15% (achats spontanés)';
    impact_cat.sandwich     = '+15-20% (pique-niques, parcs)';
    conseils.push(`${demain.icone} Soleil doux (${demain.temp_max_c}°C) — meilleure météo pour la boulangerie ! Les gens flânent, achats d'impulsion +15%.`);
    conseils.push('Préparer plus de sandwichs (pique-niques) et pâtisseries individuelles. Bonne journée toutes catégories.');
  }

  // ── Soleil + frais (sans froid intense) ───────────────────
  if (soleilDemain && !tempDoux && fraisDemain) {
    facteur = '+5%';
    impact_cat.viennoiserie = '+10%';
    conseils.push(`${demain.icone} Beau temps frais (${demain.temp_max_c}°C) — bonne fréquentation. Légère hausse viennoiseries.`);
  }

  // ── Chaleur (26-30°C) ─────────────────────────────────────
  if (chaudDemain && !caniculeDemain) {
    facteur = '-5 à -10% global';
    impact_cat.boulangerie  = '-5% (pains denses)';
    impact_cat.viennoiserie = '-10% (produits gras)';
    impact_cat.patisserie   = '-10% (produits lourds)';
    impact_cat.sandwich     = '+10% (produits frais légers)';
    conseils.push(`🌡️ Chaleur (${demain.temp_max_c}°C) — réduire pains de campagne, ciabattas, pains spéciaux lourds.`);
    conseils.push('Favoriser sandwichs frais et produits légers. Désaffection créneau 12h-16h.');
  }

  // ── Canicule (>30°C) ──────────────────────────────────────
  if (caniculeDemain) {
    facteur = '-10 à -20% global, creux 12h-16h';
    impact_cat.boulangerie  = '-10% (pains denses)';
    impact_cat.viennoiserie = '-15-20% (gras = repoussoir)';
    impact_cat.patisserie   = '-15% (lourdes)';
    impact_cat.sandwich     = '+5% (sandwichs frais uniquement)';
    conseils.push(`🥵 CANICULE (${demain.temp_max_c}°C) — Impact négatif global. Baisse appétit produits lourds. Effondrement 12h-16h.`);
    conseils.push('Réduire fortement production pains campagne, viennoiseries grasses. Miser sur produits légers.');
    conseils.push('Risque d\'invendu important en fin de journée. Activer paniers flash tôt (dès 14h si samedi).');
  }

  // ── Froid intense (<5°C) ──────────────────────────────────
  if (froidDemain) {
    facteur = '+5-10% global, +20% viennoiseries';
    impact_cat.boulangerie  = '+5% (baguette)';
    impact_cat.viennoiserie = '+20% (réconfort chaud)';
    impact_cat.patisserie   = 'neutre';
    impact_cat.sandwich     = '-10%';
    conseils.push(`🥶 Froid intense (max ${demain.temp_max_c}°C) — hausse viennoiseries chaudes +20% : chocolatines, croissants chauds, pains briochés.`);
    conseils.push('Les gens veulent du chaud et du réconfort. Augmenter production viennoiseries.');
  }

  // ── Froid modéré (5-12°C) ─────────────────────────────────
  if (fraisDemain && !froidDemain && !soleilDemain) {
    impact_cat.viennoiserie = '+10%';
    conseils.push(`🌡️ Frais (${demain.temp_max_c}°C) — légère hausse viennoiseries chaudes.`);
  }

  // ── Neige légère ──────────────────────────────────────────
  if (neigeLegere) {
    facteur = 'neutre à +10% (ambiance)';
    impact_cat.viennoiserie = '+15-20% (réconfort)';
    conseils.push('❄️ Neige légère — ambiance appréciée, enfants dehors. Hausse réconfort et viennoiseries +15-20%.');
  }

  // ── Neige forte ───────────────────────────────────────────
  if (neigeForte) {
    facteur = '-40 à -60% fréquentation';
    impact_cat.boulangerie  = '+10% (achats de précaution, pains gros grammage)';
    impact_cat.viennoiserie = '+10% (réconfort)';
    impact_cat.patisserie   = '-20%';
    impact_cat.sandwich     = '-30%';
    conseils.push('🌨️ NEIGE FORTE — Effondrement fréquentation -40-60%. Réduire production fortement.');
    conseils.push('La boulangerie reste "commerce essentiel" — les clients qui viennent achètent des pains de précaution (gros pains, pain de mie).');
  }

  // ── Humidité → impact sur conservation ───────────────────
  if (actuelle.humidite_pct > 75) {
    conseils.push(`💧 Humidité élevée (${actuelle.humidite_pct}%) — les pains ramollissent plus vite. Privilégier plusieurs petites fournées pour garantir le croustillant.`);
  }

  // ── Brouillard ────────────────────────────────────────────
  if ([45,48].includes(demain.code_meteo)) {
    conseils.push('🌫️ Brouillard prévu — circulation ralentie, fréquentation décalée. Rush matinal étalé sur 7h30-10h.');
  }

  const impact_global = pluieForte || orageDemain
    ? `Journée difficile (pluie forte/orage ${demain.icone}) — réduire production, prévoir flash anti-gaspi`
    : pluieLegere
      ? `Pluie légère — hausse réconfort, panier moyen en hausse ${demain.icone}`
      : neigeForte
        ? `Neige forte — réduire fortement la production ${demain.icone}`
        : neigeLegere
          ? `Neige légère — ambiance positive, hausse viennoiseries ${demain.icone}`
          : caniculeDemain
            ? `CANICULE — réduire produits lourds, miser sur le frais ${demain.icone}`
            : chaudDemain
              ? `Chaleur — adapter vers produits légers ${demain.icone}`
              : froidDemain
                ? `Froid intense — viennoiseries chaudes +20%, réconfort ${demain.icone}`
                : soleilDemain && tempDoux
                  ? `Conditions idéales — meilleure météo pour la boulangerie ${demain.icone}`
                  : `Conditions météo standard ${demain.icone}`;

  return { impact_global, conseils, facteur_trafic: facteur, impact_par_categorie: impact_cat };
}