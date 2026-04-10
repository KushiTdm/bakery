# RGPD et CNIL en 2026
## Base pratique de conformité

Ce document résume les priorités utiles pour une conformité RGPD solide en 2026, en s’appuyant sur la CNIL et ses communications récentes. La CNIL met particulièrement l’accent sur la sécurité des traitements, la transparence et l’information des personnes, ainsi que sur le renforcement de la protection des grandes bases de données. [web:11][page:1]

## Objectif

L’objectif est de construire une conformité exploitable, documentée et démontrable. En 2026, la logique n’est plus seulement “être conforme”, mais aussi être capable de le prouver rapidement en cas de contrôle. [web:11][web:17]

## Principes essentiels

- Déterminer une base légale claire pour chaque traitement.
- Informer les personnes de manière transparente.
- Limiter les données collectées au strict nécessaire.
- Encadrer les durées de conservation.
- Sécuriser les accès et tracer les actions.
- Formaliser les relations avec les sous-traitants.
- Être capable de démontrer la conformité. [web:11][page:1]

## Transparence et information

La CNIL et le CEPD ont lancé en 2026 une action coordonnée sur les obligations de transparence et d’information prévues par le RGPD, ce qui confirme l’attention portée à ces sujets. Les articles 12, 13 et 14 du RGPD imposent d’informer les personnes concernées de l’existence et des conditions du traitement de leurs données. [web:11]

À vérifier dans chaque projet :
- Qui est le responsable de traitement.
- Quelles données sont collectées.
- Pourquoi elles sont collectées.
- Combien de temps elles sont conservées.
- À qui elles sont transmises.
- Quels sont les droits des personnes.
- Comment exercer ces droits. [web:11]

## Sécurité des traitements

L’article 32 du RGPD impose des mesures techniques et organisationnelles adaptées au risque. La CNIL rappelle que la sécurité doit être pensée selon l’état de l’art, les risques concrets et l’architecture du traitement. [page:1]

Mesures attendues :
- Authentification multifacteur pour les accès sensibles.
- Journalisation des accès et des actions.
- Supervision des anomalies.
- Limitation des extractions massives.
- Gestion structurée des identités et des habilitations.
- Sensibilisation régulière des équipes.
- Contrôle des sous-traitants et de leurs mesures de sécurité. [page:1][web:19]

## Grandes bases de données

La CNIL a publié en 2025 des consignes renforcées pour les grandes bases de données, et indique que la politique de contrôle sera renforcée en 2026 pour vérifier la mise en place de l’authentification multifacteur dans ces contextes. Elle rappelle que les bases de plusieurs millions de personnes doivent être protégées par des mesures de défense en profondeur. [page:1]

Mesures particulièrement importantes :
- MFA sur les accès externes et comptes à privilèges.
- Journalisation et analyse des flux de données.
- Limitation des exportations et requêtes massives.
- Surveillance des accès inhabituels.
- Séparation des rôles et des environnements.
- Audits réguliers des sous-traitants. [page:1]

## Sous-traitance

L’article 28 du RGPD impose un contrat avec chaque sous-traitant. Ce contrat doit encadrer les finalités, la durée, les instructions documentées, les sous-traitants ultérieurs et la notification des violations de données. [page:1]

Bonnes pratiques :
- Vérifier la PSSI ou l’équivalent du sous-traitant.
- Évaluer ses garanties de sécurité avant signature.
- Prévoir des audits ou inspections si le traitement est sensible.
- Encadrer précisément les accès aux données.
- Vérifier que les sous-traitants ultérieurs sont également maîtrisés. [page:1]

## Journalisation et preuve

La CNIL insiste sur une journalisation adaptée, exploitée et utile. Il ne suffit pas de stocker des logs : il faut pouvoir détecter un incident tôt, analyser les accès a posteriori et réagir rapidement. [page:1][web:16]

La journalisation doit permettre de :
- Tracer les accès aux applicatifs, API, systèmes et réseaux.
- Détecter les comportements anormaux.
- Contrôler les flux de données sensibles.
- Conserver les rejets et tentatives suspectes.
- Séparer les logs du système principal quand c’est pertinent.
- Retenir une durée de conservation adaptée au besoin de sécurité. [page:1]

## Données sensibles

Les traitements portant sur des données sensibles ou exposant les personnes à un risque élevé exigent un niveau de protection renforcé. La CNIL rappelle que la MFA est particulièrement requise lorsque la violation pourrait exposer des données bancaires, des numéros de sécurité sociale ou d’autres données sensibles. [page:1]

À contrôler :
- Qui peut accéder aux données sensibles.
- Si l’accès à distance est correctement protégé.
- Si les accès admin sont isolés.
- Si les secrets et clés sont protégés.
- Si les exports sont limités et surveillés. [page:1][web:19]

## Droits des personnes

Les personnes disposent notamment de droits d’accès, de rectification, d’effacement, de limitation, d’opposition et de portabilité selon les cas. Le traitement doit être organisé pour répondre dans les délais légaux et avec un processus vérifiable. [web:11]

Bonnes pratiques :
- Mettre en place un canal unique pour les demandes.
- Vérifier l’identité du demandeur avec prudence.
- Suivre les délais de réponse.
- Documenter les demandes et les réponses.
- Prévoir une procédure d’escalade en cas de doute. [web:11]

## Registre et documentation

La conformité doit être documentée de façon claire. Le registre des traitements, les analyses de risques, les procédures de sécurité, les contrats de sous-traitance et les preuves de sensibilisation constituent le socle de démonstration attendu. [web:17][page:1]

Documents à maintenir :
- Registre des traitements.
- Politique de sécurité.
- Procédures de gestion des violations.
- Contrats de sous-traitance.
- Preuves de formation.
- Analyses d’impact si nécessaire.
- Historique des contrôles et audits. [web:17][page:1]

## Violations de données

En cas de violation, l’organisation doit réagir vite. Il faut qualifier l’incident, limiter son impact, documenter les faits, notifier si nécessaire et corriger la cause racine. [page:1]

Réflexes :
- Isoler le périmètre affecté.
- Réinitialiser les accès compromis.
- Conserver les éléments utiles à l’enquête.
- Évaluer le risque pour les personnes.
- Préparer la notification CNIL si elle est requise.
- Prévenir les personnes concernées si le risque l’exige. [page:1]

## Checklist conformité

- Les personnes sont informées de façon claire et complète.
- Chaque traitement a une finalité et une base légale documentées.
- Les durées de conservation sont définies.
- Les accès sont restreints et protégés par MFA quand nécessaire.
- Les logs sont conservés et exploités.
- Les sous-traitants sont encadrés par contrat.
- Les droits des personnes sont gérés par une procédure fiable.
- Les violations de données ont une procédure dédiée.
- La conformité peut être démontrée rapidement.
- Les exigences CNIL 2026 sont prises en compte dans l’exploitation réelle. [web:11][page:1]