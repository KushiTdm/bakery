// scripts/gemini-security-review.js
// Analyse les fichiers API modifiés dans un PR avec Gemini 2.5 Flash
// Usage : CHANGED_FILES="app/api/..." GEMINI_API_KEY="..." node scripts/gemini-security-review.js

const fs = require("fs");
const path = require("path");

const GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const CHANGED_FILES_RAW = process.env.CHANGED_FILES || "";
const PR_TITLE = process.env.PR_TITLE || "PR sans titre";

if (!GEMINI_API_KEY) {
  console.warn(
    "[gemini-review] GEMINI_API_KEY non configurée — génération d'un rapport vide"
  );
  fs.writeFileSync(
    "security-review.md",
    "## ⚠️ Review IA non disponible\n\nGEMINI_API_KEY non configurée dans les secrets GitHub."
  );
  process.exit(0);
}

// Fichiers à analyser (max 15 pour ne pas dépasser le contexte)
const changedFiles = CHANGED_FILES_RAW.split(",")
  .map((f) => f.trim())
  .filter(Boolean)
  .slice(0, 15);

if (changedFiles.length === 0) {
  console.log("[gemini-review] Aucun fichier API modifié — pas de review");
  fs.writeFileSync(
    "security-review.md",
    "## ✅ Aucun fichier API modifié\n\nPas de review de sécurité nécessaire pour cette PR."
  );
  process.exit(0);
}

console.log(`[gemini-review] Analyse de ${changedFiles.length} fichier(s) :`, changedFiles);

// Lire le contenu des fichiers modifiés
function readFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    // Limiter à 6000 chars par fichier pour ne pas exploser le contexte
    return content.slice(0, 6000) + (content.length > 6000 ? "\n// ... [tronqué]" : "");
  } catch {
    return `// Fichier non lisible ou supprimé : ${filePath}`;
  }
}

const fileContents = changedFiles
  .map(
    (f) =>
      `\n\n### \`${f}\`\n\`\`\`typescript\n${readFile(f)}\n\`\`\``
  )
  .join("");

// Contexte du projet pour que Gemini comprenne l'architecture
const PROJECT_CONTEXT = `
Architecture Sauve Mie (Next.js + Supabase, SaaS boulangerie multi-tenant) :
- Auth boulanger : JWT Bearer (localStorage) via getBoulangerSession() dans lib/auth-boulanger.ts
- Multi-tenant : chaque table a un boulangerie_id — JAMAIS récupérer sans filtrer par boulangerie_id
- Rôles : owner > gerant > employe — vérifiés via canAccess(session, feature, level)
- Clients : Supabase anon key + JWT
- Rate limiting : isMemoryRateLimited() (IP) + isSupabaseRateLimited() (email)
- Validation inputs : Zod obligatoire sur toutes les routes POST/PATCH
- RPC Supabase atomiques pour les opérations critiques (stock, quota IA)

Vulnérabilités fréquentes dans ce projet :
1. Auth locale au lieu de getBoulangerSession() → les employés reçoivent 401
2. Oubli du filtre boulangerie_id → fuite de données inter-tenant
3. Input non validé par Zod → injection, type confusion
4. Race condition sur le stock (non-atomique)
5. Race condition sur le quota IA (check_and_increment non-atomique)
6. Upload photo réservé owner uniquement alors que gérants devraient y accéder
7. Rate limiting in-process inefficace en serverless (pas Upstash)
`;

// Prompt pour Gemini
const prompt = `Tu es un auditeur de sécurité expert en Next.js, Supabase et architectures multi-tenant SaaS.

${PROJECT_CONTEXT}

PR analysée : "${PR_TITLE}"

Analyse les fichiers modifiés ci-dessous pour détecter des vulnérabilités de sécurité.
Concentre-toi sur les problèmes RÉELS, pas les bonnes pratiques théoriques.

Fichiers modifiés :${fileContents}

Réponds UNIQUEMENT en Markdown avec ce format exact :

## 🔒 Analyse Sécurité — ${PR_TITLE}

### Fichiers analysés
${changedFiles.map((f) => `- \`${f}\``).join("\n")}

### Risques identifiés

Pour chaque risque, utilise ce format :
#### 🔴 [CRITIQUE] ou 🟠 [ÉLEVÉ] ou 🟡 [MOYEN] ou 🔵 [FAIBLE] — Nom du risque
**Fichier** : \`chemin/vers/fichier.ts\`
**Problème** : Description précise
**Impact** : Ce qu'un attaquant peut faire
**Correction** : Code ou direction technique précise

### Tests Playwright à ajouter obligatoirement
Liste les tests manquants sous forme de commentaires \`// test('...', ...)\`

### Verdict final
✅ **Sûr à merger** | ⚠️ **Vérifier avant merge** | 🚨 **NE PAS merger**

Raison du verdict en 1-2 phrases.

---
*Analysé par Gemini 2.5 Flash — revue automatique, pas un audit exhaustif*`;

async function analyzeWithGemini() {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

  const body = {
    contents: [
      {
        parts: [{ text: prompt }],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 4096,
    },
    safetySettings: [
      {
        category: "HARM_CATEGORY_DANGEROUS_CONTENT",
        threshold: "BLOCK_NONE",
      },
    ],
  };

  console.log(`[gemini-review] Appel API Gemini (${GEMINI_MODEL})...`);

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`Gemini API HTTP ${response.status}: ${errorText.slice(0, 300)}`);
  }

  const data = await response.json();

  // Extraire le texte de la réponse Gemini
  const text =
    data?.candidates?.[0]?.content?.parts?.[0]?.text ||
    data?.candidates?.[0]?.output ||
    "";

  if (!text) {
    throw new Error("Réponse Gemini vide ou format inattendu : " + JSON.stringify(data).slice(0, 200));
  }

  return text;
}

// Main
(async () => {
  try {
    const report = await analyzeWithGemini();
    fs.writeFileSync("security-review.md", report);
    console.log("[gemini-review] ✅ Rapport généré (security-review.md)");
    console.log("[gemini-review] Aperçu :", report.slice(0, 300));
  } catch (err) {
    console.error("[gemini-review] ❌ Erreur :", err.message);
    // Écrire un rapport d'erreur non-bloquant
    fs.writeFileSync(
      "security-review.md",
      `## ⚠️ Analyse Gemini indisponible\n\nErreur : ${err.message}\n\nEffectuer une revue manuelle des fichiers modifiés.`
    );
    // Ne pas faire échouer le workflow — la review IA est informationnelle
    process.exit(0);
  }
})();