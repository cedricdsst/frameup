# FrameUp — TikTok Cover Studio

Éditeur Next.js pour composer une image TikTok 9:16 à partir d’une bannière et de 1 à 9 visuels générés avec OpenAI.

## Démarrage

```bash
cp .env.example .env.local
# Ajoutez votre OPENAI_API_KEY dans .env.local
npm install
npm run dev
```

Ouvrez ensuite [http://localhost:3002](http://localhost:3002).

## Fonctionnement

- Brief libre sur la page d’accueil, envoyé avec Entrée comme dans une interface de chat
- Planification IA en deux étapes structurées : ossature éditoriale, puis prompts d’images
- Choix automatique du titre exact et d’un nombre pertinent de parties entre 1 et 9
- Préremplissage du studio avec la direction du titre, un style partagé et un prompt par image
- Option « Style stickman » dès le brief et dans le studio : dessin MS Paint volontairement amateur, contours noirs tremblants, formes simples et couleurs plates, sans imposer de personnages bâtons
- Ouverture directe du projet dans le studio après la préparation du brief
- Un seul prompt modifiable par image ; le style commun et le prompt du titre sont accessibles dans des sections repliées
- Aperçu immédiat du layout 9:16 avant génération
- Grilles adaptatives de 1 à 9 visuels, avec centrage automatique des lignes incomplètes
- Couleur de fond personnalisable
- Bannière horizontale avec titre exact et direction artistique
- Titre et prompt modifiables pour chaque vignette
- Direction artistique partagée entre les vignettes
- Génération individuelle ou parallèle de toute la cover, avec relance groupée automatique en cas de limitation OpenAI
- Édition directe des images générées dans l’aperçu : zoom, déplacement dans le cadre et snapping visuel sur les centres et les rebords
- Repérage des images éditables au survol, contour de sélection et désélection depuis toute zone libre de la colonne d’aperçu
- Édition directe des libellés de sujets dans l’aperçu, avec prise en charge des retours à la ligne manuels et alignement stable sur la première ligne
- Export final en PNG 1080×1920

La page `/` prépare le brief avec l’IA et crée un projet persistant. La page `/projects` liste tous les projets, tandis que `/studio/[projectId]` permet de reprendre un projet, modifier le résultat, générer les visuels et exporter la cover.

Le parcours simple est : saisir le brief, éventuellement cocher « Style stickman », puis cliquer sur « Générer la cover » dans le studio. Les prompts sont déjà prêts. Pour corriger un résultat, modifier uniquement son prompt et cliquer sur le bouton de génération de cette image. Une cover complète peut aussi être entièrement régénérée.

Le preset Paint reprend les consignes de `stikman_generator/general_style.md` et `server.js`, sans les règles imposant un personnage récurrent. Il est défini dans `lib/visual-style.ts`, transmis aux deux étapes de planification et réappliqué côté serveur à chaque génération (bannière comprise). Il reste prioritaire sur les styles incompatibles. Le choix est enregistré dans `stickmanStyle` ; les anciens projets utilisent le mode habituel tant que l’option n’est pas cochée. Changer l’option ne régénère pas les images existantes automatiquement.

Les anciens styles individuels sont réunis avec leur description dans le champ de prompt unique à l’ouverture du studio, puis sauvegardés sans perdre ces consignes. Le style partagé reste indépendant et n’est plus tronqué à 1 000 caractères lors de la génération.

Les projets sont enregistrés localement dans `data/projects/<projectId>/`. Chaque dossier contient :

- `project.json`, avec les textes, prompts, réglages, placements et références d’images ;
- `images/`, avec les PNG transparents générés pour ce projet.

Le studio sauvegarde automatiquement les modifications après une courte temporisation. Le dossier `data/projects` est ignoré par Git afin de ne pas publier les créations ni alourdir le dépôt.

Les contraintes techniques cachées sont définies côté serveur dans `app/api/plan/route.ts` et `app/api/generate/route.ts`. Elles peuvent être remplacées avec `PLAN_OUTLINE_HIDDEN_PROMPT`, `PLAN_DETAILS_HIDDEN_PROMPT`, `TITLE_HIDDEN_PROMPT` et `CARD_HIDDEN_PROMPT` dans `.env.local`. Elles ne sont jamais envoyées au navigateur.

Le modèle de planification par défaut est `gpt-5.4-mini` et peut être remplacé avec `PLANNER_MODEL`. Les deux étapes utilisent la Responses API avec Structured Outputs : le second schéma impose exactement le nombre de cartes décidé par la première étape.

Le modèle configuré est `gpt-image-1.5` afin de permettre la génération de PNG avec fond transparent. Toutes les images utilisent le mode « Standard » afin de garder un bon compromis coût/qualité.

## Vérification

`npm test` vérifie la transmission du preset aux deux étapes IA, la génération et la régénération, les destinations invalides, les limites API et la sauvegarde/reprise des projets. Les appels OpenAI sont simulés et les écritures utilisent des dossiers temporaires isolés. `npm run build` vérifie la compilation de production.
