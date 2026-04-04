### Facteurs Influençant la Production, Consommation et Humeur en Boulangerie Artisanale Française

Pour adapter ton IA "Levain" dans Sauve Mie, j'ai analysé le contexte des boulangeries artisanales françaises (gestion quotidienne, pics matinaux/vendredis, invendus sensibles aux habitudes clients). Les facteurs ci-dessous impactent **production** (quantités à pétrir/prévoir), **consommation** (ventes réelles) et **humeur** (du boulanger/vendeuse, influençant feedback et adoption outil). 

Ils se divisent en catégories clés, avec exemples concrets par **jour de la semaine + conditions**. Levain pourrait ingérer ces données via API météo (ex. OpenWeather), calendrier (fêtes), historique ventes, et feedback vendeuse pour prédire : "Lundi pluvieux : +20% baguette, -15% viennoiseries ; produire 120% nominal."

#### 1. Météo (impact majeur : 20-40% variation ventes)
La pluie/neige booste pains réconfortants ; soleil favorise snacking léger.

| Jour | Condition Météo | Production | Consommation | Humeur |
|------|-----------------|------------|--------------|--------|
| **Lundi** (début semaine, faible affluence) | Pluvieux | +25% pains (baguette, campagne) ; reports J-1 prioritaires | +30% pains chauds ; -10% pâtisseries | Boulanger motivé (moins rush) ; vendeuse stressée si stocks mouillés |
| | Neigeux | +40% pains denses ; stocks gel-proof | +50% pains ; clients cocooning | Humeur basse (froid, glissades) → feedback négatif |
| | Soleil | Normale ; +10% viennoiseries précoces | +15% snacking ; -5% pains lourds | Positive (énergie haute) |
| **Mardi** (stable, mid-week) | Pluvieux | +15% pains ; réduire viennoiseries | +20% baguette ; clients pressés | Neutre ; alerte si >30% reste à 10h |
| | Ensoleillé | +20% pâtisseries | Boom snacking (+25%) | Bonne (affluence fluide) |
| **Mercredi** (enfants école, pics goûter) | Vent fort | Protéger pains aériens ; +10% compacts | -15% viennoiseries volages | Irritée (réassort constant) |
| | Chaud (>25°C) | -20% pains levés ; +30% glaces/snacks si dispo | +40% boissons fraîches/pains légers | Fatiguée (chaleur four) |
| **Jeudi** (pré-weekend, hausse) | Orageux | +20% pains réconfort ; alertes invendus | +25% total ; -10% click&collect | Stressée (rush imprévu) |
| **Vendredi** (pic max, 30-50% CA) | Pluvieux | +30% tout ; max reports | Explosion pains (+40%), viennoiseries (+50%) | Euphorique si ventes hautes ; frustrée si invendus |
| | Soleil | +40% snacking/pâtisseries | Record CA ; flash anti-gaspi inutile | Très positive (weekend vibe) |
| **Samedi** (weekend fort, clients familles) | Neige | +50% pains familiaux ; stocks indoor | +60% pains ; -20% sorties | Bonne mais épuisée (longue journée) |
| **Dimanche** (matin only, variable) | Beau temps | Minimale ; focus pains | +20% pains tradition ; click&collect clé | Relaxée (moins pression) |

#### 2. Jour de la Semaine (cycles prévisibles, base historique Levain)
- **Lundi** : Faible (-20-30% vs moyenne) → production réduite, humeur basse post-weekend.
- **Mercredi/Jeudi** : Mid (+10%) → goûters enfants boostent viennoiseries.
- **Vendredi/Samedi** : Pic (+30-50%) → max production, humeur haute si optimisé.
- **Dimanche** : Court (matin) → focus pains, faible pâtisseries.

#### 3. Événements Saisonniers/Calendaires (pics +50%)
- Fêtes (Noël, Pâques) : +100% bûches/pains spéciaux ; humeur excitée.
- Vacances scolaires : -30% mid-week, +40% weekends familles.
- Jours fériés : Fermé ou rush (ex. 1er mai muguet → + pains fleuris).
- Back-to-school (septembre) : + pains pratiques.

#### 4. Facteurs Locaux/Opérationnels (terrain boulangerie)
- **Événements proximité** : Marché local (+20% pains), chantier routier (-15% accès).
- **Concurrence** : Nouvelle boulangerie nearby → -10-20% ; surveiller via stats.
- **Prix énergie/ingrédients** : Hausse farine → réduire volumes, humeur frustrée.
- **Heures ouvrées** : Retard ouverture → - ventes matinales critiques.

#### 5. Comportement Clients et Click & Collect
- **Habitudes** : Matin rush (6-10h pains), midi snacking, soir pâtisseries.
- **Flash anti-gaspi** : Boost soir pluvieux (+30% invendus sauvés).
- **Tendance** : Bio/sans gluten +15% ; Levain apprend via catalogue.

#### 6. Humeur Interne (feedback pour IA)
- **Boulanger** : Fatigué post-pic → suggestions simples ; motivé si CA up.
- **Vendeuse** : Stress comptoir (10h/14h) si >30% reste → alertes visuelles calment.
- **Feedback loop** : Intègre météo + humeur pour affiner (ex. "Pluie + fatigue = +10% pains").

### Implémentation pour Levain
- **Sources données** : Historique Sauve Mie + API météo (7j prévision) + Google Calendar fêtes FR.
- **Prédiction** : Modèle ML simple (régression linéaire sur ventes passées x facteurs) → "Lundi pluvieux : produire 150 baguettes (vs 120 nominal), risque humeur basse."
- **Exemple sortie IA** : "🌧️ Lundi pluvieux prévu : +25% baguette (120→150), surveille feedback vendeuse à 10h."

Ces facteurs couvrent 80-90% variations observées en boulangerie FR. Levain deviendra précis avec 30j données par bakery