import type { ReactElement } from 'react'

interface ToggleProps {
  label: string
  hint?: string
  checked: boolean
  onChange: (checked: boolean) => void
}

export function Toggle({ label, hint, checked, onChange }: ToggleProps): ReactElement {
  return (
    <div className="toggle">
      <div>
        <div className="label-text">{label}</div>
        {hint ? <div className="hint">{hint}</div> : null}
      </div>
      <button
        type="button"
        className={`switch ${checked ? 'on' : ''}`}
        aria-pressed={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
      />
    </div>
  )
}
