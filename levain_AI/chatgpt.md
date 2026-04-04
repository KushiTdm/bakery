# 📊 Sauve Mie — Facteurs d’Influence Production & Consommation
## Objectif : Alimenter l’IA "Levain"

---

# 🧠 1. CATÉGORIES DE FACTEURS

## 1.1 Facteurs Calendaires
- Jour de la semaine
- Mois
- Saison
- Vacances scolaires
- Jours fériés
- Ponts (ex: jeudi férié → vendredi impacté)
- Veille / lendemain de jour férié
- Événements locaux (marché, fête, foire)

---

## 1.2 Facteurs Météo
- Température (°C)
- Ressenti thermique
- Ensoleillement (%)
- Pluie (mm)
- Neige
- Vent
- Humidité
- Conditions extrêmes (canicule, tempête)

---

## 1.3 Facteurs Comportementaux Clients
- Routine travail (semaine vs week-end)
- Télétravail vs présentiel
- Flux piéton (zone bureau vs résidentielle)
- Tourisme
- Pouvoir d’achat local
- Habitudes alimentaires (healthy, snacking, plaisir)

---

## 1.4 Facteurs Produits
- Type produit :
  - Pain
  - Viennoiserie
  - Pâtisserie
  - Snacking
- Durée de conservation
- Prix
- Saisonnalité produit (galette, bûche…)
- Effet vitrine (visuel attractif)

---

## 1.5 Facteurs Opérationnels
- Heure de cuisson
- Ruptures de stock
- Qualité perçue
- Temps d’attente
- Upsell vendeuse
- Mise en avant produit

---

## 1.6 Facteurs Marketing
- Promotions
- Flash anti-gaspi
- Click & Collect
- Notifications push
- Réseaux sociaux

---

# 📅 2. IMPACT PAR JOUR DE SEMAINE

## Lundi
- Faible trafic global
- Moins d’achats plaisir
- Consommation utilitaire

↑ Pain tradition  
↓ Viennoiseries premium  
↓ Pâtisseries  

### Météo :
- Pluie → ↑ snacking chaud (quiches, sandwichs)
- Soleil → ↓ fréquentation globale

---

## Mardi - Jeudi
- Jours les plus stables
- Routine installée

↑ Pain quotidien  
↑ Sandwich midi  
→ Viennoiseries stables  

### Météo :
- Froid → ↑ viennoiseries + chocolat chaud
- Chaud → ↑ boissons fraîches + ↓ pâtisserie lourde

---

## Vendredi
- Anticipation week-end

↑ Pâtisserie  
↑ Pain (stock maison)  
↑ Snacking  

### Météo :
- Pluie → ↑ comfort food (pizza, quiche)
- Soleil → ↑ sorties → ↓ achat boulangerie classique

---

## Samedi
- Pic de fréquentation

↑↑ Viennoiseries  
↑↑ Pâtisserie  
↑ Pain spéciaux  

### Météo :
- Mauvais temps → ↑ fréquentation boulangerie
- Beau temps → ↓ matin, ↑ après-midi

---

## Dimanche
- Achat plaisir / familial

↑↑ Viennoiseries  
↑↑ Desserts  
↑ Pain  

### Météo :
- Pluie → ↑ consommation globale
- Soleil → ↓ sauf tôt matin

---

# 🌦️ 3. IMPACT MÉTÉO DÉTAILLÉ

## ☀️ Soleil
- ↓ fréquentation globale (les gens sortent ailleurs)
- ↑ achats impulsifs
- ↑ produits "plaisir rapide"

## 🌧️ Pluie
- ↑ fréquentation de proximité
- ↑ comfort food
- ↑ snacking chaud

## ❄️ Neige
- ↓ trafic
- ↑ panier moyen
- ↑ produits stockables (pain)

## 🥵 Chaleur (>25°C)
- ↓ pain
- ↓ viennoiseries
- ↓ pâtisserie lourde
- ↑ boissons fraîches

## 🥶 Froid (<10°C)
- ↑ viennoiseries
- ↑ chocolat chaud
- ↑ produits caloriques

---

# 🍞 4. IMPACT PAR TYPE DE PRODUIT

## Pain
- Stable toute l’année
- ↑ avant week-end
- ↑ mauvais temps

## Viennoiseries
- Très sensibles au week-end
- ↑ froid
- ↓ chaleur

## Pâtisserie
- Très corrélée :
  - week-end
  - événements
- ↓ chaleur
- ↑ pluie

## Snacking
- Dépend du flux travail
- ↑ pluie
- ↑ semaine midi
- ↓ week-end

---

# 🎯 5. PATTERNS AVANCÉS (CRITIQUES POUR IA)

## Combinaisons fortes

### Lundi + pluie
→ ↑ snacking  
→ ↑ pain  
→ ↓ plaisir  

### Vendredi + pluie
→ ↑ comfort food  
→ ↑ panier moyen  

### Samedi + soleil
→ ↓ matin  
→ ↑ achats impulsifs  

### Dimanche + pluie
→ ↑↑ viennoiseries  
→ ↑↑ pâtisserie  

### Canicule + semaine
→ ↓ global CA  
→ shift vers boissons  

---

# 📈 6. VARIABLES À TRACKER (DATASET IA)

## Obligatoires
- date
- jour_semaine
- météo (température, pluie, soleil)
- ventes par produit
- production par produit
- invendus

## Recommandées
- trafic magasin (approx via ventes)
- heure ventes
- feedback vendeuse
- événements locaux

---

# 🤖 7. RÈGLES HEURISTIQUES POUR "LEVAIN"

## Exemple règles simples

IF pluie > 5mm THEN
→ +20% snacking

IF température < 10°C THEN
→ +15% viennoiseries

IF samedi THEN
→ +30% pâtisserie

IF dimanche + soleil THEN
→ -15% production globale

IF invendus veille > 10% THEN
→ -10% production lendemain

---

# 🚀 8. IDÉES D’AMÉLIORATION IA

- Modèle prédictif par produit (pas global)
- Pondération météo + jour
- Apprentissage par boulangerie (hyper local)
- Système de confiance des prédictions
- Segmentation client (travailleur vs famille)

---

# 🧩 9. INSIGHT CLÉ

👉 Une boulangerie n’est PAS un commerce stable  
C’est un système ultra-sensible à :

- météo
- psychologie client
- rythme de vie

👉 Ton avantage SaaS = transformer l’instinct en data

---

# 🏁 CONCLUSION

Ton IA doit raisonner comme ça :

"Quel type de client va venir aujourd’hui, dans CETTE météo, CE jour-là ?"

Puis :

"Qu’est-ce qu’il va vouloir manger dans cet état émotionnel ?"