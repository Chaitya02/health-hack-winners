// Mirrors backend/app/models (Pydantic). Keep in sync with app/models/ticket.py.

export const CATEGORIES = [
  'URGENT_CLINICAL',
  'NON_URGENT_CLINICAL',
  'ENVIRONMENT_CLEANING',
  'COMFORT_SUPPLIES',
  'DIETARY',
  'TECH_AMENITIES',
  'UNCLEAR',
  'EMOTIONAL_SUPPORT', // last on purpose: matches backend enum (merge-severity) order
] as const
export type Category = (typeof CATEGORIES)[number]

export const DEPARTMENTS = ['nursing', 'housekeeping', 'food', 'it'] as const
export type Department = (typeof DEPARTMENTS)[number]

export type Priority = 'HIGH' | 'NORMAL' | 'LOW'
export type Status = 'NEW' | 'ACKNOWLEDGED' | 'IN_PROGRESS' | 'RESOLVED' | 'ESCALATED' | 'CANCELLED'

/** Statuses where the request is finished (done or cancelled by the patient). */
export const CLOSED_STATUSES: readonly Status[] = ['RESOLVED', 'CANCELLED']
export type InputMode = 'text' | 'voice' | 'quick_tap'

export const ROLES = ['patient', 'nurse', 'housekeeping', 'food', 'it', 'admin', 'system'] as const
export type Role = (typeof ROLES)[number]

export type AttendantPreference = 'any' | 'female' | 'male'

/** 5 = most severe, 1 = least. Orders requests inside one department's queue. */
export type Severity = 1 | 2 | 3 | 4 | 5

export interface StatusChange {
  status: Status
  at: string
  by_role: Role
}

export interface TicketNote {
  text: string
  at: string
  by_role: Role
}

export const MAX_NOTE_LEN = 200

export const LANGUAGES = ['en', 'es', 'hi', 'gu', 'zh', 'ht', 'pt'] as const
export type Language = (typeof LANGUAGES)[number]

export interface TicketAudit {
  rules_pre: string[]
  rules_post: string[]
  llm_decision: Record<string, unknown> | null
  final_decision: Record<string, unknown>
  fallback: string | null
}

export interface Ticket {
  ticket_id: string
  request_id: string
  room_id: string
  patient_alias: string
  original_text: string
  input_mode: InputMode
  detected_language: Language
  english_summary: string
  category: Category
  department: Department
  priority: Priority
  severity: Severity
  confidence: number
  clinical_risk_flag: boolean
  safety_reasons: string[]
  requested_items: string[]
  patient_confirmation: string
  status: Status
  created_at: string
  acknowledged_at: string | null
  resolved_at: string | null
  escalated_from: Department | null
  eta_minutes: number | null
  history: StatusChange[]
  notes: TicketNote[]
  nudge_count: number
  last_nudge_at: string | null
  model_id: string
  prompt_version: string
  latency_ms: number
  audit: TicketAudit
}

export interface PatientTicketView {
  ticket_id: string
  department: Department
  category: Category
  priority: Priority
  status: Status
  english_summary: string
  patient_confirmation: string
  created_at: string
  eta_minutes: number | null
  history: StatusChange[]
}

export interface Accessibility {
  low_vision: boolean
  speech_difficulty: boolean
  cannot_write: boolean
}

export interface PatientProfile {
  npo: boolean
  npo_reason: string | null
  fall_risk: boolean
  diet: string | null
  accessibility: Accessibility
  attendant_preference: AttendantPreference
}

export interface Room {
  room_id: string
  unit: string
  patient_alias: string
  preferred_language: Language
  primary_nurse: string
  profile: PatientProfile
}

export interface CreateRequestBody {
  room_id: string
  text: string
  input_mode: InputMode
  language_hint?: Language
}

export interface CreateRequestResponse {
  request_id: string
  tickets: Ticket[]
  confirmation: string
  confirmation_language: Language
  is_clinical: boolean
}

export type TicketEventType = 'ticket.created' | 'ticket.updated' | 'ticket.escalated'

export interface TicketEvent {
  type: TicketEventType
  ticket: Ticket
  ts: string
}

export type TicketAction = 'acknowledge' | 'start' | 'resolve' | 'escalate_to_nurse'

/** What a patient can do to a request while waiting. Cancel is refused (409) for clinical ones. */
export type PatientAction = 'cancel' | 'still_waiting' | 'add_note'

export const DEPARTMENT_LABELS: Record<Department, string> = {
  nursing: 'Primary Nurse',
  housekeeping: 'Housekeeping & Facilities',
  food: 'Food Services',
  it: 'Unit Clerk / IT',
}
