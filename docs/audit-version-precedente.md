# Audit de la version précédente (archive `clairm-form-main.zip`)

Cet audit a été réalisé par **lecture du code**. Cette ancienne version n’a pas pu être exécutée ici, car son serveur dépend de FastAPI, non installable dans l’environnement de travail (accès à PyPI bloqué). Les causes ci-dessous sont donc établies à partir du code source : elles expliquent les symptômes que vous aviez constatés, sans avoir été reproduites dans un navigateur.

## Symptômes constatés et causes trouvées dans le code

| Symptôme | Cause dans le code (`frontend/src/main.ts`, `backend/app/…`) |
|---|---|
| « Les modales ne répondent pas » | Il n’existait **aucune modale**. Cliquer sur une exigence ajoutait une fiche de détail **tout en bas d’une longue liste**, hors de l’écran : le clic semblait sans effet. Il n’y avait ni gestion du focus, ni fermeture par Échap, ni superposition. |
| « Sélectionner un PDF ne déclenche pas le traitement attendu » | 1) Le champ fichier n’était jamais vidé : après une erreur, choisir **le même fichier** ne déclenchait plus `onChange`. 2) Un appel autre que le « pack » codé en dur passait par une heuristique minimale (lignes contenant « doit ») : souvent peu ou pas d’exigences, et rien de visible à l’écran. 3) Aucun indicateur de progression, aucune annulation, et une erreur affichée seulement comme un message général. |
| « Certaines fonctionnalités ne produisent aucun résultat visible » | Le bouton « Continuer plus tard » ne faisait que vider l’état. Les blocages ne faisaient que changer d’onglet. L’explication « LLM » était désactivée par défaut. |
| « Ressemble à un prototype » | La démonstration reposait sur un **pack d’exigences codé en dur**, reconnu au titre du programme. L’écran affichait en dur « 70,4 % → 88,8 % ». Le bouton « Ajouter la lettre » insérait une pièce côté serveur sans aucun import réel, puis se désactivait dès que le score dépassait 88,8. |
| Perte du dossier au rechargement | Ni l’identifiant de session ni l’onglet ne figuraient dans l’URL : un rechargement renvoyait à l’écran vide. |

## Autres défauts relevés

- **Sécurité** : les requêtes d’écriture étaient acceptées sans protection CSRF. Une politique CORS n’empêche pas un site tiers d’envoyer un POST « simple » vers `127.0.0.1:8000`. Aucun contrôle de l’en-tête Host (attaque par DNS rebinding). Les fichiers étaient lus dans le processus du serveur, donc un fichier malveillant pouvait le bloquer.
- **Licence** : PyMuPDF est sous licence AGPL-3.0, incompatible avec une diffusion libre sans publier sous AGPL.
- **Documentation** : le README annonçait des tests navigateur et des rapports de validation qui ne pouvaient pas être rejoués tels quels (dépendance à `tsc` global, dépendances non installables ici).

## Ce qui a été conservé

L’idée et le positionnement, cohérents avec le concept visé : un outil de préparation de dossier qui relie les exigences d’un appel aux pièces, contrôle la cohérence et propose une prochaine action. Ont aussi été conservés React 16 embarqué (licence MIT, pour fonctionner hors ligne) et une partie de la logique de contrôle budgétaire, réécrite.

## Ce qui a été reconstruit

Le backend (lecture isolée des fichiers, analyseur d’appels générique, moteur d’évaluation, contrôles, exports, sécurité), l’interface complète, les données d’exemple, les tests et la documentation. Le détail est dans le [README](../README.md).
