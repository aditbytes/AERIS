import { useState, useEffect } from 'react'
import { Play, Pause } from 'lucide-react'
import { useTimeHorizon, type TimeHorizon } from '@/services/dataContext'
import './TimeControls.css'

const OPTIONS: { label: string; value: TimeHorizon; title: string }[] = [
  { label: 'Now', value: 0, title: '0–2h initial plume footprint' },
  { label: '+2h', value: 2, title: '2–4h dispersion boundary' },
  { label: '+4h', value: 4, title: '4–8h forward transit footprint' },
  { label: '+8h', value: 8, title: '8–24h downstream corridor' },
  { label: '+24h', value: 24, title: '24h full modeled trajectory' },
]

export default function TimeControls({ showPlayToggle = true }: { showPlayToggle?: boolean }) {
  const { timeHorizon, setTimeHorizon } = useTimeHorizon()
  const [isPlaying, setIsPlaying] = useState(false)

  useEffect(() => {
    if (!isPlaying) return
    const interval = setInterval(() => {
      if (document.hidden) return
      setTimeHorizon((prev) => {
        const curIdx = OPTIONS.findIndex(o => o.value === prev)
        const nextIdx = (curIdx + 1) % OPTIONS.length
        return OPTIONS[nextIdx].value
      })
    }, 2200)
    return () => clearInterval(interval)
  }, [isPlaying, setTimeHorizon])

  return (
    <div className="time-controls" role="group" aria-label="Plume time horizon">
      {showPlayToggle && (
        <button
          className={`time-play-toggle ${isPlaying ? 'playing' : ''}`}
          onClick={() => setIsPlaying(!isPlaying)}
          title={isPlaying ? 'Pause plume trajectory animation' : 'Auto-play forward plume dispersion'}
          aria-label={isPlaying ? 'Pause auto-play' : 'Start auto-play'}
          type="button"
        >
          {isPlaying ? <Pause size={11} /> : <Play size={11} />}
          <span>{isPlaying ? 'Pause' : 'Play'}</span>
        </button>
      )}
      <div className="time-pills-wrap">
        {OPTIONS.map(({ label, value }) => (
          <button
            key={value}
            className={`time-pill ${timeHorizon === value ? 'active' : ''}`}
            onClick={() => {
              setIsPlaying(false)
              setTimeHorizon(value)
            }}
            aria-pressed={timeHorizon === value}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}
