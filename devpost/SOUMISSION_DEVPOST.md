# Dossier de soumission Devpost — HACK47: OFFGRID

> **Date limite vérifiée le 12 octobre 2026 sur https://hack47-offgrid.devpost.com/details/dates :**
> soumissions du 15 septembre au **15 octobre 2026 à 00:00 EDT**, soit le **15 octobre à 05:00, heure de Lagos/Douala (UTC+1)**.
> Annonce des gagnants : 25 octobre 2026 à 09:00 EDT. Le règlement précise toutefois que le calendrier officiel « sera annoncé par l’équipe Hack47 » : vérifiez la page le jour même.
>
> Critères de jugement publiés : originalité, impact, exécution, sens produit, profondeur technique, potentiel.

## ⚠️ Champs à compléter vous-même

| Champ | Où | Valeur |
|---|---|---|
| Lien du dépôt GitHub | « Try it out » + section Technologies | `[À COMPLÉTER : https://github.com/<compte>/clairform]` |
| Lien de la vidéo (YouTube ou Vimeo, pour l’intégration sur Devpost) | champ « Video demo link » | `[À COMPLÉTER : https://youtu.be/...]` |
| Lien de démo en ligne (« Demo Link », demandé « whenever possible ») | champ « Try it out » | `[À COMPLÉTER : https://<votre-app>.onrender.com — déploiement gratuit pas à pas dans docs/DEPLOIEMENT.md, ~20-30 min]` |
| Membres de l’équipe | Devpost | `[À COMPLÉTER]` |
| Ce qui existait avant OFFGRID | section « Construit pendant OFFGRID » | `[À VÉRIFIER : confirmez les dates réelles de votre prototype initial]` |

---

## Nom du projet
**ClairForm**

## Slogan (Devpost « Elevator pitch », 200 caractères max.)
Votre dossier de candidature, vérifié pièce par pièce. ClairForm lit l’appel à projets, contrôle vos pièces et vous dit quoi corriger — sans qu’aucun document ne quitte votre ordinateur.

*(186 caractères)*

## Description courte (1–2 phrases)
ClairForm transforme le règlement d’un appel à projets en checklist sourcée, la compare aux documents du candidat et signale ce qui manque, ce qui est périmé ou ce qui contredit le règlement. Tout fonctionne en local, sans compte et sans cloud.

---

## Inspiration / Le problème

Un dossier de subvention est souvent écarté avant même d’être lu : extrait d’immatriculation de plus de trois mois, note de présentation trop longue, budget dont le total ne tombe pas juste, lettre de partenaire demandée trop tard. Ces règles sont éparpillées dans un règlement de plusieurs dizaines de pages, et la vérification se fait à la main, la veille de la date limite.

Le coût est réel. Selon une étude menée pour la Law Family Commission on Civil Society (Royaume-Uni, 2022, rapportée par *Charity Times*), les petites associations consacrent environ **38 % de leurs revenus de subventions** à la préparation des candidatures. Ce chiffre concerne le Royaume-Uni. Dans le contexte francophone, en Afrique en particulier, les jeunes structures cumulent souvent plusieurs appels, avec des pièces administratives (RCCM, attestations fiscales, CNPS) longues à obtenir.

Les outils existants aident surtout à **trouver** des financements ou à **rédiger** les textes. Ce sont des services en ligne par abonnement, pensés pour les marchés anglophones, qui demandent d’envoyer ses pièces d’identité, statuts et coordonnées bancaires sur un serveur tiers. Personne ne vérifie le **dossier lui-même** contre le règlement, et encore moins hors ligne.

**Pour qui ?** Porteurs de projets, associations, startups et ONG qui répondent à des appels à projets, ainsi que les incubateurs et chargés d’accompagnement qui relisent leurs dossiers.

## Ce que fait ClairForm

1. **Lire l’appel.** Importez le règlement (PDF texte, Word, texte). ClairForm extrait chaque pièce demandée, chaque condition d’éligibilité et chaque règle chiffrée. Chaque exigence reste **surlignée à l’endroit exact où elle est écrite**, avec sa page et la raison de sa sélection.
2. **Comprendre les contraintes.** Date limite, plafond de subvention, cofinancement minimal, durée maximale, nombre de pages, « datant de moins de 3 mois », « en cours de validité », « signé », « deux CV ».
3. **Reconnaître les pièces.** Importez tous vos fichiers d’un coup (PDF, Word, Excel, CSV, photos). Chaque document est classé parmi 17 types (CNI, RCCM/statuts, attestation fiscale, RIB, budget, CV, lettre de soutien…) puis rattaché à l’exigence qu’il couvre. Vous confirmez ou corrigez.
4. **Contrôler la cohérence.** Total du budget différent de la somme des lignes, montant demandé au-dessus du plafond, apport propre insuffisant, montant demandé différent selon les documents, calendrier plus long que permis, extrait trop ancien à la date limite, pièce d’identité expirée, note trop longue, signature introuvable, doublons.
5. **Dire quoi faire ensuite.** Les actions sont classées par priorité : corriger les erreurs, puis **demander tout de suite** les pièces qui dépendent d’un tiers (banque, administration, partenaire), puis compléter et confirmer.
6. **Exporter.** Un rapport PDF, un paquet ZIP des pièces renommées dans l’ordre de la checklist (avec empreinte SHA-256 de chaque fichier) et les données en JSON.

ClairForm ne décide pas à votre place : les conditions d’éligibilité sont confirmées par vous, et chaque alerte cite sa source.

## Comment nous l’avons construit

- **Backend Python** (Starlette, Uvicorn, Pydantic, SQLite). Chaque fichier importé est lu dans un **processus isolé** avec délai et limite mémoire (pypdf, python-docx, openpyxl, Pillow), après vérification de l’extension, de la signature binaire et de la taille.
- **Analyseur de règlements** déterministe : segmentation en titres, listes et phrases (y compris les lignes coupées par la mise en page PDF), détection des formulations obligatoires en français et en anglais, des sections « Pièces à fournir » et « Éligibilité », extraction de dates (« 1er décembre 2026 », « 03/02/2027 », « March 3, 2027 ») et de montants (€, FCFA, XAF, USD), fusion des précisions (« La note ne doit pas dépasser 10 pages ») dans l’exigence concernée.
- **Moteur d’évaluation** pur et testable : rattachements automatiques expliqués, décisions de l’utilisateur prioritaires, contrôles budgétaires et calendaires, pourcentage de couverture pondéré (exigences critiques comptées double), actions classées par priorité.
- **Interface** React (embarqué, sans CDN) et TypeScript strict, sans bundler. L’identité visuelle s’inspire du dossier administratif : papier gris-bleu, encre bleue pour les actions, et le **surligneur jaune réservé au texte de l’appel**, le geste que l’on fait tous à la main sur un règlement.
- **Sécurité** : protection CSRF et contre le DNS rebinding, CSP stricte, fichiers stockés sous des noms générés, annulation d’import confirmée par le serveur, aucune requête réseau sortante.
- **Tests** : 88 tests automatisés, dont un parcours complet piloté dans Chromium (Playwright) : import de vrais fichiers, erreurs, annulation d’un envoi lent, réponses serveur invalides, coupure réseau, clavier seul, mobile, isolement entre visiteurs en ligne.

## Difficultés rencontrées

- **Le texte des PDF n’a pas de structure.** Les lignes sont coupées au milieu des phrases, les listes numérotées ressemblent à des titres (« 4. Pièces à fournir » contre « 1. Une copie de… »), et les phrases d’introduction (« …sous peine d’irrecevabilité : ») portent le caractère obligatoire de toute la liste qui suit. Il a fallu une segmentation qui distingue continuation de ligne, titre, puce et introduction de liste.
- **Associer la bonne date au bon usage.** Sur une pièce d’identité, la date de naissance, la date de délivrance et la date d’expiration se côtoient. Le moteur lit les quelques mots qui précèdent chaque date pour ne retenir que la bonne.
- **Rester honnête.** Nous avons écarté tout score « magique » : chaque statut a une explication, chaque alerte une source, et l’utilisateur peut contredire la machine.
- **Annuler pour de vrai.** Annuler un import dans le navigateur ne suffit pas si le serveur a déjà reçu les octets. L’annulation passe donc par le serveur, qui supprime ou rejette l’import.

## Ce dont nous sommes fiers

- Le **surlignage cliquable** : on voit précisément ce que l’outil a compris de l’appel, et on peut le corriger.
- Une démo qui n’est pas truquée : le dossier prérempli passe par **exactement le même moteur** que vos fichiers, et les erreurs détectées viennent de vrais fichiers (un PDF de 12 pages, un classeur Excel au total faux, un extrait daté de 5 mois).
- Un fonctionnement **entièrement hors ligne** en local, cohérent avec le nom OFFGRID : rien n’est envoyé à un tiers. La version en ligne donne à chaque visiteur un espace privé et efface les dossiers inactifs.

## Ce que nous avons appris

[À PERSONNALISER — quelques pistes vraies pour ce projet : la lecture de documents réels est plus difficile que la génération de texte ; un produit utile peut être déterministe ; la confiance vient de la traçabilité (source, page, phrase).]

## Construit pendant OFFGRID

[À VÉRIFIER ET ADAPTER selon votre historique réel.] Un premier prototype (« clairm-form ») reposait sur un jeu d’exigences codé en dur et une démonstration scénarisée. Pendant OFFGRID, le projet a été **reconstruit** : analyseur de règlements générique, lecture isolée des fichiers, 17 types de pièces, 20 types de contrôles, interface entièrement nouvelle (surlignage, panneau de détail, imports multiples avec progression et annulation), exports PDF et ZIP, sécurité, mode en ligne avec espaces privés et suite de 88 tests. Le détail figure dans `docs/audit-version-precedente.md` du dépôt.

## Et ensuite

- OCR local (Tesseract) pour les pièces scannées, qui reste exécuté sur l’ordinateur.
- Bibliothèque partagée de « profils d’appels » réutilisables, relus par des incubateurs.
- Mode accompagnant : un incubateur suit plusieurs dossiers et repère les blocages communs.
- Application de bureau empaquetée (un double-clic, sans Python).
- Option, désactivée par défaut, d’aide à la reformulation via un modèle d’IA local.

---

## Technologies (« Built with »)

`python` `starlette` `uvicorn` `pydantic` `sqlite` `pypdf` `python-docx` `openpyxl` `reportlab` `pillow` `react` `typescript` `playwright`

## Tiers et outils d’IA (transparence demandée par le règlement)

- Bibliothèques open source listées ci-dessus. Licences dans `THIRD_PARTY_NOTICES.md`.
- La voix de la vidéo est celle de l’équipe (enregistrement réel).  `[À CONSERVER seulement si c’est le cas]`
- **Aucune API ni aucun modèle d’IA dans le produit.**
- Le développement a été assisté par un assistant de code IA (Claude, Anthropic) : code, tests, documentation et textes de cette soumission.

---

## Instructions de démonstration pour le jury

1. En ligne : ouvrir le lien de démo (hébergement gratuit : le premier accès peut prendre environ une minute, le temps que le serveur se réveille). En local : `pip install -r requirements.txt` puis `python scripts/run.py`, et ouvrir http://localhost:8000.
2. Cliquer sur **« Découvrir avec un dossier prérempli »** (un appel à projets et huit pièces, analysés en direct).
3. Onglet **Appel** : cliquer sur un passage surligné, comme « datant de moins de 3 mois ».
4. Onglet **Contrôles** : 3 erreurs réelles, avec la pièce concernée et la phrase du règlement.
5. Pour le parcours complet : `python scripts/make_samples.py`, puis importer `data/samples/3_corrections/` dans l’onglet **Pièces**, supprimer les 3 anciennes versions et confirmer les conditions dans **Checklist**. Le dossier passe à **« Prêt à déposer — 100 % »**.
6. Onglet **Exporter** : rapport PDF et paquet ZIP.

## Médias fournis dans ce dossier

- `images/00_couverture.png` : vignette 3:2 (capture réelle de l’application).
- `images/01…07_*.png` : galerie, captures réelles de l’application.
- `video/clairform_demo.mp4` (≈ 2 min, 1440×900, sous-titres incrustés) : parcours réel enregistré automatiquement dans Chromium, rythmé pour être commenté. **Ajoutez votre voix** : enregistrez les 14 répliques de `video/SCRIPT_VOIX_OFF.md` sur votre téléphone, déposez-les dans `video/voix/` (01.m4a, 02.m4a…), puis lancez `python scripts/add_voiceover.py` → `clairform_demo_voix.mp4`, prête à publier sur YouTube en « non répertoriée ».
