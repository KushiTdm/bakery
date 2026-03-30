# 🎬 BakeryOS — Stratégie Publicité Vidéo

> Format : Publicité sociale 60 secondes + version courte 15 secondes  
> Plateforme cible : TikTok, Instagram Reels, YouTube Shorts  
> Génération vidéo : Google Veo 3 via Vertex AI  
> Génération images : Nano Banana (frames de départ / fin)  
> Voix off : ElevenLabs (Text-to-Speech + Sound Effects)

---

## 🎯 Objectif de la publicité

**Message central :** "Tu sais faire le pain. BakeryOS s'occupe du reste."  
**Cible :** Boulanger artisanal 30-55 ans, France, fatigué du gaspillage et du tâtonnement quotidien  
**Émotion recherchée :** Soulagement → Curiosité → Confiance  
**CTA final :** "Essai gratuit — artisandore.fr"

---

## 🎙️ Configuration ElevenLabs — Voix off

### Choix de la voix

| Paramètre | Valeur recommandée |
|---|---|
| **Voix** | `Antoine` (voix masculine française, chaleureuse, mature) ou `Luca` en fallback |
| **Modèle** | `eleven_multilingual_v2` (meilleure qualité pour le français) |
| **Langue** | `fr` |
| **Stability** | `0.55` — légèrement stable pour conserver le naturel sans monotonie |
| **Similarity Boost** | `0.80` — haute fidélité à la voix sélectionnée |
| **Style** | `0.35` — expressivité modérée, ton artisanal sans surjeu |
| **Speaker Boost** | `true` — améliore la clarté sur mobile |

### Tonalité par séquence

| Séquence | Ton | Rythme | Émotion |
|---|---|---|---|
| S2 | Grave, posé, empathique | Lent — 0,90x | Compréhension, reconnexion |
| S3 | Légère montée d'intrigue | Normal — 1,00x | Curiosité, tournant |
| S4 | Confiant, informatif | Normal — 1,00x | Clarté, assurance |
| S5 | Dynamique, légèrement enjoué | Légèrement rapide — 1,05x | Énergie, soulagement |
| S6 | Ancré, conclusif, chaleureux | Lent — 0,92x | Confiance, invitation |

---

## 🎙️ Textes voix off — Prêts pour ElevenLabs

### Fichier S2 — `voix_s2.txt`

```
Chaque soir... la même question.
Combien j'aurais dû produire ?
```

> **Notes d'interprétation ElevenLabs :**
> Pause naturelle après "soir" (3 points de suspension = pause longue).
> Descente légère sur "produire ?" malgré le point d'interrogation — c'est une lamentation, pas une vraie question.

**Paramètres API ElevenLabs S2 :**
```json
{
  "text": "Chaque soir... la même question.\nCombien j'aurais dû produire ?",
  "model_id": "eleven_multilingual_v2",
  "voice_settings": {
    "stability": 0.60,
    "similarity_boost": 0.80,
    "style": 0.25,
    "use_speaker_boost": true
  }
}
```

---

### Fichier S3 — `voix_s3.txt`

```
Et si ton téléphone connaissait ta boulangerie... mieux que n'importe quel tableur ?
```

> **Notes d'interprétation ElevenLabs :**
> Légère montée de ton sur "téléphone". Pause dramatique après "boulangerie...".
> "n'importe quel tableur" avec une légère ironie — le tableur est le vieux monde.

**Paramètres API ElevenLabs S3 :**
```json
{
  "text": "Et si ton téléphone connaissait ta boulangerie... mieux que n'importe quel tableur ?",
  "model_id": "eleven_multilingual_v2",
  "voice_settings": {
    "stability": 0.50,
    "similarity_boost": 0.80,
    "style": 0.40,
    "use_speaker_boost": true
  }
}
```

---

### Fichier S4 — `voix_s4.txt`

```
Levain analyse chaque soir.
Score de journée. Invendus. Prévisions de production pour demain.
En trente secondes.
```

> **Notes d'interprétation ElevenLabs :**
> Rythme clip, presque énumératif. Chaque phrase est une balle.
> "En trente secondes" dit avec légère satisfaction — comme si c'était évident.

**Paramètres API ElevenLabs S4 :**
```json
{
  "text": "Levain analyse chaque soir.\nScore de journée. Invendus. Prévisions de production pour demain.\nEn trente secondes.",
  "model_id": "eleven_multilingual_v2",
  "voice_settings": {
    "stability": 0.55,
    "similarity_boost": 0.82,
    "style": 0.30,
    "use_speaker_boost": true
  }
}
```

---

### Fichier S5 — `voix_s5.txt`

```
Dix-huit heures trente. Tes invendus deviennent des paniers flash.
Vingt minutes plus tard... vendus.
```

> **Notes d'interprétation ElevenLabs :**
> "Dix-huit heures trente" dit comme une annonce — net, ancré dans le réel.
> "Vingt minutes plus tard..." pause légère de satisfaction avant "vendus." — mot final claqué.

**Paramètres API ElevenLabs S5 :**
```json
{
  "text": "Dix-huit heures trente. Tes invendus deviennent des paniers flash.\nVingt minutes plus tard... vendus.",
  "model_id": "eleven_multilingual_v2",
  "voice_settings": {
    "stability": 0.50,
    "similarity_boost": 0.80,
    "style": 0.45,
    "use_speaker_boost": true
  }
}
```

---

### Fichier S6 — `voix_s6.txt`

```
BakeryOS.
Gratuit pour commencer.
Résultats dès la première semaine.
```

> **Notes d'interprétation ElevenLabs :**
> "BakeryOS." dit comme un nom propre — net, confiant, pas de montée.
> "Résultats dès la première semaine." dit avec chaleur, pas avec arrogance.

**Paramètres API ElevenLabs S6 :**
```json
{
  "text": "BakeryOS.\nGratuit pour commencer.\nRésultats dès la première semaine.",
  "model_id": "eleven_multilingual_v2",
  "voice_settings": {
    "stability": 0.62,
    "similarity_boost": 0.82,
    "style": 0.20,
    "use_speaker_boost": true
  }
}
```

---

### Fichier version 15s — `voix_15s.txt`

```
Chaque soir, six mille euros de pain... à la poubelle.
BakeryOS prédit, optimise, et vend tes restes.
Essaie gratuitement.
```

**Paramètres API ElevenLabs version 15s :**
```json
{
  "text": "Chaque soir, six mille euros de pain... à la poubelle.\nBakeryOS prédit, optimise, et vend tes restes.\nEssaie gratuitement.",
  "model_id": "eleven_multilingual_v2",
  "voice_settings": {
    "stability": 0.52,
    "similarity_boost": 0.80,
    "style": 0.38,
    "use_speaker_boost": true
  }
}
```

---

## 🔊 ElevenLabs Sound Effects — Ambiances sonores

ElevenLabs génère également des effets sonores via son endpoint `/v1/sound-generation`.
Ces effets viennent en couche sous la voix off (mix -18 dB sous la voix).

### Effet S1 — Ambiance boulangerie fermée

```json
{
  "text": "quiet french artisan bakery at closing time, distant footsteps on tile floor, wooden door closing softly in background, ambient hum of refrigeration unit, peaceful and slightly melancholic, no music, realistic room tone",
  "duration_seconds": 8,
  "prompt_influence": 0.4
}
```

### Effet S3 — Notification smartphone

```json
{
  "text": "smartphone screen unlocking with soft subtle chime, single clean notification tone, modern minimal, not aggressive, slightly warm timbre",
  "duration_seconds": 1.5,
  "prompt_influence": 0.6
}
```

### Effet S4 — Interface IA qui se génère

```json
{
  "text": "soft digital processing sound, AI computation ambient loop, gentle data analysis hum with subtle positive resolution at end, warm electronic texture, not robotic, futuristic but artisan-friendly",
  "duration_seconds": 5,
  "prompt_influence": 0.5
}
```

### Effet S5 — Cascade de notifications push clients

```json
{
  "text": "rapid sequence of smartphone push notification sounds arriving quickly, 5 to 8 distinct pings in 3 seconds, each slightly different, energetic and satisfying, like a cascade of small victories",
  "duration_seconds": 3,
  "prompt_influence": 0.7
}
```

---

## 🛠️ Workflow technique de production

```
ÉTAPE 1 — Génération voix (ElevenLabs TTS)
├── Générer voix_s2.wav, voix_s3.wav, voix_s4.wav, voix_s5.wav, voix_s6.wav
├── Modèle : eleven_multilingual_v2
├── Exporter en WAV 44.1kHz, 16bit
└── Écouter et valider le ton avant de continuer

ÉTAPE 2 — Génération effets sonores (ElevenLabs Sound Effects)
├── Générer ambiance_s1.wav, notif_s3.wav, ia_s4.wav, pings_s5.wav
└── Normaliser à -18 dB (couche d'ambiance sous voix à 0 dB)

ÉTAPE 3 — Génération images frames (Nano Banana)
├── Générer les 12 images (départ + fin × 6 séquences)
├── Résolution : 1920×1080 (16:9) ou 1080×1920 (9:16 vertical)
└── Exporter en PNG sans compression

ÉTAPE 4 — Génération vidéo (Vertex AI Veo 3)
├── Utiliser images Nano Banana comme first_frame / last_frame
├── Passer les fichiers audio voix off comme audio_input par séquence
├── Générer chaque séquence séparément
└── Exporter MP4 H.264, 24fps

ÉTAPE 5 — Assemblage final (CapCut / DaVinci Resolve)
├── Assembler les 6 clips dans l'ordre
├── Mixer : voix (0 dB) + effets sonores (-18 dB) + musique (-24 dB)
├── Ajouter overlays texte (Playfair Display, couleur #C19A6B)
├── Appliquer LUT warm cinematic
└── Exporter : MP4 H.264, 1080×1920 (9:16), 60fps, 20 Mbps
```

---

## 📽️ Séquence par séquence — Descriptions & Prompts

---

### SÉQUENCE 1 — Accroche douleur (0–8 secondes)

**Description visuelle :**
Plan large d'une boulangerie artisanale française en fin de journée. Lumière chaude et dorée. Sur le comptoir de bois, une rangée de baguettes, croissants et miches invendus. La caméra se rapproche lentement. Une horloge murale indique 18h45.

**Voix off :** *(aucune — silence + ambiance sonore ElevenLabs uniquement)*
**Effet sonore :** `ambiance_s1.wav`
**Texte à l'écran :** `18h45. Encore des invendus.`

---

#### 🖼️ Prompt Nano Banana — Image DÉPART S1

```
photorealistic artisan french bakery interior, late afternoon golden hour light,
wooden counter covered with unsold baguettes croissants and bread loaves,
slightly rustic warm tones, shallow depth of field, analog film grain,
wall clock showing 18:45, empty shop, melancholic mood,
cinematic composition, 16:9 aspect ratio, no people,
natural window light casting long shadows on bread
```

#### 🖼️ Prompt Nano Banana — Image FIN S1

```
extreme close-up of unsold artisan baguette on wooden bakery counter,
warm golden light, bread texture highly detailed, crumb visible at cut end,
soft bokeh background of empty bakery interior, cinematic,
film grain texture, french artisan aesthetic, melancholic still life,
16:9 aspect ratio
```

#### 🎬 Prompt Vertex AI (Veo 3) — S1

```
Cinematic slow push-in shot of a traditional French artisan bakery interior at closing time.
Warm golden late-afternoon light streams through a window. On a worn wooden counter,
rows of unsold baguettes, croissants, and round bread loaves sit untouched.
A wall clock shows 18:45. The camera slowly dollies forward toward the bread.
No voiceover. Ambient bakery room tone only: distant footsteps, a door closing in background.
No people visible. Film grain, 24fps, warm color grading, shallow depth of field.
Duration: 8 seconds.
```

---

### SÉQUENCE 2 — Frustration réelle (8–18 secondes)

**Description visuelle :**
Un boulanger d'une cinquantaine d'années, tablier blanc, regard fatigué, regarde ses invendus. Il attrape un carnet papier froissé, hésite avec le stylo au-dessus de la page blanche, puis pose le stylo.

**Voix off ElevenLabs :** `voix_s2.wav`
> *"Chaque soir... la même question. Combien j'aurais dû produire ?"*

**Texte à l'écran :** `8% d'invendus en moyenne. 6 000 € par an.`

---

#### 🖼️ Prompt Nano Banana — Image DÉPART S2

```
medium shot of tired french male baker in his 50s, white apron,
standing behind bakery counter looking at unsold bread with exhausted expression,
holding a worn paper notebook and pen, hesitating, soft warm interior light,
authentic artisan french bakery background, photorealistic,
candid documentary style, slight motion blur on hands, cinematic 16:9
```

#### 🖼️ Prompt Nano Banana — Image FIN S2

```
close-up of a baker's hand holding a crumpled paper notebook, pen hovering over blank page,
hesitating, warm bakery interior out of focus in background,
symbolic moment of indecision, photorealistic, cinematic grain,
shallow depth of field, natural light
```

#### 🎬 Prompt Vertex AI (Veo 3) — S2

```
Medium shot of an authentic French artisan baker, male, mid-50s, white apron,
tired eyes, slowly walking behind his wooden counter. He looks at the unsold bread,
sighs softly, picks up a worn paper notebook and pen, hesitates with pen above blank page,
then sets it down. Natural hand movements, no exaggeration.
Warm interior lighting. Documentary realism. 24fps, film grain.
Audio input: voix_s2.wav — French male voiceover, calm and tired:
"Chaque soir... la même question. Combien j'aurais dû produire ?"
Sync: voice starts at 0.5s into shot. Duration: 10 seconds.
```

---

### SÉQUENCE 3 — Révélation produit (18–30 secondes)

**Description visuelle :**
Les mains du boulanger sortent un smartphone de sa poche. L'écran s'allume sur l'interface sombre BakeryOS (#1A0F0A, accents or). Logo et titre "Levain" apparaissent doucement.

**Voix off ElevenLabs :** `voix_s3.wav`
> *"Et si ton téléphone connaissait ta boulangerie... mieux que n'importe quel tableur ?"*

**Effet sonore ElevenLabs :** `notif_s3.wav` (au moment où l'écran s'allume)
**Texte à l'écran :** Logo BakeryOS + `Levain — votre assistant IA`

---

#### 🖼️ Prompt Nano Banana — Image DÉPART S3

```
baker's hands in white apron taking out a smartphone from pocket,
warm bakery background slightly out of focus, close-up on hands and phone screen,
phone screen just turning on showing dark interface with golden logo,
cinematic 16:9, shallow depth of field, soft warm lighting,
photorealistic, product reveal moment
```

#### 🖼️ Prompt Nano Banana — Image FIN S3

```
close-up smartphone screen showing dark elegant SaaS bakery app interface,
dark brown background #1A0F0A, golden accent colors, serif font title "Levain",
glowing subtle UI elements, warm ambient reflection on phone glass,
held in baker hands with white apron visible at edges, cinematic product shot,
16:9, photorealistic render
```

#### 🎬 Prompt Vertex AI (Veo 3) — S3

```
Close-up of baker's hands in white apron reaching into pocket and pulling out a smartphone.
Phone screen activates showing a dark elegant app interface with warm golden typography.
Deep brown background with gold accents. Screen reads "BakeryOS — Levain" with a subtle glow.
Camera slowly reveals the full screen. Smooth motion, cinematic.
Transition from warm bakery tones to elegant dark tech mood. Film grain, 24fps.
Audio input: voix_s3.wav — French male voiceover, intrigued tone, slight irony on "tableur":
"Et si ton téléphone connaissait ta boulangerie... mieux que n'importe quel tableur ?"
Voice starts at 1s into shot. Duration: 12 seconds.
```

---

### SÉQUENCE 4 — Démo feature clé 1 : Levain IA (30–40 secondes)

**Description visuelle :**
Écran de téléphone en gros plan. Rapport Levain se génère : score 87/100 qui monte, prévisions de production pour le lendemain, météo de demain. Retour sur le boulanger qui sourit légèrement.

**Voix off ElevenLabs :** `voix_s4.wav`
> *"Levain analyse chaque soir. Score de journée. Invendus. Prévisions de production pour demain. En trente secondes."*

**Effet sonore ElevenLabs :** `ia_s4.wav` (ambient de génération IA sous la voix, -18 dB)
**Texte à l'écran :** `Score du jour : 87/100` · `Production suggérée : prête à 6h`

---

#### 🖼️ Prompt Nano Banana — Image DÉPART S4

```
smartphone screen mockup showing BakeryOS dark interface,
loading animation state, circular progress indicator in gold,
"Levain analyse votre journée..." text in warm serif font,
dark brown background, pulsing subtle glow effect,
clean UI design with warm artisan aesthetic, flat lay on wooden surface, cinematic 16:9
```

#### 🖼️ Prompt Nano Banana — Image FIN S4

```
smartphone screen showing BakeryOS Levain AI report completed,
score "87/100" displayed prominently in golden serif font,
production forecast list: baguettes, croissants, pains au chocolat with quantities,
small weather icon showing rain tomorrow, dark warm UI, elegant minimal design,
baker's face slightly visible and smiling in background bokeh, cinematic product shot, 16:9
```

#### 🎬 Prompt Vertex AI (Veo 3) — S4

```
Close-up screen animation of BakeryOS mobile app.
Dark UI (#1A0F0A) with gold accents. Score counter animates from 0 to 87:
"87/100 — Excellente journée". Production forecast list appears with item names and quantities.
Rain cloud icon next to "Météo demain". Smooth spring UI animations.
Cut to medium shot of baker looking at phone with a quiet smile of relief.
Audio input: voix_s4.wav — French male voiceover, confident and clipped:
"Levain analyse chaque soir. Score de journée. Invendus.
Prévisions de production pour demain. En trente secondes."
Each phrase lands separately. Duration: 10 seconds.
```

---

### SÉQUENCE 5 — Démo feature clé 2 : Paniers flash (40–50 secondes)

**Description visuelle :**
Split-screen dynamique. Gauche — boulanger active les paniers flash (-40%). Droite — time-lapse : notifications push sur téléphones clients, barre quantité descend à zéro. Fin : comptoir propre, serein.

**Voix off ElevenLabs :** `voix_s5.wav`
> *"Dix-huit heures trente. Tes invendus deviennent des paniers flash. Vingt minutes plus tard... vendus."*

**Effet sonore ElevenLabs :** `pings_s5.wav` (cascade de notifications sous la voix, -18 dB)
**Texte à l'écran :** `⚡ Paniers flash activés` → `✅ 0 invendu ce soir`

---

#### 🖼️ Prompt Nano Banana — Image DÉPART S5

```
split screen composition, left side: baker tapping smartphone screen activating
flash sale feature, orange glowing button, dark app interface,
right side: multiple customer smartphones receiving push notifications simultaneously,
bright notification badges, shopping basket icons,
dynamic energy, warm color palette with orange accent, cinematic 16:9, photorealistic
```

#### 🖼️ Prompt Nano Banana — Image FIN S5

```
clean empty wooden bakery counter, no bread remaining, late evening light, warm golden glow,
smartphone on counter showing "0 invendus ce soir ✅" in elegant app interface,
peaceful satisfying mood, artisan bakery interior background,
cinematic 16:9, photorealistic, shallow depth of field
```

#### 🎬 Prompt Vertex AI (Veo 3) — S5

```
Dynamic split-screen sequence.
Left panel: baker's hands activating flash sale on BakeryOS app — orange glow button,
products listed with -40% badges.
Right panel: time-lapse of push notifications arriving on multiple phones,
progress bar emptying from "12 disponibles" to "0 disponible" in under 20 seconds.
Energetic pacing. Final shot: clean empty bakery counter, evening light, tranquil.
Audio input: voix_s5.wav — French male voiceover, dynamic then settling:
"Dix-huit heures trente. Tes invendus deviennent des paniers flash.
Vingt minutes plus tard... vendus."
The word "vendus" is delivered with quiet satisfaction — like a door closing gently.
Duration: 10 seconds.
```

---

### SÉQUENCE 6 — Résultat + CTA (50–60 secondes)

**Description visuelle :**
Le boulanger est dehors, tablier enlevé, souriant. Vitrine éclairée derrière lui. Overlays chiffrés apparaissent un par un. Logo BakeryOS plein écran. CTA.

**Voix off ElevenLabs :** `voix_s6.wav`
> *"BakeryOS. Gratuit pour commencer. Résultats dès la première semaine."*

**Texte à l'écran final :**
```
✓ Gratuit pour toujours
✓ Aucune CB requise
✓ Prêt en 10 minutes
→ artisandore.fr
```

---

#### 🖼️ Prompt Nano Banana — Image DÉPART S6

```
authentic french artisan baker male mid-50s, no apron, casual jacket,
standing outside his bakery at dusk, smiling with genuine relief and satisfaction,
holding smartphone, shop window glowing warmly behind him,
"Boulangerie Artisanale" sign visible, cinematic portrait,
warm street lighting, natural joy expression, photorealistic, 16:9
```

#### 🖼️ Prompt Nano Banana — Image FIN S6

```
elegant product branding shot, dark background #1A0F0A,
centered golden bread loaf icon logo, "BakeryOS" in Playfair Display serif gold font,
subtle tagline below, three golden checkmarks with short benefit lines,
URL "artisandore.fr" at bottom, premium minimal design,
soft inner glow, cinematic 16:9, no gradients, flat luxury aesthetic
```

#### 🎬 Prompt Vertex AI (Veo 3) — S6

```
Medium shot of the same baker from sequence 2, now outside his bakery.
Jacket on, no apron, genuine smile, holding his phone.
Evening light, warm and golden. Bakery window glowing behind him.
Animated text overlays appear one by one: "-18% d'invendus", "+85€ /semaine", "5 min/jour".
Cut to full dark screen with BakeryOS logo in gold, elegant serif typography.
Three checkmarks animate in. URL fades up at bottom.
Audio input: voix_s6.wav — French male voiceover, grounded and warm:
"BakeryOS. Gratuit pour commencer. Résultats dès la première semaine."
Each sentence is its own breath. Confident. Final. Duration: 10 seconds.
```

---

## ✂️ Version courte 15 secondes (format Reel/Short)

| Temps | Contenu |
|---|---|
| 0-3s | Plan invendus sur comptoir — texte : `6 000€ de pain jeté par an` |
| 3-8s | Interface Levain — score 87 + prévisions |
| 8-12s | Paniers flash : barre qui descend à 0 |
| 12-15s | Baker souriant dehors + logo + URL |

**Voix off ElevenLabs :** `voix_15s.wav`
> *"Chaque soir, six mille euros de pain... à la poubelle. BakeryOS prédit, optimise, et vend tes restes. Essaie gratuitement."*

#### 🎬 Prompt Vertex AI (Veo 3) — Version 15s

```
Fast-cut 15-second social media ad.
Shot 1 (3s): unsold bread on bakery counter, warm moody light, text overlay "6 000€ de pain jeté par an".
Shot 2 (5s): BakeryOS Levain AI report on smartphone, score "87/100" animating up.
Shot 3 (4s): split-screen flash sale, inventory bar dropping to zero.
Shot 4 (3s): happy baker outside shop, BakeryOS logo fade in over black, URL appears.
Energetic editing. Warm cinematic grade.
Audio input: voix_15s.wav — French male voiceover throughout:
"Chaque soir, six mille euros de pain... à la poubelle.
BakeryOS prédit, optimise, et vend tes restes. Essaie gratuitement."
```

---

## 🎵 Mix audio final — Niveaux recommandés

| Piste | Volume | Rôle |
|---|---|---|
| Voix off ElevenLabs (TTS) | 0 dB (référence) | Priorité maximale |
| Effets sonores ElevenLabs | -18 dB | Couleur émotionnelle |
| Musique de fond | -24 dB | Texture / atmosphère |
| Ambiance boulangerie (S1 seul.) | -12 dB | Immersion ouverture |

**Style musical :** Piano + cordes légères, français, artisanal. Pas d'électro.
Montée progressive de S3 à S5, résolution sur S6.
Référence : bande originale type "Amélie Poulain" — version moderne épurée.

---

## 🎨 Direction artistique globale

| Élément | Choix |
|---|---|
| Palette | Brun `#1A0F0A`, or `#C19A6B`, crème `#FAF3E0` |
| Police overlay | Playfair Display titres · Source Sans 3 données |
| Ratio | 9:16 (TikTok/Reels) + 16:9 (YouTube) |
| Grade couleur | Warm cinematic — ombres chaudes, hautes lumières dorées |
| Grain | Léger grain 35mm pour l'authenticité artisanale |
| Transitions | Coupes nettes · 1 fade-to-black avant le CTA final |

---

## 📊 KPIs à mesurer

| Métrique | Cible |
|---|---|
| Taux de visionnage 3s | > 70% |
| Taux de complétion 60s | > 40% |
| CTR vers landing | > 2,5% |
| Coût par inscription | < 8 € |
| Taux de conversion landing | > 12% |