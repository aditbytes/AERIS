import { useState, useEffect } from 'react'
import { Play, Pause } from 'lucide-react'
import { useAeris, type TimeHorizon } from '@/services/dataContext'
import './TimeControls.css'

const OPTIONS: { label: string; value: TimeHorizon }[] = [
  { label: 'Now', value: 0 },
  { label: '+1h', value: 1 },
  { label: '+2h', value: 2 },
  { label: '+3h', value: 3 },
]

export default function TimeControls({ showPlayToggle = true }: { showPlayToggle?: boolean }) {
  const { timeHorizon, setTimeHorizon } = useAeris()
  const [isPlaying, setIsPlaying] = useState(false)

  useEffect(() => {
    if (!isPlaying) return
    const interval = setInterval(() => {
      setTimeHorizon((((timeHorizon + 1) % 4) as TimeHorizon))
    }, 2200)
    return () => clearInterval(interval)
  }, [isPlaying, timeHorizon, setTimeHorizon])

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
