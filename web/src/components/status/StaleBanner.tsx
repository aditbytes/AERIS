import { useAeris } from '@/services/dataContext'
import './StaleBanner.css'

function formatAge(seconds: number | null): string {
  if (seconds == null) return 'an unknown time'
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)} h`
  return `${(seconds / 86400).toFixed(1)} days`
}

/**
 * Shown when the API serves the last real result because a refresh failed or a
 * live source is down. The data on screen is real but old; it is never replaced.
 */
export default function StaleBanner() {
  const { staleFeeds } = useAeris()
  if (staleFeeds.length === 0) return null

  const oldest = staleFeeds.reduce((a, b) => ((b.ageSeconds ?? 0) > (a.ageSeconds ?? 0) ? b : a))
  return (
    <div className="stale-banner" role="status">
      <strong>Stale data.</strong>{' '}
      Showing the last real result for {staleFeeds.map(f => f.label.replace('_', ' ')).join(', ')}
      {' '}— not refreshed for {formatAge(oldest.ageSeconds)}
      {oldest.generatedAt ? ` (generated ${new Date(oldest.generatedAt).toLocaleString()})` : ''}.
      A live source may be down.
    </div>
  )
}
