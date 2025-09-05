'use client'

export type ToastKind = 'success' | 'error' | 'info'

type ToastPayload = {
  message: string
  type: ToastKind
  durationMs?: number
}

const TOAST_EVENT = 'app-toast'

export const toast = {
  success(message: string, durationMs?: number) {
    if (typeof window === 'undefined') return
    window.dispatchEvent(new CustomEvent<ToastPayload>(TOAST_EVENT, { detail: { message, type: 'success', durationMs } as any }))
  },
  error(message: string, durationMs?: number) {
    if (typeof window === 'undefined') return
    window.dispatchEvent(new CustomEvent<ToastPayload>(TOAST_EVENT, { detail: { message, type: 'error', durationMs } as any }))
  },
  info(message: string, durationMs?: number) {
    if (typeof window === 'undefined') return
    window.dispatchEvent(new CustomEvent<ToastPayload>(TOAST_EVENT, { detail: { message, type: 'info', durationMs } as any }))
  },
}

export function subscribeToast(handler: (payload: ToastPayload) => void) {
  if (typeof window === 'undefined') return () => {}
  const listener = (e: Event) => {
    const ce = e as CustomEvent<ToastPayload>
    if (ce?.detail) handler(ce.detail)
  }
  window.addEventListener(TOAST_EVENT, listener as EventListener)
  return () => window.removeEventListener(TOAST_EVENT, listener as EventListener)
}