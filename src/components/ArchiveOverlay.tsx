'use client'

import type { CSSProperties } from 'react'
import { useExperienceStore }  from '../stores/useExperienceStore'
import { useAtmosphereStore }  from '../stores/useAtmosphereStore'
import { useArenaData }        from '../hooks/useArenaData'
import type { Observation }    from '../hooks/useArenaData'

// ─── Styles ───────────────────────────────────────────────────────────────────

const backdrop: CSSProperties = {
  position:            'fixed',
  inset:               0,
  display:             'flex',
  alignItems:          'center',
  justifyContent:      'center',
  background:          'rgba(5,5,5,0.91)',
  backdropFilter:      'blur(18px)',
  WebkitBackdropFilter: 'blur(18px)',
  zIndex:              600,
  fontFamily:          "'Martian Mono', monospace",
}

const panel: CSSProperties = {
  position:   'relative',
  width:      'min(500px, 92vw)',
  maxHeight:  '78vh',
  overflowY:  'auto',
  background: 'rgba(11,11,11,0.97)',
  border:     '1px solid rgba(255,255,255,0.06)',
  borderRadius: 2,
  padding:    '26px 26px 24px',
}

const closeBtnBase: CSSProperties = {
  position:   'absolute',
  top:        10,
  right:      14,
  fontSize:   22,
  lineHeight: 1,
  background: 'none',
  border:     'none',
  color:      'rgba(255,255,255,0.28)',
  cursor:     'pointer',
  fontFamily: 'inherit',
  padding:    '2px 6px',
  transition: 'color 0.15s',
}

const dateLine: CSSProperties = {
  fontSize:        8,
  textTransform:   'uppercase',
  letterSpacing:   '0.12em',
  color:           'rgba(255,255,255,0.2)',
  marginBottom:    16,
}

const titleLine: CSSProperties = {
  fontSize:        10,
  textTransform:   'uppercase',
  letterSpacing:   '0.1em',
  color:           'rgba(255,255,255,0.38)',
  marginBottom:    14,
}

const bodyText: CSSProperties = {
  fontFamily:  "'EB Garamond', Georgia, serif",
  fontStyle:   'italic',
  fontSize:    15,
  lineHeight:  1.82,
  color:       'rgba(255,255,255,0.82)',
  margin:      0,
  whiteSpace:  'pre-wrap',
}

const tagRow: CSSProperties = {
  marginTop:       18,
  display:         'flex',
  gap:             8,
  fontSize:        8,
  textTransform:   'uppercase',
  letterSpacing:   '0.1em',
  color:           'rgba(255,255,255,0.17)',
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

  const panelWithOutline: CSSProperties = {
    ...panel,
    outline: `1px solid ${accentColor}1a`,
  }

  return (
    <div style={backdrop} onClick={onClose}>
      {/* Stop clicks on the panel itself from closing the overlay */}
      <div style={panelWithOutline} onClick={(e) => e.stopPropagation()}>

        {/* Close button */}
        <button
          style={closeBtnBase}
          onClick={onClose}
          onMouseEnter={(e) => { e.currentTarget.style.color = '#fff' }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.28)' }}
          aria-label="Close"
        >
          ×
        </button>

        {/* Date */}
        <div style={dateLine}>{dateStr}</div>

        {/* Title */}
        {obs.title && <div style={titleLine}>{obs.title}</div>}

        {/* Body: Text */}
        {obs.blockClass === 'Text' && obs.text && (
          <p style={bodyText}>{obs.text}</p>
        )}

        {/* Body: Image */}
        {obs.blockClass === 'Image' && obs.imageUrl && (
          <img
            src={obs.imageUrl}
            alt={obs.title}
            style={{ width: '100%', display: 'block', borderRadius: 1 }}
          />
        )}

        {/* Body: Link */}
        {obs.blockClass === 'Link' && (
          <a
            href={obs.linkUrl ?? '#'}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize:      10,
              letterSpacing: '0.06em',
              color:         accentColor,
              textDecoration: 'none',
              wordBreak:     'break-all',
            }}
          >
            {obs.title || obs.linkUrl}
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

        {/* Visual tag metadata */}
        {obs.tag && (
          <div style={tagRow}>
            <span>{obs.tag.material}</span>
            <span>·</span>
            <span>{obs.tag.size}</span>
            <span>·</span>
            <span>{obs.tag.edge}</span>
          </div>
        )}

      </div>
    </div>
  )
}

// ─── Public component ─────────────────────────────────────────────────────────

/**
 * Fullscreen HTML detail overlay — mounted outside the R3F Canvas.
 * Renders when an observation is focused (activeObservationId is set).
 * Clicking the backdrop or the × button clears the focused observation.
 */
export function ArchiveOverlay() {
  const activeObservationId  = useExperienceStore((s) => s.activeObservationId)
  const setActiveObservation = useExperienceStore((s) => s.setActiveObservation)
  const accentColor          = useAtmosphereStore((s) => s.config.lightColor)
  const { data }             = useArenaData()

  if (!activeObservationId) return null

  // Look up the observation across all rooms
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
