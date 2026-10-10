import { getConfig } from './config'
import type {
  CreateRequestBody,
  CreateRequestResponse,
  Department,
  PatientAction,
  PatientTicketView,
  Role,
  Room,
  Status,
  Ticket,
  TicketAction,
} from '../types/ticket'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, init: RequestInit = {}, token?: string): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  const res = await fetch(`${getConfig().apiUrl}${path}`, { ...init, headers })
  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = await res.json()
      detail = typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail)
    } catch {
      // keep statusText
    }
    throw new ApiError(res.status, detail)
  }
  return (await res.json()) as T
}

export interface DepartmentTimes {
  department: Department
  requests: number
  median_ack_seconds: number | null
  median_resolve_seconds: number | null
}

export interface Analytics {
  since: string
  days: number
  total: number
  by_category: Record<string, number>
  by_department: Record<string, number>
  by_severity: Record<string, number>
  /** 24 buckets in the viewer's local time (sent as tz_offset_minutes). */
  by_hour: number[]
  times: DepartmentTimes[]
  escalations: { total: number; by_staff: number; by_patient_note: number; from_department: Record<string, number> }
  cancelled: number
  nudged_requests: number
  nudges: number
  notes: number
  fallbacks: number
  npo_reroutes: number
  fall_risk_priority: number
  top_rooms: { room_id: string; requests: number; nudges: number }[]
}

export interface LoginResponse {
  token: string
  role: Role
  department: Department | null
}

export interface Metrics {
  since: string
  total: number
  by_category: Record<string, number>
  by_department: Record<string, number>
  diverted_from_nursing: number
  diverted_pct: number
  avg_ack_seconds: Record<string, number | null>
  avg_resolve_seconds: Record<string, number | null>
  urgent_count: number
  urgent_avg_ack_seconds: number | null
  fallback_count: number
  open_by_department: Record<string, number>
}

export const api = {
  health: () => request<{ status: string; classifier_mode: string }>('/health'),
  room: (roomId: string) => request<Room>(`/api/rooms/${encodeURIComponent(roomId)}`),
  createRequest: (body: CreateRequestBody) =>
    request<CreateRequestResponse>('/api/requests', { method: 'POST', body: JSON.stringify(body) }),
  roomTickets: (roomId: string) =>
    request<PatientTicketView[]>(`/api/rooms/${encodeURIComponent(roomId)}/tickets`),
  login: (department: Department, pin: string) =>
    request<LoginResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ department, pin }),
    }),
  loginAdmin: (pin: string) =>
    request<LoginResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ role: 'admin', pin }),
    }),
  queue: (department: Department, token: string, status?: Status) =>
    request<Ticket[]>(`/api/queues/${department}${status ? `?status=${status}` : ''}`, {}, token),
  updateTicket: (ticketId: string, action: TicketAction, token: string) =>
    request<Ticket>(
      `/api/tickets/${ticketId}`,
      { method: 'PATCH', body: JSON.stringify({ action }) },
      token,
    ),
  patientAction: (roomId: string, ticketId: string, action: PatientAction, note?: string) =>
    request<PatientTicketView>(`/api/rooms/${encodeURIComponent(roomId)}/tickets/${ticketId}`, {
      method: 'PATCH',
      body: JSON.stringify(note === undefined ? { action } : { action, note }),
    }),
  metrics: (token: string) => request<Metrics>('/api/metrics', {}, token),
  analytics: (token: string, days: number) =>
    request<Analytics>(`/api/analytics?days=${days}&tz_offset_minutes=${new Date().getTimezoneOffset()}`, {}, token),
  /** CSV of every request in the window (no patient words). Nurse/admin only. */
  exportCsv: async (token: string, days: number): Promise<Blob> => {
    const res = await fetch(`${getConfig().apiUrl}/api/analytics/export.csv?days=${days}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) throw new ApiError(res.status, res.statusText)
    return res.blob()
  },
}
