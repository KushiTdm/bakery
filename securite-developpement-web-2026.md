# Sécurité du développement web en 2026
## Front-end, back-end et contrôle des failles

Ce document sert de base de travail pour concevoir, auditer et maintenir une application web plus sûre en 2026. Il s’appuie sur les risques majeurs du OWASP Top 10 2025, qui reste la référence actuelle pour les applications web. [web:1][page:1]

## Objectif

L’objectif est de réduire le risque de compromission, de fuite de données, d’escalade de privilèges, de fraude et de dégradation de service. En 2026, la sécurité ne se limite plus à “corriger des vulnérabilités” : elle exige une défense en profondeur, une surveillance continue et une maîtrise de la chaîne logicielle. [web:1][web:4]

## Principes de base

- Appliquer le principe du moindre privilège sur tous les comptes, API, services et environnements.
- Valider toutes les entrées côté serveur, même si elles sont déjà validées côté client.
- Considérer toute donnée affichée dans le navigateur comme potentiellement hostile.
- Chiffrer les données sensibles en transit et au repos.
- Journaliser les événements critiques et surveiller les anomalies.
- Sécuriser la chaîne de build, les dépendances et le déploiement. [page:1][web:1]

## Risques prioritaires OWASP 2025

Le OWASP Top 10 2025 met en avant les catégories suivantes comme risques majeurs : Broken Access Control, Security Misconfiguration, Software Supply Chain Failures, Cryptographic Failures, Injection, Insecure Design, Authentication Failures, Software or Data Integrity Failures, Security Logging and Alerting Failures, et Mishandling of Exceptional Conditions. [page:1]

### 1. Broken Access Control

Mesures à appliquer :
- Contrôler les permissions sur chaque action sensible.
- Vérifier les droits au niveau serveur, jamais seulement dans l’interface.
- Refuser par défaut tout accès non explicitement autorisé.
- Protéger les objets, ressources, routes et fonctions d’administration.

Vérifications :
- Un utilisateur peut-il accéder à la donnée d’un autre compte ?
- Une URL ou une API peut-elle être appelée avec un identifiant arbitraire ?
- Un rôle faible peut-il exécuter une action réservée à un admin ? [page:1]

### 2. Security Misconfiguration

Mesures à appliquer :
- Désactiver les routes, comptes, services et endpoints inutiles.
- Supprimer les secrets des dépôts et des variables publiques.
- Appliquer des en-têtes de sécurité adaptés.
- Séparer strictement dev, staging et production.
- Bloquer les pages d’erreur trop bavardes.

Vérifications :
- Les environnements de test exposent-ils des données réelles ?
- Les buckets, logs ou dashboards sont-ils accessibles publiquement ?
- Les messages d’erreur divulguent-ils la stack technique ? [page:1]

### 3. Software Supply Chain Failures

Mesures à appliquer :
- Verrouiller les versions des dépendances.
- Scanner les paquets, images Docker et artefacts de build.
- Supprimer les bibliothèques inutiles.
- Vérifier les signatures, checksums et provenance des artefacts.
- Protéger la CI/CD avec MFA, droits minimaux et secrets gérés proprement.

Vérifications :
- Une dépendance compromise peut-elle être injectée dans le build ?
- Les mises à jour passent-elles par une revue et un scan ?
- Les clés de déploiement sont-elles isolées et rotées ? [page:1][web:4]

### 4. Cryptographic Failures

Mesures à appliquer :
- Utiliser TLS partout.
- Chiffrer les données sensibles au repos si nécessaire.
- Ne jamais inventer son propre schéma cryptographique.
- Utiliser des algorithmes modernes et des bibliothèques éprouvées.
- Gérer correctement les clés, les secrets et les rotations.

Vérifications :
- Les cookies sensibles sont-ils protégés ?
- Les jetons ont-ils une durée de vie courte ?
- Les mots de passe sont-ils stockés avec un hash adapté et un sel unique ? [page:1]

### 5. Injection

Mesures à appliquer :
- Utiliser des requêtes paramétrées.
- Éviter la concaténation de chaînes pour SQL, LDAP, commandes système ou templates.
- Échapper correctement les sorties selon le contexte.
- Filtrer et normaliser les données avant traitement.

Vérifications :
- Les requêtes SQL utilisent-elles des paramètres ?
- Le front-end échappe-t-il tout affichage utilisateur ?
- Les formulaires, filtres et recherches sont-ils testés contre les injections ? [page:1][web:12]

### 6. Insecure Design

Mesures à appliquer :
- Faire une analyse de risques dès la conception.
- Prévoir les abus possibles, pas seulement l’usage normal.
- Ajouter des limites de volume, de fréquence et de portée.
- Concevoir des workflows résistants à la fraude et à l’automatisation.

Vérifications :
- Une action sensible peut-elle être automatisée à grande échelle ?
- Le design permet-il une fuite massive si un compte est compromis ?
- Les parcours critiques ont-ils été modélisés avec des scénarios d’attaque ? [page:1]

### 7. Authentication Failures

Mesures à appliquer :
- Imposer une authentification multifacteur pour les accès sensibles.
- Protéger les resets de mot de passe et les sessions.
- Bloquer le credential stuffing et le bruteforce.
- Stocker les mots de passe avec un algorithme de hash robuste.
- Mettre en place des durées de session raisonnables.

Vérifications :
- Les comptes admin utilisent-ils une MFA forte ?
- Les jetons de session sont-ils invalidés à la déconnexion ?
- Les tentatives de connexion anormales sont-elles détectées ? [page:1][web:19]

### 8. Software or Data Integrity Failures

Mesures à appliquer :
- Vérifier l’intégrité des artefacts déployés.
- Protéger les Webhooks, imports et échanges interservices.
- Valider les données reçues d’autres systèmes.
- Signer ou authentifier les flux critiques lorsque c’est pertinent.

Vérifications :
- Un webhook peut-il être falsifié ?
- Un fichier importé peut-il injecter du contenu malveillant ?
- Une dépendance ou un package peut-il être remplacé sans alerte ? [page:1]

### 9. Security Logging and Alerting Failures

Mesures à appliquer :
- Journaliser les connexions, échecs, changements de droits et actions sensibles.
- Centraliser les logs hors de la machine applicative.
- Détecter les volumes anormaux, les erreurs répétées et les accès inhabituels.
- Définir des alertes réellement surveillées.

Vérifications :
- Les événements critiques sont-ils tracés ?
- Les logs sont-ils immuables ou au moins protégés ?
- Une alerte déclenche-t-elle une action humaine ? [page:1][web:16]

### 10. Mishandling of Exceptional Conditions

Mesures à appliquer :
- Gérer proprement toutes les erreurs.
- Ne jamais renvoyer de traces techniques au client.
- Prévoir les timeouts, exceptions réseau et erreurs de dépendance.
- Faire échouer les opérations de façon sûre.

Vérifications :
- Une exception peut-elle exposer une clé, une requête SQL ou un chemin interne ?
- Une erreur de paiement ou d’API externe laisse-t-elle l’état dans une zone floue ?
- Les retries sont-ils contrôlés ? [page:1]

## Front-end

Le front-end doit être traité comme une surface d’attaque réelle, pas comme une simple couche d’affichage. Les protections importantes sont l’échappement des contenus, la prévention du XSS, le contrôle des redirections, la protection CSRF quand le modèle d’authentification l’exige, et la minimisation des données exposées au navigateur. [web:12][page:1]

Bonnes pratiques :
- Utiliser un framework qui échappe par défaut les sorties.
- Éviter `dangerouslySetInnerHTML` et tout rendu HTML non maîtrisé.
- Protéger le stockage local des jetons sensibles.
- Ne jamais mettre de secrets dans le code client.
- Valider les actions critiques côté serveur, même si le bouton est caché côté UI. [web:12][page:1]

Contrôles à faire :
- XSS réfléchi, stocké, DOM-based.
- Fuites via logs console, erreurs front, sources exposées.
- Vulnérabilités de dépendances NPM.
- Mauvaise gestion des tokens dans le navigateur.
- Redirections ouvertes et clickjacking. [web:1][page:1]

## Back-end

Le back-end porte les contrôles de confiance. Il doit authentifier, autoriser, valider, journaliser et isoler les composants critiques. Toute logique de sécurité qui n’existe que côté client est considérée comme inexistante. [page:1]

Bonnes pratiques :
- Utiliser des middlewares d’authentification robustes.
- Vérifier les rôles et les permissions sur chaque route sensible.
- Limiter les requêtes, les exports et les actions sensibles.
- Séparer les droits entre utilisateur, support, admin et service.
- Isoler les secrets dans un gestionnaire dédié. [page:1][web:19]

Contrôles à faire :
- IDOR et accès horizontaux.
- Escalade de privilèges.
- Injection SQL, NoSQL, template, command injection.
- SSRF et appels réseau non autorisés.
- Upload de fichiers dangereux.
- Mauvaise gestion des webhooks et callbacks. [web:1][web:4]

## Chaîne de développement

La chaîne de développement est une cible à part entière. En 2026, il faut considérer les dépôts Git, les runners CI, les secrets, les artefacts et les dépendances comme des actifs critiques. [web:4][page:1]

À mettre en place :
- MFA obligatoire sur le dépôt et la CI.
- Revue de code obligatoire pour les changements sensibles.
- Scan SAST, dépendances, secrets et conteneurs.
- Build reproductible si possible.
- Protection des branches et des déploiements.
- Rotation des clés et suppression des secrets expirés. [web:4][page:1]

## Plan de tests sécurité

- Tests unitaires de sécurité pour l’authentification et l’autorisation.
- Tests d’intégration sur les endpoints sensibles.
- Revue manuelle des permissions et des flux.
- Scan automatisé des dépendances et du code.
- Tests de pénétration ciblés avant mise en production.
- Vérification périodique des logs, alertes et journaux d’audit. [page:1]

## Liste de contrôle finale

- Tous les accès sensibles sont protégés par authentification forte.
- Les permissions sont vérifiées côté serveur.
- Les entrées sont validées et les sorties encodées.
- Les secrets ne sont jamais exposés au client.
- Les dépendances sont surveillées et verrouillées.
- Les erreurs ne divulguent rien d’exploitable.
- Les logs permettent une détection rapide des incidents.
- La CI/CD est sécurisée de bout en bout.
- Les données sensibles sont minimisées et protégées.
- Les risques OWASP 2025 sont couverts par des contrôles concrets. [page:1][web:1]