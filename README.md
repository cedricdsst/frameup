# FrameUp — TikTok Cover Studio

Éditeur Next.js pour composer une image TikTok 9:16 à partir d’une bannière et de 4, 6 ou 9 visuels générés avec OpenAI.

## Démarrage

```bash
cp .env.example .env.local
# Ajoutez votre OPENAI_API_KEY dans .env.local
npm install
npm run dev
```

Ouvrez ensuite [http://localhost:3000](http://localhost:3000).

## Fonctionnement

- Aperçu immédiat du layout 9:16 avant génération
- Grilles 2×2, 2×3 et 3×3
- Couleur de fond personnalisable
- Bannière horizontale avec titre exact et direction artistique
- Titre et prompt propres à chaque vignette
- Direction artistique partagée entre les vignettes
- Génération individuelle ou séquentielle de toute la cover
- Export final en PNG 1080×1920

Les contraintes techniques cachées sont définies dans `app/api/generate/route.ts` et concaténées uniquement côté serveur. Elles peuvent être remplacées avec `TITLE_HIDDEN_PROMPT` et `CARD_HIDDEN_PROMPT` dans `.env.local`. Elles ne sont jamais envoyées au navigateur.

Le modèle configuré est `gpt-image-1.5` afin de permettre la génération de PNG avec fond transparent. Le mode « Standard » est sélectionné par défaut afin de garder un bon compromis coût/qualité. La génération de 10 images en haute qualité peut représenter un coût significatif.
