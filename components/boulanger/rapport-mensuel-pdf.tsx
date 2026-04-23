// components/boulanger/rapport-mensuel-pdf.tsx
// ─────────────────────────────────────────────────────────────
// Rendu PDF du rapport mensuel via @react-pdf/renderer.
// Utilisé server-side uniquement (route /pdf), runtime=nodejs.
// Les graphes sont redessinés en SVG primitives natives (pas de Recharts).
// ─────────────────────────────────────────────────────────────

import { Document, Page, View, Text, StyleSheet, Svg, Line, Rect, Path, G } from '@react-pdf/renderer';

// ── Types ─────────────────────────────────────────────────────

interface RapportRow {
  id: string;
  mois_reference: string;
  score_performance: number | null;
  verdict_flash: string | null;
  rapport_json: Record<string, unknown>;
  created_at: string;
}

interface Props {
  rapport:         RapportRow;
  nomBoulangerie:  string;
  ville:           string | null;
}

// ── Styles ────────────────────────────────────────────────────

const COLORS = {
  primary:   '#C19A6B',   // beige doré
  dark:      '#2C1810',   // brun foncé
  success:   '#4ADE80',
  warning:   '#F5A623',
  danger:    '#EF4444',
  text:      '#1F2937',
  textLight: '#6B7280',
  border:    '#E5E7EB',
  bgSoft:    '#FAF7F2',
};

const styles = StyleSheet.create({
  page: {
    paddingTop:     40,
    paddingBottom:  50,
    paddingHorizontal: 40,
    fontSize:       10,
    color:          COLORS.text,
    fontFamily:     'Helvetica',
    backgroundColor: '#FFFFFF',
  },
  header: {
    borderBottomWidth: 2,
    borderBottomColor: COLORS.primary,
    paddingBottom:  12,
    marginBottom:   20,
  },
  brand: {
    fontSize:   9,
    color:      COLORS.primary,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  title: {
    fontSize:   22,
    fontFamily: 'Times-Roman',
    color:      COLORS.dark,
    marginBottom: 2,
  },
  subtitle: {
    fontSize:   10,
    color:      COLORS.textLight,
  },
  scoreBlock: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    backgroundColor: COLORS.bgSoft,
    padding:        14,
    borderRadius:   6,
    marginBottom:   18,
  },
  scoreNum: {
    fontSize:   36,
    fontFamily: 'Times-Roman',
    color:      COLORS.primary,
  },
  scoreLabel: {
    fontSize:   9,
    color:      COLORS.textLight,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  verdict: {
    fontSize:   12,
    fontFamily: 'Times-Italic',
    color:      COLORS.dark,
    flex:       1,
    marginLeft: 20,
  },
  sectionTitle: {
    fontSize:   13,
    fontFamily: 'Times-Bold',
    color:      COLORS.dark,
    marginTop:  16,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.primary,
    paddingLeft: 8,
  },
  paragraph: {
    fontSize:     10,
    lineHeight:   1.5,
    marginBottom: 6,
    color:        COLORS.text,
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    marginHorizontal: -4,
    marginBottom:  8,
  },
  kpiCard: {
    width:         '33.33%',
    paddingHorizontal: 4,
    marginBottom:  8,
  },
  kpiInner: {
    backgroundColor: COLORS.bgSoft,
    padding:         8,
    borderRadius:    4,
  },
  kpiLabel: {
    fontSize:      8,
    color:         COLORS.textLight,
    textTransform: 'uppercase',
    marginBottom:  2,
  },
  kpiValue: {
    fontSize:   13,
    fontFamily: 'Helvetica-Bold',
    color:      COLORS.dark,
  },
  table: {
    borderWidth:      1,
    borderColor:      COLORS.border,
    borderRadius:     4,
    marginBottom:     8,
  },
  tableRow: {
    flexDirection:    'row',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingVertical:  5,
    paddingHorizontal: 6,
  },
  tableRowLast: {
    flexDirection:    'row',
    paddingVertical:  5,
    paddingHorizontal: 6,
  },
  tableHeader: {
    backgroundColor: COLORS.bgSoft,
    fontFamily:      'Helvetica-Bold',
    fontSize:        9,
    color:           COLORS.textLight,
    textTransform:   'uppercase',
  },
  tableCell: {
    fontSize: 9,
    flex:     1,
  },
  axeItem: {
    backgroundColor: COLORS.bgSoft,
    padding:         8,
    borderRadius:    4,
    marginBottom:    6,
    borderLeftWidth: 3,
  },
  axeTitle: {
    fontSize:   11,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 3,
    color:      COLORS.dark,
  },
  axeText: {
    fontSize:   9,
    lineHeight: 1.4,
    color:      COLORS.text,
    marginBottom: 2,
  },
  axeLabel: {
    fontFamily: 'Helvetica-Bold',
    color:      COLORS.textLight,
  },
  footer: {
    position:  'absolute',
    bottom:    20,
    left:      40,
    right:     40,
    fontSize:  8,
    color:     COLORS.textLight,
    textAlign: 'center',
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 8,
  },
  chartWrap: {
    marginTop:    4,
    marginBottom: 10,
  },
  bullet: {
    flexDirection: 'row',
    marginBottom:  3,
  },
  bulletDot: {
    width:        10,
    fontFamily:   'Helvetica-Bold',
    color:        COLORS.primary,
  },
  bulletText: {
    flex:       1,
    fontSize:   10,
    lineHeight: 1.4,
  },
});

// ── Helpers ───────────────────────────────────────────────────

function fmtEuro(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  return `${v.toLocaleString('fr-FR')} €`;
}

function fmtPct(n: number | null | undefined, signed = false): string {
  if (n == null) return 'n/a';
  const sign = signed && n > 0 ? '+' : '';
  return `${sign}${n}%`;
}

function priorityColor(p: string | undefined): string {
  if (p === 'high')   return COLORS.danger;
  if (p === 'medium') return COLORS.warning;
  return COLORS.success;
}

function priorityLabel(p: string | undefined): string {
  if (p === 'high')   return 'Priorité haute';
  if (p === 'medium') return 'Priorité moyenne';
  return 'Priorité basse';
}

// ── Graphe Line Chart SVG natif ───────────────────────────────

interface LineChartPoint { x: number; y: number }

function buildLinePath(points: LineChartPoint[]): string {
  if (points.length === 0) return '';
  const [first, ...rest] = points;
  let d = `M ${first.x} ${first.y}`;
  for (const p of rest) d += ` L ${p.x} ${p.y}`;
  return d;
}

function EvolutionChart({ data, width, height, color, valueKey }: {
  data: Array<{ date: string; ca?: number; taux?: number }>;
  width: number;
  height: number;
  color: string;
  valueKey: 'ca' | 'taux';
}) {
  if (data.length === 0) {
    return (
      <Svg width={width} height={height}>
        <Rect x={0} y={0} width={width} height={height} fill={COLORS.bgSoft} />
      </Svg>
    );
  }
  const padL = 28;
  const padR = 8;
  const padT = 8;
  const padB = 20;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const values = data.map(d => Number(d[valueKey] ?? 0));
  const maxV = Math.max(...values, 1);
  const minV = 0;

  const points: LineChartPoint[] = data.map((d, i) => {
    const x = padL + (data.length === 1 ? innerW / 2 : (i / (data.length - 1)) * innerW);
    const v = Number(d[valueKey] ?? 0);
    const y = padT + innerH - ((v - minV) / (maxV - minV || 1)) * innerH;
    return { x, y };
  });

  const path = buildLinePath(points);

  const gridLines = [0, 0.25, 0.5, 0.75, 1].map(r => {
    const y = padT + innerH - r * innerH;
    return { y, label: Math.round(maxV * r).toString() };
  });

  return (
    <Svg width={width} height={height}>
      <Rect x={0} y={0} width={width} height={height} fill="#FFFFFF" stroke={COLORS.border} strokeWidth={0.5} />
      {gridLines.map((g, i) => (
        <G key={i}>
          <Line x1={padL} y1={g.y} x2={width - padR} y2={g.y} stroke={COLORS.border} strokeWidth={0.5} />
          <Text x={2} y={g.y + 3} style={{ fontSize: 6, fill: COLORS.textLight }}>{g.label}</Text>
        </G>
      ))}
      <Path d={path} stroke={color} strokeWidth={1.5} fill="none" />
      {points.map((p, i) => (
        <Rect key={i} x={p.x - 1} y={p.y - 1} width={2} height={2} fill={color} />
      ))}
    </Svg>
  );
}

// ── Composant principal ───────────────────────────────────────

export default function RapportMensuelPdf({ rapport, nomBoulangerie, ville }: Props) {
  const j = (rapport.rapport_json ?? {}) as Record<string, unknown>;
  const score  = rapport.score_performance ?? (j.score_global as number | undefined) ?? 0;
  const verdict = rapport.verdict_flash ?? (j.verdict_mensuel as string | undefined) ?? '';
  const moisLabel = (j.mois_label as string | undefined) ?? rapport.mois_reference;
  const encourage = (j.message_encouragement as string | undefined) ?? '';
  const messageFinal = (j.message_final as string | undefined) ?? '';

  const kpis = (j.kpis_mois as Record<string, unknown> | undefined) ?? {};
  const kpisResume = (j.kpis_resume as Record<string, string> | undefined) ?? {};
  const comparaison = (j.comparaison_m_precedent as Record<string, unknown> | undefined) ?? {};

  const topProduits = (j.top_produits as Array<{ nom: string; emoji: string; ca_estime: number; total_vendu: number; taux_invendu: number }> | undefined) ?? [];
  const sousPerf    = (j.produits_sous_performants as Array<{ nom: string; emoji: string; taux_invendu: number; total_production: number }> | undefined) ?? [];
  const jourSemaine = (j.jour_semaine_analyse as Array<{ jour_label: string; ca_moyen: number; invendus_pct: number; n: number }> | undefined) ?? [];

  const axes = (j.axes_amelioration as Array<{ priorite: string; titre: string; pourquoi: string; comment: string }> | undefined) ?? [];
  const recos = (j.recommandations_macro as Array<{ priorite: string; titre: string; action: string }> | undefined) ?? [];

  const quartier = (j.contexte_quartier as Record<string, unknown> | undefined) ?? null;

  const evolCa = (j.evolution_ca as Array<{ date: string; ca: number }> | undefined) ?? [];
  const evolInv = (j.evolution_invendus as Array<{ date: string; taux: number }> | undefined) ?? [];

  return (
    <Document>
      {/* ── Page 1 : synthèse + KPIs + comparaison ── */}
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.brand}>Levain · Rapport mensuel</Text>
          <Text style={styles.title}>{nomBoulangerie}</Text>
          <Text style={styles.subtitle}>
            {ville ? `${ville} — ` : ''}{moisLabel}
          </Text>
        </View>

        <View style={styles.scoreBlock}>
          <View>
            <Text style={styles.scoreLabel}>Score global</Text>
            <Text style={styles.scoreNum}>{score}<Text style={{ fontSize: 14, color: COLORS.textLight }}>/100</Text></Text>
          </View>
          <Text style={styles.verdict}>« {verdict} »</Text>
        </View>

        {encourage ? (
          <View>
            <Text style={styles.sectionTitle}>Message du mois</Text>
            <Text style={styles.paragraph}>{encourage}</Text>
          </View>
        ) : null}

        <Text style={styles.sectionTitle}>KPIs — {moisLabel}</Text>
        <View style={styles.kpiGrid}>
          <View style={styles.kpiCard}>
            <View style={styles.kpiInner}>
              <Text style={styles.kpiLabel}>CA total</Text>
              <Text style={styles.kpiValue}>{fmtEuro(kpis.ca_total as number)}</Text>
            </View>
          </View>
          <View style={styles.kpiCard}>
            <View style={styles.kpiInner}>
              <Text style={styles.kpiLabel}>CA moyen/jour</Text>
              <Text style={styles.kpiValue}>{fmtEuro(kpis.ca_moyen_jour as number)}</Text>
            </View>
          </View>
          <View style={styles.kpiCard}>
            <View style={styles.kpiInner}>
              <Text style={styles.kpiLabel}>Invendus moyens</Text>
              <Text style={styles.kpiValue}>{fmtPct(kpis.taux_invendu_moyen as number)}</Text>
            </View>
          </View>
          <View style={styles.kpiCard}>
            <View style={styles.kpiInner}>
              <Text style={styles.kpiLabel}>Jours clôturés</Text>
              <Text style={styles.kpiValue}>{(kpis.jours_cloturee as number | undefined) ?? 0}/{(kpis.jours_total as number | undefined) ?? 0}</Text>
            </View>
          </View>
          <View style={styles.kpiCard}>
            <View style={styles.kpiInner}>
              <Text style={styles.kpiLabel}>Commandes en ligne</Text>
              <Text style={styles.kpiValue}>{(kpis.commandes_online_total as number | undefined) ?? 0}</Text>
            </View>
          </View>
          <View style={styles.kpiCard}>
            <View style={styles.kpiInner}>
              <Text style={styles.kpiLabel}>Paniers flash</Text>
              <Text style={styles.kpiValue}>{(kpis.paniers_flash_vendus as number | undefined) ?? 0}</Text>
            </View>
          </View>
        </View>

        {kpisResume.ca_commentaire ? (
          <View style={styles.bullet}>
            <Text style={styles.bulletDot}>—</Text>
            <Text style={styles.bulletText}>{kpisResume.ca_commentaire}</Text>
          </View>
        ) : null}
        {kpisResume.invendus_commentaire ? (
          <View style={styles.bullet}>
            <Text style={styles.bulletDot}>—</Text>
            <Text style={styles.bulletText}>{kpisResume.invendus_commentaire}</Text>
          </View>
        ) : null}
        {kpisResume.cloture_commentaire ? (
          <View style={styles.bullet}>
            <Text style={styles.bulletDot}>—</Text>
            <Text style={styles.bulletText}>{kpisResume.cloture_commentaire}</Text>
          </View>
        ) : null}

        <Text style={styles.sectionTitle}>Comparaison mois précédent</Text>
        <View style={styles.kpiGrid}>
          <View style={styles.kpiCard}>
            <View style={styles.kpiInner}>
              <Text style={styles.kpiLabel}>CA</Text>
              <Text style={styles.kpiValue}>{fmtPct(comparaison.ca_delta_pct as number | null, true)}</Text>
            </View>
          </View>
          <View style={styles.kpiCard}>
            <View style={styles.kpiInner}>
              <Text style={styles.kpiLabel}>Invendus</Text>
              <Text style={styles.kpiValue}>{fmtPct(comparaison.invendus_delta_pct as number | null, true)}</Text>
            </View>
          </View>
          <View style={styles.kpiCard}>
            <View style={styles.kpiInner}>
              <Text style={styles.kpiLabel}>Commandes</Text>
              <Text style={styles.kpiValue}>{fmtPct(comparaison.commandes_delta_pct as number | null, true)}</Text>
            </View>
          </View>
        </View>
        {comparaison.commentaire ? (
          <Text style={styles.paragraph}>{comparaison.commentaire as string}</Text>
        ) : null}

        {evolCa.length > 1 ? (
          <View>
            <Text style={styles.sectionTitle}>Évolution du CA sur le mois</Text>
            <View style={styles.chartWrap}>
              <EvolutionChart data={evolCa} width={520} height={100} color={COLORS.primary} valueKey="ca" />
            </View>
          </View>
        ) : null}

        <Text style={styles.footer} render={({ pageNumber, totalPages }) => `${nomBoulangerie} — ${moisLabel}   ·   Page ${pageNumber}/${totalPages}`} fixed />
      </Page>

      {/* ── Page 2 : produits + jour semaine + invendus chart ── */}
      <Page size="A4" style={styles.page}>
        <Text style={styles.sectionTitle}>Top 5 produits</Text>
        {j.analyse_top_produits ? (
          <Text style={styles.paragraph}>{j.analyse_top_produits as string}</Text>
        ) : null}
        <View style={styles.table}>
          <View style={[styles.tableRow, styles.tableHeader]}>
            <Text style={[styles.tableCell, { flex: 2 }]}>Produit</Text>
            <Text style={styles.tableCell}>CA</Text>
            <Text style={styles.tableCell}>Vendus</Text>
            <Text style={styles.tableCell}>Invendus</Text>
          </View>
          {topProduits.length === 0 ? (
            <View style={styles.tableRowLast}>
              <Text style={[styles.tableCell, { flex: 5, color: COLORS.textLight }]}>Données insuffisantes</Text>
            </View>
          ) : topProduits.map((p, i) => (
            <View key={i} style={i === topProduits.length - 1 ? styles.tableRowLast : styles.tableRow}>
              <Text style={[styles.tableCell, { flex: 2 }]}>{p.emoji} {p.nom}</Text>
              <Text style={styles.tableCell}>{fmtEuro(p.ca_estime)}</Text>
              <Text style={styles.tableCell}>{p.total_vendu}</Text>
              <Text style={styles.tableCell}>{fmtPct(p.taux_invendu)}</Text>
            </View>
          ))}
        </View>

        {sousPerf.length > 0 ? (
          <View>
            <Text style={styles.sectionTitle}>Produits à surveiller</Text>
            {j.analyse_sous_performants ? (
              <Text style={styles.paragraph}>{j.analyse_sous_performants as string}</Text>
            ) : null}
            <View style={styles.table}>
              <View style={[styles.tableRow, styles.tableHeader]}>
                <Text style={[styles.tableCell, { flex: 2 }]}>Produit</Text>
                <Text style={styles.tableCell}>Invendus</Text>
                <Text style={styles.tableCell}>Production</Text>
              </View>
              {sousPerf.map((p, i) => (
                <View key={i} style={i === sousPerf.length - 1 ? styles.tableRowLast : styles.tableRow}>
                  <Text style={[styles.tableCell, { flex: 2 }]}>{p.emoji} {p.nom}</Text>
                  <Text style={[styles.tableCell, { color: COLORS.danger }]}>{fmtPct(p.taux_invendu)}</Text>
                  <Text style={styles.tableCell}>{p.total_production}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {jourSemaine.length > 0 ? (
          <View>
            <Text style={styles.sectionTitle}>Analyse par jour de la semaine</Text>
            {j.analyse_jour_semaine ? (
              <Text style={styles.paragraph}>{j.analyse_jour_semaine as string}</Text>
            ) : null}
            <View style={styles.table}>
              <View style={[styles.tableRow, styles.tableHeader]}>
                <Text style={[styles.tableCell, { flex: 2 }]}>Jour</Text>
                <Text style={styles.tableCell}>CA moyen</Text>
                <Text style={styles.tableCell}>Invendus</Text>
                <Text style={styles.tableCell}>Observations</Text>
              </View>
              {jourSemaine.map((d, i) => (
                <View key={i} style={i === jourSemaine.length - 1 ? styles.tableRowLast : styles.tableRow}>
                  <Text style={[styles.tableCell, { flex: 2 }]}>{d.jour_label}</Text>
                  <Text style={styles.tableCell}>{fmtEuro(d.ca_moyen)}</Text>
                  <Text style={styles.tableCell}>{fmtPct(d.invendus_pct)}</Text>
                  <Text style={styles.tableCell}>n={d.n}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        {evolInv.length > 1 ? (
          <View>
            <Text style={styles.sectionTitle}>Évolution du taux d'invendus</Text>
            <View style={styles.chartWrap}>
              <EvolutionChart data={evolInv} width={520} height={100} color={COLORS.warning} valueKey="taux" />
            </View>
          </View>
        ) : null}

        <Text style={styles.footer} render={({ pageNumber, totalPages }) => `${nomBoulangerie} — ${moisLabel}   ·   Page ${pageNumber}/${totalPages}`} fixed />
      </Page>

      {/* ── Page 3 : axes, recos, quartier ── */}
      <Page size="A4" style={styles.page}>
        {axes.length > 0 ? (
          <View>
            <Text style={styles.sectionTitle}>Axes d'amélioration</Text>
            {axes.map((a, i) => (
              <View key={i} style={[styles.axeItem, { borderLeftColor: priorityColor(a.priorite) }]}>
                <Text style={[styles.axeLabel, { fontSize: 8, color: priorityColor(a.priorite), marginBottom: 3 }]}>
                  {priorityLabel(a.priorite)}
                </Text>
                <Text style={styles.axeTitle}>{a.titre}</Text>
                <Text style={styles.axeText}>
                  <Text style={styles.axeLabel}>Pourquoi : </Text>{a.pourquoi}
                </Text>
                <Text style={styles.axeText}>
                  <Text style={styles.axeLabel}>Comment : </Text>{a.comment}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {recos.length > 0 ? (
          <View>
            <Text style={styles.sectionTitle}>Recommandations macro</Text>
            {recos.map((r, i) => (
              <View key={i} style={[styles.axeItem, { borderLeftColor: priorityColor(r.priorite) }]}>
                <Text style={[styles.axeLabel, { fontSize: 8, color: priorityColor(r.priorite), marginBottom: 3 }]}>
                  {priorityLabel(r.priorite)}
                </Text>
                <Text style={styles.axeTitle}>{r.titre}</Text>
                <Text style={styles.axeText}>{r.action}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {quartier ? (
          <View>
            <Text style={styles.sectionTitle}>Contexte quartier</Text>
            {quartier.lecture ? <Text style={styles.paragraph}>{quartier.lecture as string}</Text> : null}
            {quartier.type_quartier ? (
              <Text style={styles.paragraph}>
                <Text style={styles.axeLabel}>Type : </Text>{quartier.type_quartier as string}
                {quartier.population_estimee_rayon_500m ? ` — ~${quartier.population_estimee_rayon_500m} habitants à 500m` : ''}
              </Text>
            ) : null}
            {quartier.opportunite_positionnement ? (
              <Text style={styles.paragraph}>
                <Text style={styles.axeLabel}>Opportunité : </Text>{quartier.opportunite_positionnement as string}
              </Text>
            ) : null}
            {quartier.veille_concurrentielle ? (
              <Text style={styles.paragraph}>
                <Text style={styles.axeLabel}>Concurrence : </Text>{quartier.veille_concurrentielle as string}
              </Text>
            ) : null}
            {Array.isArray(quartier.concurrents_directs) && (quartier.concurrents_directs as unknown[]).length > 0 ? (
              <View style={styles.table}>
                <View style={[styles.tableRow, styles.tableHeader]}>
                  <Text style={[styles.tableCell, { flex: 2 }]}>Concurrent</Text>
                  <Text style={styles.tableCell}>Distance</Text>
                  <Text style={styles.tableCell}>Note</Text>
                  <Text style={styles.tableCell}>Avis</Text>
                </View>
                {(quartier.concurrents_directs as Array<{ nom: string; distance_m: number; note_google: number | null; nombre_avis: number | null }>).slice(0, 6).map((c, i, arr) => (
                  <View key={i} style={i === arr.length - 1 ? styles.tableRowLast : styles.tableRow}>
                    <Text style={[styles.tableCell, { flex: 2 }]}>{c.nom}</Text>
                    <Text style={styles.tableCell}>{c.distance_m} m</Text>
                    <Text style={styles.tableCell}>{c.note_google != null ? `${c.note_google}/5` : '—'}</Text>
                    <Text style={styles.tableCell}>{c.nombre_avis ?? '—'}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        ) : null}

        {messageFinal ? (
          <View style={{ marginTop: 20, padding: 12, backgroundColor: COLORS.bgSoft, borderRadius: 6 }}>
            <Text style={{ fontFamily: 'Times-Italic', fontSize: 11, lineHeight: 1.5, textAlign: 'center', color: COLORS.dark }}>
              « {messageFinal} »
            </Text>
          </View>
        ) : null}

        <Text style={styles.footer} render={({ pageNumber, totalPages }) => `${nomBoulangerie} — ${moisLabel}   ·   Page ${pageNumber}/${totalPages}`} fixed />
      </Page>
    </Document>
  );
}
