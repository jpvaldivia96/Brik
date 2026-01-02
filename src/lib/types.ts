// BRIK Types

export type RoleEnum = 'guard' | 'supervisor';
export type PersonType = 'worker' | 'visitor';

export interface Site {
  id: string;
  name: string;
  timezone: string;
  created_at: string;
}

export interface SiteSettings {
  site_id: string;
  warn_hours: number;
  crit_hours: number;
  seguro_warn_days: number;
  updated_at: string;
}

export interface SiteMembership {
  site_id: string;
  user_id: string;
  role: RoleEnum;
  created_at: string;
  sites?: Site;
}

export interface Person {
  id: string;
  site_id: string;
  ci: string;
  full_name: string;
  type: PersonType;
  contractor: string | null;
  photo_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkerProfile {
  person_id: string;
  insurance_number: string | null;
  insurance_expiry: string | null;
  phone: string | null;
  emergency_contact: string | null;
  blood_type: string | null;
}

export interface VisitorProfile {
  person_id: string;
  company: string | null;
}

export interface Favorite {
  id: string;
  site_id: string;
  person_id: string;
  updated_at: string;
  people?: Person;
}

export interface AccessLog {
  id: string;
  site_id: string;
  person_id: string;
  entry_at: string;
  exit_at: string | null;
  observations: string | null;
  entry_by_user_id: string | null;
  exit_by_user_id: string | null;
  ci_snapshot: string | null;
  name_snapshot: string | null;
  type_snapshot: PersonType | null;
  contractor_snapshot: string | null;
  voided_at: string | null;
  voided_by_user_id: string | null;
  void_reason: string | null;
  created_at: string;
  people?: Person;
}

export interface AuditEvent {
  id: string;
  site_id: string;
  user_id: string | null;
  role_snapshot: RoleEnum | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  before: Record<string, any> | null;
  after: Record<string, any> | null;
  note: string | null;
  created_at: string;
}

// Dashboard types
export interface DashboardStats {
  insideNow: number;
  entriestoday: number;
  exitsToday: number;
  warnCount: number;
  critCount: number;
}

export interface InsideEntry {
  id: string;
  person_id: string;
  full_name: string;
  ci: string;
  contractor: string | null;
  type: PersonType;
  entry_at: string;
  hours: number;
  status: 'ok' | 'warn' | 'crit';
}

export interface ContractorStats {
  contractor: string;
  inside: number;
  entriesToday: number;
}

export interface InsuranceAlert {
  person_id: string;
  full_name: string;
  ci: string;
  contractor: string | null;
  insurance_expiry: string;
  days_until: number;
  status: 'expired' | 'expiring';
}

export interface FavoriteStatus {
  id: string;
  person_id: string;
  full_name: string;
  ci: string;
  contractor: string | null;
  type: PersonType;
  is_inside: boolean;
  entry_at: string | null;
  hours: number | null;
  status: 'ok' | 'warn' | 'crit' | null;
}

// Search result
export interface PersonSearchResult extends Person {
  workers_profile?: WorkerProfile | null;
  visitors_profile?: VisitorProfile | null;
  is_inside?: boolean;
  current_log_id?: string | null;
}
