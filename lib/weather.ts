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

export function analyserImpactMeteo(meteo: MeteoComplet): {
  impact_global:    string;
  conseils:         string[];
  facteur_trafic:   string;  // "+10-15%", "-5%", "stable", etc.
} {
  const { actuelle, demain } = meteo;
  const conseils: string[] = [];
  let facteur = 'stable';

  // ── Pluie / mauvais temps → impact positif boulangerie ───
  const pluieDemain = demain.precip_mm > 2 || [51,53,55,61,63,65,80,81,82,95,96,99].includes(demain.code_meteo);
  const soleilDemain = [0,1].includes(demain.code_meteo);
  const froidDemain = demain.temp_max_c < 12;
  const chaudDemain = demain.temp_max_c > 26;

  if (pluieDemain) {
    facteur = '+10 à +20%';
    conseils.push(`${demain.icone} Pluie prévue demain (${demain.precip_mm}mm) → les clients restent dedans. Viennoiseries et pains chauds en hausse, prévoir +15% sur viennoiserie.`);
    conseils.push('Préparer plus de chocolatines, croissants et pains chauds — la pluie augmente la demande de réconfort.');
  }
  if (soleilDemain && !froidDemain) {
    facteur = '-5 à +5%';
    conseils.push(`${demain.icone} Beau temps prévu — les clients sont pressés. Favoriser les formats emporter (sandwichs, viennoiseries individuelles).`);
  }
  if (froidDemain) {
    conseils.push(`🌡️ Froid prévu (max ${demain.temp_max_c}°C) → augmenter les pains de mie, brioches et viennoiseries chaudes.`);
    if (!pluieDemain) facteur = '+5 à +10%';
  }
  if (chaudDemain) {
    conseils.push(`🌡️ Chaleur prévue (max ${demain.temp_max_c}°C) → réduire les viennoiseries lourdes, favoriser baguettes et produits légers.`);
    facteur = '-5 à -10% sur viennoiserie';
  }

  // ── Humidité → impact sur conservation ───────────────────
  if (actuelle.humidite_pct > 75) {
    conseils.push(`💧 Humidité élevée (${actuelle.humidite_pct}%) — les pains ramollissent plus vite. Étaler la cuisson en 2 fournées plutôt qu'une seule.`);
  }

  const impact_global = pluieDemain
    ? `Journée favorable pour la boulangerie (pluie prévue ${demain.icone})`
    : soleilDemain && chaudDemain
      ? `Beau temps chaud — adapter la production vers les produits légers ${demain.icone}`
      : froidDemain
        ? `Temps froid — privilégier les produits chauds et réconfortants ${demain.icone}`
        : `Conditions météo standard ${demain.icone}`;

  return { impact_global, conseils, facteur_trafic: facteur };
}