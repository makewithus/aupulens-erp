"use client"
import * as React from 'react'

export type Toast = {
  id: string
  title?: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
  variant?: 'default' | 'destructive'
  duration?: number
}

type ToastContextValue = {
  toasts: Toast[]
  toast: (t: Omit<Toast, 'id'>) => void
  dismiss: (id: string) => void
}

const ToastContext = React.createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [toasts, setToasts] = React.useState<Toast[]>([])
  const timeoutsRef = React.useRef<Record<string, number>>({})

  const dismiss = React.useCallback((id: string) => {
    const timeouts = timeoutsRef.current
    if (timeouts[id]) {
      clearTimeout(timeouts[id])
      delete timeouts[id]
    }
    setToasts((prev) => prev.filter((x) => x.id !== id))
  }, [])

  const toast = React.useCallback((t: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).slice(2)
    const next: Toast = { id, ...t }
    setToasts((prev) => {
      const arr = [...prev, next]
      return arr.length > 5 ? arr.slice(arr.length - 5) : arr
    })

    const duration = typeof t.duration === 'number' ? t.duration : 3500
    const timeoutId = window.setTimeout(() => dismiss(id), duration)
    timeoutsRef.current[id] = timeoutId
  }, [dismiss])

  React.useEffect(() => {
    return () => {
      const timeouts = timeoutsRef.current
      Object.values(timeouts).forEach((tid) => clearTimeout(tid))
      timeoutsRef.current = {}
    }
  }, [])

  return (
    <ToastContext.Provider value={{ toasts, toast, dismiss }}>
      {children}
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const ctx = React.useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}

