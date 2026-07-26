# FrameUp — TikTok Cover Studio

Éditeur Next.js pour composer une image TikTok 9:16 à partir d’une bannière et de 1 à 9 visuels générés avec OpenAI.

## Démarrage

```bash
cp .env.example .env.local
# Ajoutez votre OPENAI_API_KEY dans .env.local
npm install
npm run dev
```

Ouvrez ensuite [http://localhost:3000](http://localhost:3000).

## Fonctionnement

- Brief libre sur la page d’accueil, envoyé avec Entrée comme dans une interface de chat
- Planification IA en deux étapes structurées : ossature éditoriale, puis prompts d’images
- Choix automatique du titre exact et d’un nombre pertinent de parties entre 1 et 9
- Préremplissage du studio avec la direction du titre, le style partagé et le style de chaque image
- Aperçu immédiat du layout 9:16 avant génération
- Grilles adaptatives de 1 à 9 visuels, avec centrage automatique des lignes incomplètes
- Couleur de fond personnalisable
- Bannière horizontale avec titre exact et direction artistique
- Titre, prompt et style propres à chaque vignette
- Direction artistique partagée entre les vignettes
- Génération individuelle ou parallèle de toute la cover, avec relance groupée automatique en cas de limitation OpenAI
- Édition directe des images générées dans l’aperçu : zoom, déplacement dans le cadre et snapping visuel sur les centres et les rebords
- Repérage des images éditables au survol, contour de sélection et désélection depuis toute zone libre de la colonne d’aperçu
- Édition directe des libellés de sujets dans l’aperçu, avec prise en charge des retours à la ligne manuels et alignement stable sur la première ligne
- Export final en PNG 1080×1920

La page `/` prépare le brief avec l’IA, tandis que `/studio` permet de modifier le résultat, générer les visuels et exporter la cover. Le plan préparé est transmis entre les deux pages avec `sessionStorage` et reste limité à l’onglet courant.

Les contraintes techniques cachées sont définies côté serveur dans `app/api/plan/route.ts` et `app/api/generate/route.ts`. Elles peuvent être remplacées avec `PLAN_OUTLINE_HIDDEN_PROMPT`, `PLAN_DETAILS_HIDDEN_PROMPT`, `TITLE_HIDDEN_PROMPT` et `CARD_HIDDEN_PROMPT` dans `.env.local`. Elles ne sont jamais envoyées au navigateur.

Le modèle de planification par défaut est `gpt-5.4-mini` et peut être remplacé avec `PLANNER_MODEL`. Les deux étapes utilisent la Responses API avec Structured Outputs : le second schéma impose exactement le nombre de cartes décidé par la première étape.

Le modèle configuré est `gpt-image-1.5` afin de permettre la génération de PNG avec fond transparent. Toutes les images utilisent le mode « Standard » afin de garder un bon compromis coût/qualité.
