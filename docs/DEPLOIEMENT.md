# Mettre ClairForm en ligne gratuitement

Le hackathon demande un **lien de démo** (« Demo Link : provide a working demo whenever possible »). Ce guide permet d’obtenir une adresse publique du type `https://clairform-xxxx.onrender.com`, **sans payer** (offre gratuite de Render, conditions vérifiées le 14 octobre 2026 sur https://render.com/docs/free ; la page ne mentionne pas de carte bancaire pour l’offre gratuite, vérifiez-le à l’inscription).

Durée : **20 à 30 minutes** la première fois, dont 5 à 10 minutes d’attente pendant que Render installe l’application.

| Ce qui a été vérifié avant livraison | Résultat |
|---|---|
| Le dépôt, une fois envoyé sur Git puis récupéré par clonage, démarre avec exactement la commande et les réglages de `render.yaml` (`CLAIRFORM_MODE=public`, `CLAIRFORM_READER=inprocess`, port fourni par la variable `PORT`) | ✅ démarre, `/api/health` répond `ok` |
| Parcours complet dans Chromium avec ces réglages (5 tests de bout en bout : dossier prérempli, imports, erreurs, annulation, exports, mobile) | ✅ réussi |
| Isolement entre deux visiteurs (aucun ne voit les dossiers de l’autre) | ✅ réussi (`test_api.PublicMode`) |
| Déploiement réel chez Render ou Hugging Face | ❌ **non fait** : il faut votre compte. Les étapes ci-dessous vous guident. |

---

## Ce que vous obtenez avec l’offre gratuite (et ses limites)

- Une adresse HTTPS publique, à coller dans Devpost.
- **Mise en veille après 15 minutes sans visite.** La visite suivante attend environ **1 minute** (page « Service waking up »). Ouvrez donc le lien vous-même quelques minutes avant que le jury ne le teste, et précisez-le dans la soumission (texte prêt à copier en fin de document).
- **Pas de disque permanent.** Les dossiers créés par les visiteurs disparaissent à chaque mise en veille ou redémarrage. Pour une démo, ce n’est pas gênant : le bouton « Découvrir avec un dossier prérempli » recrée tout en quelques secondes.
- Machine modeste : 512 Mo de mémoire et 0,1 processeur. Le réglage `CLAIRFORM_READER=inprocess` (déjà présent dans `render.yaml`) lit les fichiers dans le serveur lui-même, ce qui est beaucoup plus rapide sur une si petite machine.
- 750 heures gratuites par mois, largement suffisant pour un seul service.

---

## Étape 1 — Créer les comptes (5 min)

1. **GitHub** : https://github.com/signup (gratuit). Notez votre nom d’utilisateur.
2. **Render** : https://dashboard.render.com/register, puis choisissez **« Sign up with GitHub »** pour relier les deux comptes directement.

## Étape 2 — Mettre le code sur GitHub (5 à 10 min)

Le dépôt doit être **public** : le hackathon demande aussi le lien du code source.

### Méthode A — avec Git en ligne de commande (Windows, macOS ou Linux)

Installez Git si besoin (https://git-scm.com/downloads), puis, dans le dossier `clairform` décompressé :

```bash
git init
git add .
git commit -m "ClairForm — HACK47 OFFGRID"
git branch -M main
```

Sur https://github.com/new, créez un dépôt nommé `clairform`, en **Public**, **sans** README ni .gitignore (le projet les contient déjà). Puis :

```bash
git remote add origin https://github.com/VOTRE-NOM/clairform.git
git push -u origin main
```

Si Git demande un mot de passe : GitHub n’accepte plus le mot de passe du compte. Créez un jeton sur https://github.com/settings/tokens → *Generate new token (classic)*, cochez `repo`, et collez ce jeton à la place du mot de passe.

### Méthode B — sans ligne de commande : GitHub Desktop

1. Installez https://desktop.github.com et connectez-vous.
2. *File → Add local repository* → choisissez le dossier `clairform`. Si le logiciel propose « create a repository », acceptez.
3. Saisissez un message dans « Summary » (par exemple « ClairForm »), cliquez sur **Commit to main**, puis sur **Publish repository**. **Décochez « Keep this code private »**.

### Vérification

Sur `https://github.com/VOTRE-NOM/clairform`, vous devez voir à la racine les dossiers `backend`, `frontend` et `scripts`, ainsi que les fichiers `render.yaml`, `requirements.txt` et `.python-version`. Le dossier `frontend/dist` doit être présent : c’est l’interface déjà compilée.

## Étape 3 — Déployer sur Render (5 min de clics, 5 à 10 min d’attente)

1. Ouvrez https://dashboard.render.com, puis **New + → Blueprint**.
2. Choisissez le dépôt `clairform`. Si la liste est vide, cliquez sur *Configure account* et autorisez Render à accéder au dépôt.
3. Render lit `render.yaml` et affiche un service web `clairform` en **plan Free**. Cliquez sur **Apply** (ou *Deploy Blueprint*).
4. Ouvrez le service `clairform` et suivez l’onglet **Logs**. Vous devez voir l’installation (`pip install -r requirements.txt`), puis la ligne `ClairForm : http://0.0.0.0:10000`. Le statut passe à **Live**.
5. L’adresse publique s’affiche en haut de la page, par exemple `https://clairform-ab12.onrender.com`. **C’est votre lien de démo.**

### Si « Blueprint » ne s’affiche pas : déploiement manuel

1. **New + → Web Service** → choisissez le dépôt `clairform`.
2. Remplissez les champs :
   - *Language* : **Python 3**
   - *Branch* : `main`
   - *Build Command* : `pip install -r requirements.txt`
   - *Start Command* : `python scripts/run.py`
   - *Instance Type* : **Free**
3. Sous *Environment Variables*, ajoutez :

   | Key | Value |
   |---|---|
   | `CLAIRFORM_MODE` | `public` |
   | `CLAIRFORM_HOST` | `0.0.0.0` |
   | `CLAIRFORM_READER` | `inprocess` |

4. Dans *Advanced → Health Check Path*, saisissez `/api/health`, puis cliquez sur **Create Web Service**.

## Étape 4 — Vérifier que tout fonctionne en ligne (3 min)

1. Ouvrez `https://VOTRE-ADRESSE/api/health`. Vous devez lire `"status":"ok"`, `"problems":[]` et `"mode":"public"`.
2. Ouvrez `https://VOTRE-ADRESSE/`. Le badge en haut à droite indique **« Espace privé »**.
3. Cliquez sur **« Découvrir avec un dossier prérempli »**. Après quelques secondes, le dossier « Kombi Solaire — Fonds Tremplin Impact 2027 » s’affiche, avec 3 points à corriger.
4. Onglet **Pièces** : importez un PDF de votre ordinateur. Il doit être lu sans erreur.
5. Onglet **Exporter** : téléchargez le rapport PDF.
6. Ouvrez la même adresse dans une fenêtre de navigation privée : la liste « Mes dossiers » doit être vide, car chaque visiteur a son propre espace.

## Étape 5 — Renseigner Devpost

- **Try it out / Demo link** : `https://VOTRE-ADRESSE.onrender.com`
- **Source code** : `https://github.com/VOTRE-NOM/clairform`
- Phrase à ajouter dans la description (copier-coller) :

> Démo en ligne hébergée gratuitement : au premier accès, le serveur peut mettre environ une minute à se réveiller. Cliquez ensuite sur « Découvrir avec un dossier prérempli ». Chaque visiteur dispose d’un espace privé, effacé automatiquement.

**Juste avant la date limite et pendant la période de jugement :** ouvrez le lien de temps en temps pour vérifier qu’il répond.

---

## Option B — Hugging Face Spaces (nécessite un compte PRO payant)

> Vérifié le 14 octobre 2026 dans la documentation Hugging Face : la création d’un Space **Docker** demande désormais un abonnement PRO pour un compte personnel. Seuls les Spaces statiques restent gratuits, ce qui ne suffit pas pour ClairForm. Les étapes ci-dessous restent valables si vous avez PRO.

Utile si Render pose problème. Ce `Dockerfile` spécifique n’a pas pu être construit ici (aucun service Docker disponible) : préférez Render, qui est l’option vérifiée.

1. Créez un compte sur https://huggingface.co/join.
2. Sur https://huggingface.co/new-space, saisissez le *Space name* `clairform`, choisissez la *License* MIT, le *SDK* **Docker** (*Blank template*) et le *Hardware* **CPU basic · FREE**, en visibilité **Public**. Cliquez sur **Create Space**.
3. Dans l’onglet **Files** du Space, cliquez sur *Add file → Upload files* et envoyez :
   - les dossiers `backend`, `frontend/dist` (en conservant le chemin `frontend/dist`), le fichier `scripts/run.py` et `requirements.txt` ;
   - **le fichier `deploy/huggingface/Dockerfile`, placé à la racine du Space sous le nom `Dockerfile`** ;
   - **le fichier `deploy/huggingface/README.md`, placé à la racine sous le nom `README.md`**, qui remplace celui créé par défaut.

   Avec Git, plus simple pour de nombreux fichiers :

   ```bash
   git clone https://huggingface.co/spaces/VOTRE-NOM/clairform hf-space
   cp -r backend requirements.txt hf-space/
   mkdir -p hf-space/frontend hf-space/scripts
   cp -r frontend/dist hf-space/frontend/
   cp scripts/run.py hf-space/scripts/
   cp deploy/huggingface/Dockerfile hf-space/Dockerfile
   cp deploy/huggingface/README.md hf-space/README.md
   cd hf-space && git add . && git commit -m "ClairForm" && git push
   ```

   (Mot de passe demandé par `git push` : un jeton *write* créé sur https://huggingface.co/settings/tokens.)
4. Le Space se construit (onglet *Logs*), puis passe à **Running**.
5. **Lien à donner au jury : l’adresse directe `https://VOTRE-NOM-clairform.hf.space`**, et non la page `huggingface.co/spaces/…`. L’adresse directe évite l’affichage dans un cadre, où certains navigateurs bloquent les cookies : l’espace privé du visiteur ne fonctionnerait alors pas.

## Option C — Docker (hébergeur de votre choix)

Le `Dockerfile` à la racine produit une image prête pour la production, qui écoute sur `$PORT` et stocke ses données dans `/data`. Pour la tester sur votre ordinateur avec Docker Desktop :

```bash
docker build -t clairform .
docker run --rm -p 8000:8000 -v clairform-data:/data clairform
```

> L’image Docker n’a pas pu être construite dans l’environnement où ce projet a été préparé (aucun service Docker disponible). Le déploiement gratuit recommandé (Render, runtime Python) n’utilise pas Docker.

---

## Toutes les variables d’environnement

| Variable | Valeur conseillée en ligne | Rôle |
|---|---|---|
| `CLAIRFORM_MODE` | `public` | Un espace privé par navigateur (cookie `HttpOnly`) et effacement des dossiers inactifs |
| `CLAIRFORM_HOST` | `0.0.0.0` | Écoute sur toutes les interfaces |
| `PORT` | fourni par l’hébergeur | Port d’écoute |
| `CLAIRFORM_READER` | `inprocess` sur une petite machine, `isolated` sinon | Lecture des fichiers dans le serveur, ou dans un processus séparé et isolé (plus sûr, mais plus lent) |
| `CLAIRFORM_RETENTION_DAYS` | `2` à `7` | Jours avant l’effacement d’un dossier inactif |
| `CLAIRFORM_MAX_DOSSIERS` | `10` | Nombre maximal de dossiers par visiteur |
| `CLAIRFORM_MAX_UPLOAD_MB` | `20` | Taille maximale d’un fichier |
| `CLAIRFORM_ALLOWED_HOSTS` | votre domaine (facultatif) | Liste blanche de noms d’hôte. Vide : tous acceptés. |
| `CLAIRFORM_DATA_DIR` | `/data` si un disque permanent existe | Emplacement de la base de données et des fichiers |
| `CLAIRFORM_FRAME_ANCESTORS` | `https://huggingface.co` (Hugging Face uniquement) | Autorise l’affichage de l’application dans un cadre (iframe) sur ce site |

## En cas de problème

| Symptôme | Cause probable | Solution |
|---|---|---|
| La construction échoue sur `pip install` | Version de Python | Le fichier `.python-version` (contenu : `3.13`) doit être présent à la racine du dépôt. |
| *Live* puis erreur 502 au premier accès | Réveil après mise en veille | Attendez une minute et rechargez. |
| Bandeau rouge « La lecture des documents ne fonctionne pas sur ce serveur » | Dépendances manquantes | Vérifiez dans *Logs* que `pip install -r requirements.txt` s’est terminé sans erreur, puis relancez avec *Manual Deploy → Clear build cache & deploy*. |
| « Hôte non autorisé » | `CLAIRFORM_ALLOWED_HOSTS` ne contient pas l’adresse utilisée | Videz cette variable, ou ajoutez le domaine exact. |
| Les dossiers ont disparu | Offre gratuite sans disque permanent (comportement attendu) | Recréez le dossier prérempli. Pour conserver les données : offre payante avec disque, montée sur `/data`. |

## Aller plus loin (au-delà du hackathon)

- **Données durables** : un disque persistant (offre payante chez Render, volume chez Railway ou Fly.io) monté sur `/data`, avec `CLAIRFORM_DATA_DIR=/data`.
- **Comptes utilisateurs** : remplacer le cookie d’espace par une authentification. L’isolement est déjà appliqué à chaque requête par `path_id()` dans `backend/clairform/app.py`.
- **Serveur personnel** (VPS) : lancer `python scripts/run.py` avec les variables ci-dessus derrière Nginx et un certificat Let’s Encrypt. Nginx doit transmettre les en-têtes `Host` et `X-Forwarded-Proto`, avec `client_max_body_size 25m`.
