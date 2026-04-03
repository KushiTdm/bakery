// Debug: check flash paniers and RPC interaction
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config({ path: '.env' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function main() {
  const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Paris' });
  console.log('Today (Europe/Paris):', today);

  // Check all flash paniers for today
  const { data: flashPaniers, error: fErr } = await supabase
    .from('paniers_flash')
    .select('id, boulangerie_id, date, produit_id, produit_nom, quantite_initiale, quantite_restante, actif')
    .eq('date', today)
    .limit(10);

  console.log('Flash paniers today:', flashPaniers?.length, fErr?.message);
  if (flashPaniers?.length) {
    console.log('Flash sample:', flashPaniers[0]);

    // Check if there's a matching journée
    const bid = flashPaniers[0].boulangerie_id;
    const { data: j } = await supabase.from('journees').select('id').eq('boulangerie_id', bid).eq('date', today).single();
    console.log('Journée for this boulangerie:', j);

    if (j) {
      const { data: stocks } = await supabase
        .from('stocks_journaliers')
        .select('produit_id, produit_nom, production')
        .eq('journee_id', j.id);
      console.log('Stocks:', stocks);

      // Call RPC asking for more than available
      const pid = flashPaniers[0].produit_id;
      const pnom = flashPaniers[0].produit_nom;
      const flashQty = flashPaniers[0].quantite_initiale;
      const prod = stocks?.find(s => s.produit_id === pid)?.production ?? 0;

      console.log(`\nFlash reserves ${flashQty}, production=${prod}`);
      console.log(`Asking for ${prod - flashQty + 1} (should fail)`);

      const { data, error } = await supabase.rpc('verifier_stock_commande', {
        p_boulangerie_id: bid,
        p_date: today,
        p_lignes: [{ produit_id: pid, produit_nom: pnom, quantite: prod - flashQty + 1 }],
        p_timezone: 'Europe/Paris',
      });
      console.log('RPC result:', { data, error: error ? { code: error.code, message: error.message } : null });
    }
  }

  // Also check: recent paniers_flash dates to see if they're stored with wrong dates
  const { data: recentFlash } = await supabase
    .from('paniers_flash')
    .select('date, boulangerie_id, produit_nom, actif')
    .order('created_at', { ascending: false })
    .limit(5);
  console.log('\nRecent flash paniers (any date):', recentFlash);
}

main().catch(console.error);
