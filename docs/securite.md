# Sécurité : modèle de menace et contrôles vérifiés

ClairForm est une **application locale mono-utilisateur**. Le serveur écoute sur `127.0.0.1` et sert l’interface et l’API à votre seul navigateur. Il n’y a **pas de comptes** : toute personne qui accède à ce port accède aux dossiers. Ne l’exposez pas sur un réseau partagé.

## Menaces prises en compte et contrôles en place

| Menace | Contrôle | Vérifié par |
|---|---|---|
| Un site web visité par l’utilisateur envoie des requêtes à `127.0.0.1:8000` (CSRF) | Toute écriture exige l’en-tête `X-ClairForm: 1`, ce qui déclenche un pré-contrôle CORS que le serveur n’autorise pas. Une origine différente est refusée. | `test_api.Api.test_csrf_guard` |
| DNS rebinding (un domaine malveillant pointé vers 127.0.0.1) | Liste blanche de l’en-tête `Host` (`127.0.0.1`, `localhost`, `::1`, plus `CLAIRFORM_ALLOWED_HOSTS`). | `test_api.Api.test_dns_rebinding_guard` |
| Fichier piégé (PDF malformé, bombe ZIP dans un .docx/.xlsx, chemins `../`) | Lecture dans un **processus séparé** avec délai maximal (45 s), limite mémoire (2 Go, POSIX) et interdiction d’écrire des fichiers. Archives limitées en nombre d’entrées, en taille décompressée et en taux de compression. XML lu via defusedxml. | `test_engine.Ingestion.*` (bombe, traversée, délai, PDF corrompu ou chiffré) |
| Fichier déguisé (exécutable renommé en .pdf) | Liste d’extensions autorisées et vérification de la signature binaire du contenu. | `test_engine.Ingestion.test_rejections`, `test_api…test_upload_errors_are_explained` |
| Fichier trop volumineux | Limite vérifiée **côté serveur** pendant la réception du flux (20 Mo par défaut, réglable) : erreur 413 avant toute lecture. | `test_api…test_size_limit_is_enforced_server_side`, test navigateur |
| Écriture hors du dossier de stockage | Les fichiers sont enregistrés sous un nom généré par le serveur (`doc_<aléatoire>.bin`). Le nom d’origine sert uniquement à l’affichage, après nettoyage. Les identifiants d’URL sont validés par expression régulière. | `test_api…test_filename_cannot_escape_storage`, `test_unknown_ids_and_traversal` |
| Injection SQL | Toutes les requêtes SQLite sont paramétrées. Les identifiants sont validés avant usage. | `test_api…test_validation_errors` |
| XSS (nom de fichier ou titre contenant du HTML) | React échappe tout le texte. Aucun `dangerouslySetInnerHTML`. CSP stricte : `script-src 'self'`, `style-src 'self'`, aucun script en ligne. | `test_api…test_html_in_names_is_returned_as_data`, absence de violation CSP vérifiée dans les tests navigateur |
| Exposition d’erreurs internes | Les erreurs renvoient un code et un message en français, sans trace d’appel. Le détail reste dans le terminal. | `test_api…test_no_stack_trace_in_errors` |
| Abus de l’API | Limitation de débit par client (600 requêtes/minute par défaut). | `test_api.RateLimit` |
| Fuite par le navigateur | En-têtes `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Cache-Control: no-store` sur l’API, téléchargements en `attachment`. | `test_api…test_security_headers` |
| Import annulé mais conservé | L’annulation est confirmée par le serveur : un import annulé tardivement est supprimé, un import arrivé après l’annulation est rejeté. | `test_api…test_cancel_upload_is_authoritative`, test navigateur |

## Données

- Tout est stocké dans `storage/` : la base SQLite et les fichiers d’origine. Supprimer un dossier efface ses fichiers (vérifié par `test_engine.Journey.test_delete_dossier_removes_files`).
- **Aucun appel réseau sortant.** Le code ne contient ni client HTTP sortant, ni télémétrie, ni CDN : polices et React sont embarqués.
- Les données ne sont **pas chiffrées au repos**. Protégez la session de votre ordinateur (chiffrement du disque recommandé).

## Non vérifié ici

- Audit des vulnérabilités connues des dépendances (pip-audit, base OSV) : impossible sans accès réseau à ces services. À lancer avant publication : `pip install pip-audit && pip-audit -r requirements.txt`.
- Déploiement multi-utilisateur : hors périmètre. Il nécessiterait une authentification, une séparation des dossiers par utilisateur et TLS.
