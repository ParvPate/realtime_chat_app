'use client'

import React, { createContext, useCallback, useContext, useMemo, useRef, useState, useEffect } from 'react'

import { subscribeToast } from '@/components/ui/toast'

type ToastType = 'success' | 'error' | 'info'
type Toast = { id: string; message: string; type: ToastType }

type ToastContextType = {
  show: (message: string, type?: ToastType, durationMs?: number) => void
}

const ToastContext = createContext<ToastContextType | null>(null)

export function useToast(): ToastContextType {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastClientProvider')
  return ctx
}

function ToastItem({ t, onClose }: { t: Toast; onClose: (id: string) => void }) {
  const bg =
    t.type === 'success'
      ? 'bg-green-600'
      : t.type === 'error'
      ? 'bg-red-600'
      : 'bg-zinc-800'
  return (
    <div className={`${bg} text-white shadow-lg rounded-md px-4 py-2 text-sm flex items-start gap-2`}>
      <span className="mt-0.5">{t.message}</span>
      <button
        onClick={() => onClose(t.id)}
        className="ml-3 text-white/80 hover:text-white transition"
        aria-label="Close toast"
        title="Close"
      >
        ×
      </button>
    </div>
  )
}

export default function ToastClientProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const timers = useRef<Map<string, any>>(new Map())

  const remove = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
    const tm = timers.current.get(id)
    if (tm) {
      clearTimeout(tm)
      timers.current.delete(id)
    }
  }, [])

  const show = useCallback(
    (message: string, type: ToastType = 'info', durationMs = 2600) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
      const toast: Toast = { id, message, type }
      setToasts((prev) => [...prev, toast])
      const tm = setTimeout(() => remove(id), durationMs)
      timers.current.set(id, tm)
    },
    [remove]
  )

  const value = useMemo(() => ({ show }), [show])

  // Bridge global toast events (toast.success/info/error) to provider UI
  useEffect(() => {
    const unsubscribe = subscribeToast(({ message, type, durationMs }) => {
      show(message, type as ToastType, durationMs)
    })
    return unsubscribe
  }, [show])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2">
        {toasts.map((t) => (
          <ToastItem key={t.id} t={t} onClose={remove} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}