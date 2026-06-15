'use client'

import { CSSProperties, useState } from 'react'
import { useExperienceStore, ROOM_LABELS } from '../stores/useExperienceStore'
import { ContributionPortal } from './ContributionPortal'

// ─── Styles ───────────────────────────────────────────────────────────────────

const overlay: CSSProperties = {
  position:      'fixed',
  inset:         0,
  zIndex:        400,
  pointerEvents: 'none',
  fontFamily:    "'Martian Mono', monospace",
}

const topBar: CSSProperties = {
  position:      'absolute',
  top:           0,
  left:          0,
  padding:       '20px 26px',
}

const backBtn: CSSProperties = {
  fontSize:      9,
  textTransform: 'uppercase',
  letterSpacing: '0.13em',
  color:         'rgba(255,255,255,0.38)',
  background:    'none',
  border:        'none',
  padding:       0,
  cursor:        'pointer',
  pointerEvents: 'all',
  transition:    'color 0.2s',
  fontFamily:    'inherit',
}

const zoneLabelStyle: CSSProperties = {
  display:       'block',
  marginTop:     8,
  fontSize:      10,
  letterSpacing: '0.06em',
  color:         'rgba(255,255,255,0.70)',
}

const addBtnWrap: CSSProperties = {
  position:      'absolute',
  bottom:        28,
  right:         28,
  pointerEvents: 'all',
}

// Solid gallery-white block — the primary call-to-action in room mode.
// Scale + shadow deepen on hover to make it feel weighty and click-ready.
const addBtnBase: CSSProperties = {
  display:       'block',
  background:    '#fcfbf9',
  border:        'none',
  color:         '#1a1614',
  fontFamily:    'inherit',
  fontSize:      9,
  letterSpacing: '0.18em',
  padding:       '13px 22px',
  cursor:        'pointer',
  boxShadow:     '0 2px 24px rgba(0,0,0,0.22)',
  transition:    'transform 0.16s ease, box-shadow 0.16s ease',
  userSelect:    'none',
}

// ─── Public component ─────────────────────────────────────────────────────────

export function NavigationHUD() {
  const currentView   = useExperienceStore((s) => s.currentView)
  const setView       = useExperienceStore((s) => s.setView)
  const activeRoomId  = useExperienceStore((s) => s.activeRoomId)
  const isPortalOpen  = useExperienceStore((s) => s.isPortalOpen)
  const setPortalOpen = useExperienceStore((s) => s.setPortalOpen)

  const [addHover, setAddHover] = useState(false)

  if (currentView !== 'room') return null

  return (
    <>
      <div style={overlay} aria-hidden="false">

        {/* Top-left: back to floorplan */}
        <div style={topBar}>
          <button
            style={backBtn}
            onClick={() => setView('floorplan', null)}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.82)' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(255,255,255,0.38)' }}
          >
            ← back
          </button>
          {activeRoomId && (
            <span style={zoneLabelStyle}>{ROOM_LABELS[activeRoomId]}</span>
          )}
        </div>

        {/* Bottom-right: prominent archive action — hidden while portal is open */}
        {!isPortalOpen && (
          <div style={addBtnWrap} className="hud-add-wrap">
            <button
              className="hud-add-btn"
              style={{
                ...addBtnBase,
                transform:  addHover ? 'scale(1.04)'  : 'scale(1)',
                boxShadow:  addHover
                  ? '0 6px 32px rgba(0,0,0,0.30)'
                  : '0 2px 24px rgba(0,0,0,0.22)',
              }}
              onClick={() => setPortalOpen(true)}
              onMouseEnter={() => setAddHover(true)}
              onMouseLeave={() => setAddHover(false)}
            >
              + add to archive
            </button>
          </div>
        )}

      </div>

      {isPortalOpen && <ContributionPortal />}
    </>
  )
}
