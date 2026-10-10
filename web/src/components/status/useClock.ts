import { useEffect, useState } from 'react'

/** Freshness ages advance without requiring another successful data request. */
export function useClock(): number {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])
  return now
}
