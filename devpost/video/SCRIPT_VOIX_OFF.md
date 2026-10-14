# Script de la voix off — à enregistrer avec votre propre voix

Durée de la vidéo : 2 min 03 s. Chaque réplique a sa fenêtre de temps : la vidéo attend le temps nécessaire pour la dire calmement.

## Méthode la plus simple (synchronisation automatique)

1. Sur votre téléphone (Dictaphone / Enregistreur vocal), enregistrez **chaque réplique séparément**, dans une pièce calme, téléphone à 20 cm de la bouche. Respirez normalement entre les phrases : c’est ce qui rend la voix naturelle.
2. Nommez les fichiers `01.m4a`, `02.m4a`, … (ou .mp3, .wav) dans l’ordre ci-dessous et copiez-les dans `devpost/video/voix/`.
3. Lancez : `python scripts/add_voiceover.py` → la vidéo finale `clairform_demo_voix.mp4` est créée, chaque réplique placée au bon moment, volume égalisé.

Variante : une seule prise continue `voix.m4a` en suivant les temps indiqués, puis `python scripts/add_voiceover.py --single voix.m4a`.

## Répliques

| Fichier | Début | Texte à dire |
|---|---|---|
| `01` | 0:00 (fenêtre 15 s) | Un dossier de subvention est souvent refusé pour une raison bête : une pièce manquante, un document périmé, un budget qui ne tombe pas juste. ClairForm vérifie tout ça avant le dépôt. |
| `02` | 0:15 (fenêtre 5 s) | Je crée un dossier pour l’appel auquel je réponds. |
| `03` | 0:20 (fenêtre 5 s) | J’importe le règlement de l’appel, un PDF de deux pages. |
| `04` | 0:25 (fenêtre 12 s) | ClairForm le lit et surligne chaque exigence à l’endroit exact où elle est écrite : les pièces à fournir, les conditions, et les règles chiffrées. |
| `05` | 0:37 (fenêtre 12 s) | Un clic, et j’ai le détail : la phrase d’origine, la page, et la contrainte repérée. Ici, un extrait qui doit dater de moins de trois mois. |
| `06` | 0:49 (fenêtre 8 s) | Maintenant, j’ajoute toutes mes pièces d’un coup. Chaque fichier est reconnu, puis rattaché à l’exigence qu’il couvre. |
| `07` | 0:57 (fenêtre 13 s) | Et là, trois problèmes. L’extrait date de cinq mois. La note fait douze pages au lieu de dix. Et le total du budget est faux de cinq cents euros. |
| `08` | 1:11 (fenêtre 13 s) | La synthèse me dit quoi faire en premier, et me rappelle de demander tout de suite la lettre du partenaire, parce que ça ne dépend pas de moi. |
| `09` | 1:23 (fenêtre 5 s) | J’importe les versions corrigées, et la lettre de soutien. |
| `10` | 1:28 (fenêtre 3 s) | Je retire les anciennes versions. |
| `11` | 1:32 (fenêtre 10 s) | Les conditions d’éligibilité, c’est moi qui les confirme. ClairForm ne décide pas à ma place. |
| `12` | 1:41 (fenêtre 8 s) | Le dossier est prêt. Chaque exigence a sa pièce, et tous les contrôles sont au vert. |
| `13` | 1:49 (fenêtre 8 s) | J’exporte un rapport PDF, et un paquet ZIP avec les pièces renommées dans l’ordre du règlement. |
| `14` | 1:57 (fenêtre 6 s) | Et mes documents n’ont jamais quitté mon ordinateur. C’est ClairForm. |
