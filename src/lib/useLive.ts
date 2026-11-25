import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from './supabase'

type Result<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>

/**
 * Loads rows with `fetcher` and reloads them whenever any of `tables` changes
 * (Supabase Realtime). `key` must change when the query changes.
 */
export function useLive<T>(key: string, fetcher: () => Result<T>, tables: string[]) {
  const [data, setData] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const fetchRef = useRef(fetcher)
  fetchRef.current = fetcher

  const reload = useCallback(async () => {
    const { data, error } = await fetchRef.current()
    if (error) setError(error.message)
    else {
      setError(null)
      setData(data || [])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    setLoading(true)
    reload()
    const channel = supabase.channel(`live:${key}:${Math.random().toString(36).slice(2)}`)
    for (const table of tables) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => {
        clearTimeout(timer)
        timer = setTimeout(reload, 250)
      })
    }
    channel.subscribe()
    return () => {
      clearTimeout(timer)
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, reload])

  return { data, loading, error, reload, setData }
}

/** Re-render every `ms` so time-based labels stay fresh. */
export function useTick(ms = 30000) {
  const [, set] = useState(0)
  useEffect(() => {
    const t = setInterval(() => set(n => n + 1), ms)
    return () => clearInterval(t)
  }, [ms])
}
