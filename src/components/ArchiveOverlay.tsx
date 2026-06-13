'use client'

import type { CSSProperties } from 'react'
import { useExperienceStore }  from '../stores/useExperienceStore'
import { useAtmosphereStore }  from '../stores/useAtmosphereStore'
import { useArenaData }        from '../hooks/useArenaData'
import type { Observation }    from '../hooks/useArenaData'

// ─── Styles — light card on frosted-dark backdrop (mirrors ContributionPortal) ─

const backdrop: CSSProperties = {
  position:             'fixed',
  inset:                0,
  display:              'flex',
  alignItems:           'center',
  justifyContent:       'center',
  background:           'rgba(8,8,8,0.58)',
  backdropFilter:       'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  zIndex:               600,
  fontFamily:           "'Martian Mono', monospace",
}

const panel: CSSProperties = {
  width:        'min(418px, 94vw)',
  maxHeight:    '78vh',
  overflowY:    'auto',
  background:   '#fcfbf9',
  border:       '1px solid rgba(0,0,0,0.07)',
  borderRadius: 2,
  padding:      '24px 22px 20px',
  boxShadow:    '0 8px 48px rgba(0,0,0,0.28)',
}

const dateLine: CSSProperties = {
  fontSize:      8,
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
  color:         'rgba(0,0,0,0.30)',
  marginBottom:  18,
}

const bodyText: CSSProperties = {
  fontFamily:  "'EB Garamond', Georgia, serif",
  fontStyle:   'italic',
  fontSize:    15,
  lineHeight:  1.82,
  color:       '#1a1614',
  margin:      0,
  whiteSpace:  'pre-wrap',
}

const closeRow: CSSProperties = {
  display:        'flex',
  justifyContent: 'flex-end',
  marginTop:      20,
}

const closeBtnStyle: CSSProperties = {
  fontSize:      8,
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
  background:    '#1a1614',
  border:        'none',
  color:         '#fcfbf9',
  cursor:        'pointer',
  fontFamily:    'inherit',
  padding:       '8px 16px',
  borderRadius:  1,
  transition:    'background 0.15s',
}

// ─── Observation detail panel ─────────────────────────────────────────────────

function ObservationDetail({
  obs,
  accentColor,
  onClose,
}: {
  obs:         Observation
  accentColor: string
  onClose:     () => void
}) {
  const dateStr = obs.timestamp.toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  })

  const panelWithAccent: CSSProperties = {
    ...panel,
    outline: `1px solid ${accentColor}22`,
  }

  return (
    <div style={backdrop} onClick={onClose}>
      <div style={panelWithAccent} onClick={(e) => e.stopPropagation()}>

        {/* Date */}
        <div style={dateLine}>{dateStr}</div>

        {/* Body: Text */}
        {obs.blockClass === 'Text' && obs.text && (
          <p style={bodyText}>{obs.text}</p>
        )}

        {/* Body: Image */}
        {obs.blockClass === 'Image' && obs.imageUrl && (
          <img
            src={obs.imageUrl}
            alt=""
            style={{ width: '100%', display: 'block', borderRadius: 1 }}
          />
        )}

        {/* Body: Link */}
        {obs.blockClass === 'Link' && obs.linkUrl && (
          <a
            href={obs.linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize:       10,
              letterSpacing:  '0.06em',
              color:          accentColor,
              textDecoration: 'none',
              wordBreak:      'break-all',
            }}
          >
            {obs.linkUrl}
          </a>
        )}

        {/* Body: Media */}
        {obs.blockClass === 'Media' && obs.linkUrl && (
          /\.(mp4|webm|ogg)$/i.test(obs.linkUrl) ? (
            <video
              src={obs.linkUrl}
              controls
              style={{ width: '100%', borderRadius: 1 }}
            />
          ) : (
            <audio
              src={obs.linkUrl}
              controls
              style={{ width: '100%', marginTop: 10 }}
            />
          )
        )}

        {/* Bottom-right close action */}
        <div style={closeRow}>
          <button
            style={closeBtnStyle}
            onClick={onClose}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#2e2a28' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#1a1614' }}
          >
            close
          </button>
        </div>

      </div>
    </div>
  )
}

// ─── Public component ─────────────────────────────────────────────────────────

export function ArchiveOverlay() {
  const activeObservationId  = useExperienceStore((s) => s.activeObservationId)
  const setActiveObservation = useExperienceStore((s) => s.setActiveObservation)
  const accentColor          = useAtmosphereStore((s) => s.config.lightColor)
  const { data }             = useArenaData()

  if (!activeObservationId) return null

  let obs: Observation | null = null
  for (const roomObs of Object.values(data)) {
    const found = roomObs.find((o) => o.id === activeObservationId)
    if (found) { obs = found; break }
  }

  if (!obs) return null

  return (
    <ObservationDetail
      obs={obs}
      accentColor={accentColor}
      onClose={() => setActiveObservation(null)}
    />
  )
}
