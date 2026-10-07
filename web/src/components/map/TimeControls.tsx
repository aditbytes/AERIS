import { useAeris, type TimeHorizon } from '@/services/dataContext'
import './TimeControls.css'

const OPTIONS: { label: string; value: TimeHorizon }[] = [
  { label: 'Now', value: 0 },
  { label: '+1h', value: 1 },
  { label: '+2h', value: 2 },
  { label: '+3h', value: 3 },
]

export default function TimeControls() {
  const { timeHorizon, setTimeHorizon } = useAeris()

  return (
    <div className="time-controls" role="group" aria-label="Plume time horizon">
      {OPTIONS.map(({ label, value }) => (
        <button
          key={value}
          className={`time-pill ${timeHorizon === value ? 'active' : ''}`}
          onClick={() => setTimeHorizon(value)}
          aria-pressed={timeHorizon === value}
        >
          {label}
        </button>
      ))}
    </div>
  )
}
