export type Status = 'covered' | 'to_verify' | 'partial' | 'missing' | 'problem' | 'to_confirm' | 'ignored';
export type Kind = 'document' | 'condition' | 'rule';

export interface CallFact {
  key: 'deadline' | 'max_amount' | 'min_cofinancing_pct' | 'max_duration_months';
  value: any;
  currency: string | null;
  page: number;
  excerpt: string;
  document_id: string;
}

export interface Dossier {
  id: string;
  title: string;
  program: string;
  deadline: string | null;
  deadline_source: 'user' | 'call' | null;
  call_facts: CallFact[];
  is_demo: boolean;
  created_at: string;
  updated_at: string;
}

export interface DossierSummary extends Dossier {
  score: number;
  readiness: Readiness;
  counts: Record<string, number>;
  document_count: number;
}

export interface Readiness {
  code: 'empty' | 'ready' | 'blocked' | 'in_progress';
  label: string;
}

export interface DocumentInfo {
  id: string;
  role: 'call' | 'piece';
  name: string;
  ext: string;
  size: number;
  sha256: string;
  page_count: number | null;
  has_text: boolean;
  proof_type: string | null;
  proof_type_label: string | null;
  proof_type_source: 'auto' | 'user' | null;
  proof_confidence: 'high' | 'medium' | 'low' | null;
  proof_reasons: string[];
  facts: any;
  created_at: string;
  requirement_count: number | null;
}

export interface Requirement {
  id: string;
  origin: 'extracted' | 'manual';
  source_doc_id: string | null;
  label: string;
  statement: string;
  kind: Kind;
  proof_type: string | null;
  proof_type_label: string | null;
  required: boolean;
  critical: boolean;
  status: 'active' | 'ignored';
  declared: boolean;
  reviewed: boolean;
  source_page: number | null;
  excerpt: string;
  section: string;
  reason: string;
  constraints: Record<string, any>;
  min_count: number;
  note: string;
}

export interface Link {
  document_id: string;
  origin: 'user' | 'auto';
  confidence: 'high' | 'medium' | 'low';
  reason: string;
}

export interface RequirementResult {
  id: string;
  status: Status;
  explanation: string;
  links: Link[];
  checks: string[];
  rejected?: string[];
  coverage?: number;
}

export interface Check {
  id: string;
  code: string;
  severity: 'error' | 'warning' | 'info';
  title: string;
  detail: string;
  requirement_id: string | null;
  document_id: string | null;
  source: { document_id: string; page: number; excerpt: string } | null;
}

export interface Action {
  id: string;
  verb: string;
  verb_label?: string;
  title: string;
  detail?: string;
  requirement_id?: string | null;
  document_id?: string | null;
  check_id?: string;
  priority: number;
}

export interface Assessment {
  score: number;
  readiness: Readiness;
  counts: Record<Exclude<Status, 'ignored'>, number>;
  required_total: number;
  requirements: Record<string, RequirementResult>;
  checks: Check[];
  actions: Action[];
  deadline: { date: string | null; days_left: number | null; source: 'user' | 'call' | null };
  reference_day: string;
  today: string;
}

export interface ProofType {
  code: string;
  label: string;
  external: boolean;
}

export interface DossierState {
  dossier: Dossier;
  documents: DocumentInfo[];
  requirements: Requirement[];
  assessment: Assessment;
  proof_types: ProofType[];
}
