import { vi } from 'vitest'
import type { Ticket } from '../types/ticket'

export function ticket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    ticket_id: 't_1',
    request_id: 'r_1',
    room_id: '401',
    patient_alias: 'Maya',
    original_text: 'extra pillow please',
    input_mode: 'text',
    detected_language: 'en',
    english_summary: 'Patient requests an extra pillow.',
    category: 'COMFORT_SUPPLIES',
    department: 'housekeeping',
    priority: 'NORMAL',
    severity: 2,
    confidence: 0.95,
    clinical_risk_flag: false,
    safety_reasons: [],
    requested_items: ['pillow'],
    patient_confirmation: 'Housekeeping is on the way.',
    status: 'NEW',
    created_at: new Date().toISOString(),
    acknowledged_at: null,
    resolved_at: null,
    escalated_from: null,
    eta_minutes: null,
    history: [],
    notes: [],
    nudge_count: 0,
    last_nudge_at: null,
    model_id: 'mock',
    prompt_version: 'test',
    latency_ms: 3,
    audit: { rules_pre: [], rules_post: [], llm_decision: null, final_decision: {}, fallback: null },
    ...overrides,
  }
}

type Handler = (url: string, init?: RequestInit) => unknown

/** Route fetch calls by "METHOD path" prefix → JSON body. */
export function mockFetch(routes: Record<string, Handler | unknown>) {
  const calls: { method: string; path: string; body?: unknown }[] = []
  const fn = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const path = url.replace('http://api.test', '')
    const method = init?.method ?? 'GET'
    calls.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined })
    const key = Object.keys(routes).find((k) => `${method} ${path}`.startsWith(k))
    if (!key) return new Response('not found', { status: 404 })
    const r = routes[key]
    const body = typeof r === 'function' ? (r as Handler)(url, init) : r
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
  })
  vi.stubGlobal('fetch', fn)
  return calls
}
