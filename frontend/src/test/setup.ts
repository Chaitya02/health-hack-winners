import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'
import { setConfigForTests } from '../lib/config'

export class FakeWebSocket {
  static instances: FakeWebSocket[] = []
  static OPEN = 1
  readyState = 0
  sent: string[] = []
  onopen: (() => void) | null = null
  onmessage: ((m: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  url: string
  constructor(url: string) {
    this.url = url
    FakeWebSocket.instances.push(this)
  }
  send(data: string) {
    this.sent.push(data)
  }
  close() {
    this.readyState = 3
    this.onclose?.()
  }
  // test helpers
  open() {
    this.readyState = 1
    this.onopen?.()
  }
  emit(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) })
  }
}

vi.stubGlobal('WebSocket', FakeWebSocket)
setConfigForTests({ apiUrl: 'http://api.test', wsUrl: 'ws://api.test/ws' })

afterEach(() => {
  cleanup()
  FakeWebSocket.instances = []
  vi.restoreAllMocks()
  try {
    sessionStorage.clear()
  } catch {
    // ignore
  }
})
