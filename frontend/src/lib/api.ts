import { getConfig } from './config'
import type {
  CreateRequestBody,
  CreateRequestResponse,
  Department,
  PatientTicketView,
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
    request<{ token: string; department: Department }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ department, pin }),
    }),
  queue: (department: Department, token: string, status?: Status) =>
    request<Ticket[]>(`/api/queues/${department}${status ? `?status=${status}` : ''}`, {}, token),
  updateTicket: (ticketId: string, action: TicketAction, token: string) =>
    request<Ticket>(
      `/api/tickets/${ticketId}`,
      { method: 'PATCH', body: JSON.stringify({ action }) },
      token,
    ),
  metrics: () => request<Metrics>('/api/metrics'),
}
