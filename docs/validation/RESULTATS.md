# Résultats de validation

Exécution : 2026-10-15 02:46:23 (heure locale de la machine)

## Environnement

- Python 3.13.16 — Linux 6.18.44-fc-v114
- starlette 1.6.0
- uvicorn 0.53.0
- pydantic 2.13.5
- pypdf 5.9.0
- docx 1.2.0
- openpyxl 3.1.5
- reportlab 5.0.1
- PIL 12.3.0
- playwright 1.56.0

## Compilation Python

OK

## Vérification TypeScript (mode strict)

OK (1.5 s)

## Tests automatisés

| Suite | Contenu | Résultat | Durée |
|---|---|---|---|
| test_analysis | Analyse : dates, montants, lecture de l'appel, classement des pièces, budgets | ✅ Ran 25 tests in 1.994s / OK | 2.1 s |
| test_engine | Moteur : lecture sécurisée des fichiers, règles de contrôle, parcours complet | ✅ Ran 38 tests in 7.413s / OK | 7.6 s |
| test_api | API HTTP réelle : flux complet, erreurs, sécurité (CSRF, Host, taille, chemins, débit) | ✅ Ran 20 tests in 12.945s / OK | 13.1 s |
| test_e2e_browser | Navigateur Chromium : parcours utilisateur, erreurs, annulation, clavier, mobile | ✅ Ran 6 tests in 36.540s / OK | 36.7 s |
| test_e2e_browser@public | Même parcours navigateur en configuration d’hébergement gratuit (mode public, lecture interne) | ✅ Ran 6 tests in 31.500s / OK | 31.7 s |

**Bilan : tous les contrôles exécutés ont réussi.**

## Détail des tests

### test_analysis

```
test_article_style_headings_in_docx (test_analysis.CallParsing.test_article_style_headings_in_docx) ... ok
test_call_facts (test_analysis.CallParsing.test_call_facts) ... ok
test_conditions_and_rules (test_analysis.CallParsing.test_conditions_and_rules) ... ok
test_constraints_are_attached_to_the_right_document (test_analysis.CallParsing.test_constraints_are_attached_to_the_right_document) ... ok
test_document_list_is_extracted_with_provenance (test_analysis.CallParsing.test_document_list_is_extracted_with_provenance) ... ok
test_english_call (test_analysis.CallParsing.test_english_call) ... ok
test_ids_are_stable (test_analysis.CallParsing.test_ids_are_stable) ... ok
test_optional_and_critical_flags (test_analysis.CallParsing.test_optional_and_critical_flags) ... ok
test_selection_criteria_and_organiser_duties_are_not_requirements (test_analysis.CallParsing.test_selection_criteria_and_organiser_duties_are_not_requirements) ... ok
test_text_without_obligations_gives_no_requirement (test_analysis.CallParsing.test_text_without_obligations_gives_no_requirement) ... ok
test_filename_and_content (test_analysis.Classification.test_filename_and_content) ... ok
test_requirement_detection_prefers_first_mention (test_analysis.Classification.test_requirement_detection_prefers_first_mention) ... ok
test_unknown_document (test_analysis.Classification.test_unknown_document) ... ok
test_budget_from_text_lines (test_analysis.Evidence.test_budget_from_text_lines) ... ok
test_budget_table (test_analysis.Evidence.test_budget_table) ... ok
test_dates_roles (test_analysis.Evidence.test_dates_roles) ... ok
test_no_budget_structure (test_analysis.Evidence.test_no_budget_structure) ... ok
test_requested_amount (test_analysis.Evidence.test_requested_amount) ... ok
test_signature_cue (test_analysis.Evidence.test_signature_cue) ... ok
test_amounts_in_several_formats (test_analysis.TextUtilities.test_amounts_in_several_formats) ... ok
test_english_dates (test_analysis.TextUtilities.test_english_dates) ... ok
test_french_and_iso_dates (test_analysis.TextUtilities.test_french_and_iso_dates) ... ok
test_invalid_dates_are_ignored (test_analysis.TextUtilities.test_invalid_dates_are_ignored) ... ok
test_norm_and_months (test_analysis.TextUtilities.test_norm_and_months) ... ok
test_parse_number (test_analysis.TextUtilities.test_parse_number) ... ok
```

### test_engine

```
test_amount_mismatch_between_documents (test_engine.Assessment.test_amount_mismatch_between_documents) ... ok
test_budget_checks (test_engine.Assessment.test_budget_checks) ... ok
test_conditions_need_declaration (test_engine.Assessment.test_conditions_need_declaration) ... ok
test_critical_weighs_double (test_engine.Assessment.test_critical_weighs_double) ... ok
test_deadline_checks_and_actions (test_engine.Assessment.test_deadline_checks_and_actions) ... ok
test_duration (test_engine.Assessment.test_duration) ... ok
test_expired_identity (test_engine.Assessment.test_expired_identity) ... ok
test_freshness_against_deadline (test_engine.Assessment.test_freshness_against_deadline) ... ok
test_medium_confidence_is_to_verify_and_user_confirmation_covers (test_engine.Assessment.test_medium_confidence_is_to_verify_and_user_confirmation_covers) ... ok
test_min_count_needs_distinct_files (test_engine.Assessment.test_min_count_needs_distinct_files) ... ok
test_missing_then_covered (test_engine.Assessment.test_missing_then_covered) ... ok
test_optional_and_ignored_do_not_count (test_engine.Assessment.test_optional_and_ignored_do_not_count) ... ok
test_page_limit (test_engine.Assessment.test_page_limit) ... ok
test_rejected_link_is_not_used (test_engine.Assessment.test_rejected_link_is_not_used) ... ok
test_corrupt_pdf (test_engine.Ingestion.test_corrupt_pdf) ... ok
test_display_name_is_sanitised (test_engine.Ingestion.test_display_name_is_sanitised) ... ok
test_encrypted_pdf (test_engine.Ingestion.test_encrypted_pdf) ... ok
test_formats_accepted (test_engine.Ingestion.test_formats_accepted) ... ok
test_rejections (test_engine.Ingestion.test_rejections) ... ok
test_size_limit (test_engine.Ingestion.test_size_limit) ... ok
test_timeout_kills_the_reader (test_engine.Ingestion.test_timeout_kills_the_reader) ... ok
test_too_many_pages (test_engine.Ingestion.test_too_many_pages) ... ok
test_zip_bomb_and_traversal (test_engine.Ingestion.test_zip_bomb_and_traversal) ... ok
test_delete_dossier_removes_files (test_engine.Journey.test_delete_dossier_removes_files) ... ok
test_demo_to_ready (test_engine.Journey.test_demo_to_ready) ... ok
test_limits (test_engine.Journey.test_limits) ... ok
test_removing_the_call_removes_its_requirements_and_facts (test_engine.Journey.test_removing_the_call_removes_its_requirements_and_facts) ... ok
test_scanned_call_is_refused_with_guidance (test_engine.Journey.test_scanned_call_is_refused_with_guidance) ... ok
test_user_deadline_wins_over_the_call (test_engine.Journey.test_user_deadline_wins_over_the_call) ... ok
test_user_decisions_and_manual_requirements (test_engine.Journey.test_user_decisions_and_manual_requirements) ... ok
test_fallback_when_child_cannot_start (test_engine.ReaderRobustness.test_fallback_when_child_cannot_start) ... Lecture isolée indisponible, passage en lecture dans le processus principal : processus de lecture impossible à lancer (spawn refusé)
test_fallback_when_child_crashes (test_engine.ReaderRobustness.test_fallback_when_child_crashes) ... processus de lecture en échec (code 1) : Fatal Python error: init_import_site
test_fallback_when_child_lacks_libraries (test_engine.ReaderRobustness.test_fallback_when_child_lacks_libraries) ... Lecture isolée indisponible, passage en lecture dans le processus principal : bibliothèque introuvable dans le processus de lecture : ModuleNotFoundError: pypdf
test_identical_files_are_read_once (test_engine.ReaderRobustness.test_identical_files_are_read_once) ... ok
test_inprocess_reader_option (test_engine.ReaderRobustness.test_inprocess_reader_option) ... ok
test_lone_surrogates_do_not_break_reading (test_engine.ReaderRobustness.test_lone_surrogates_do_not_break_reading) ... ok
test_self_test_passes (test_engine.ReaderRobustness.test_self_test_passes) ... ok
Libraries reachable only through the parent's sys.path (pip install --user) are found by the reader. ... ok
```

### test_api

```
test_cancel_upload_is_authoritative (test_api.Api.test_cancel_upload_is_authoritative) ... ok
test_csrf_guard (test_api.Api.test_csrf_guard) ... ok
test_demo_endpoint (test_api.Api.test_demo_endpoint) ... ok
test_dns_rebinding_guard (test_api.Api.test_dns_rebinding_guard) ... ok
test_filename_cannot_escape_storage (test_api.Api.test_filename_cannot_escape_storage) ... ok
test_full_flow_over_http (test_api.Api.test_full_flow_over_http) ... ok
test_health_and_ui (test_api.Api.test_health_and_ui) ... ok
test_html_in_names_is_returned_as_data (test_api.Api.test_html_in_names_is_returned_as_data) ... ok
test_interrupted_upload_stores_nothing (test_api.Api.test_interrupted_upload_stores_nothing) ... ok
test_no_stack_trace_in_errors (test_api.Api.test_no_stack_trace_in_errors) ... ok
test_security_headers (test_api.Api.test_security_headers) ... ok
test_size_limit_is_enforced_server_side (test_api.Api.test_size_limit_is_enforced_server_side) ... ok
test_unknown_ids_and_traversal (test_api.Api.test_unknown_ids_and_traversal) ... ok
test_upload_errors_are_explained (test_api.Api.test_upload_errors_are_explained) ... ok
test_validation_errors (test_api.Api.test_validation_errors) ... ok
test_allowed_hosts_are_enforced_when_configured (test_api.PublicMode.test_allowed_hosts_are_enforced_when_configured) ... ok
test_dossier_quota (test_api.PublicMode.test_dossier_quota) ... ok
test_iframe_embedding_option (test_api.PublicMode.test_iframe_embedding_option) ... /usr/lib/python3.13/unittest/case.py:606: ResourceWarning: unclosed <socket.socket fd=4, family=2, type=1, proto=6, laddr=('127.0.0.1', 51878), raddr=('127.0.0.1', 43691)>
test_isolation_between_visitors (test_api.PublicMode.test_isolation_between_visitors) ... ok
test_rate_limit (test_api.RateLimit.test_rate_limit) ... ok
```

### test_e2e_browser

```
test_complete_journey (test_e2e_browser.Browser.test_complete_journey) ... ok
test_delete_dossier_from_home (test_e2e_browser.Browser.test_delete_dossier_from_home) ... ok
test_english_by_default_and_language_switch (test_e2e_browser.Browser.test_english_by_default_and_language_switch) ... ok
test_keyboard_only_navigation (test_e2e_browser.Browser.test_keyboard_only_navigation) ... ok
test_mobile_layout_has_no_horizontal_overflow (test_e2e_browser.Browser.test_mobile_layout_has_no_horizontal_overflow) ... ok
test_upload_errors_cancel_and_server_failures (test_e2e_browser.Browser.test_upload_errors_cancel_and_server_failures) ... ok
```

### test_e2e_browser@public

```
test_complete_journey (test_e2e_browser.Browser.test_complete_journey) ... ok
test_delete_dossier_from_home (test_e2e_browser.Browser.test_delete_dossier_from_home) ... ok
test_english_by_default_and_language_switch (test_e2e_browser.Browser.test_english_by_default_and_language_switch) ... ok
test_keyboard_only_navigation (test_e2e_browser.Browser.test_keyboard_only_navigation) ... ok
test_mobile_layout_has_no_horizontal_overflow (test_e2e_browser.Browser.test_mobile_layout_has_no_horizontal_overflow) ... ok
test_upload_errors_cancel_and_server_failures (test_e2e_browser.Browser.test_upload_errors_cancel_and_server_failures) ... ok
```

## Non couvert par cette validation

- Audit des vulnérabilités des dépendances (pip-audit / base OSV) : nécessite un accès réseau à ces services, indisponible ici.
- Navigateurs autres que Chromium (Firefox, Safari) et systèmes autres que Linux : non testés dans cet environnement.
- Appels à projets réels de mise en page complexe (colonnes, tableaux scannés) : l’extraction reste à vérifier par l’utilisateur.
