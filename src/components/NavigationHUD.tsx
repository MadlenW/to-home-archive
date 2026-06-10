'use client'

import { CSSProperties } from 'react'
import { useExperienceStore } from '../stores/useExperienceStore'
import { ContributionPortal } from './ContributionPortal'
import { ROOM_LOOP } from '../hooks/useSpatialLook'

// ─── Styles ───────────────────────────────────────────────────────────────────

const overlay: CSSProperties = {
  position:       'fixed',
  inset:          0,
  zIndex:         400,
  pointerEvents:  'none',
  fontFamily:     "'Martian Mono', monospace",
}

const topBar: CSSProperties = {
  position:       'absolute',
  top:            0,
  left:           0,
  right:          0,
  padding:        '20px 26px',
  display:        'flex',
  justifyContent: 'space-between',
  alignItems:     'center',
}

const backBtn: CSSProperties = {
  fontSize:        9,
  textTransform:   'uppercase',
  letterSpacing:   '0.13em',
  color:           'rgba(255,255,255,0.38)',
  background:      'none',
  border:          'none',
  padding:         0,
  cursor:          'pointer',
  pointerEvents:   'all',
  transition:      'color 0.2s',
  fontFamily:      'inherit',
}

const roomNameStyle: CSSProperties = {
  fontSize:        9,
  textTransform:   'uppercase',
  letterSpacing:   '0.13em',
  color:           'var(--live-light-color)',
  opacity:         0.72,
}

const bottomBar: CSSProperties = {
  position:       'absolute',
  bottom:         0,
  left:           0,
  right:          0,
  padding:        '0 26px 22px',
  display:        'flex',
  justifyContent: 'center',
  gap:            10,
  alignItems:     'center',
}

// ─── Room loop indicator ─────────────────────────────────────────────────────

function LoopDots({ activeRoomId }: { activeRoomId: string | null }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      {ROOM_LOOP.map((id) => (
        <div
          key={id}
          style={{
            width:           id === activeRoomId ? 7 : 4,
            height:          id === activeRoomId ? 7 : 4,
            borderRadius:    '50%',
            background:      id === activeRoomId
              ? 'var(--live-light-color)'
              : 'rgba(255,255,255,0.18)',
            transition:      'width 0.3s, height 0.3s, background 0.3s',
            pointerEvents:   'none',
          }}
        />
      ))}
    </div>
  )
}

// ─── Public component ─────────────────────────────────────────────────────────

/**
 * Screen-space HTML overlay — always mounted, self-hides when on floorplan.
 * Provides the "Return to Floorplan" back button and a room-loop indicator.
 */
export function NavigationHUD() {
  const currentView  = useExperienceStore((s) => s.currentView)
  const activeRoomId = useExperienceStore((s) => s.activeRoomId)
  const setView      = useExperienceStore((s) => s.setView)
  const isPortalOpen = useExperienceStore((s) => s.isPortalOpen)
  const setPortalOpen = useExperienceStore((s) => s.setPortalOpen)

  if (currentView !== 'room') return null

  const roomLabel = activeRoomId
    ? activeRoomId.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    : ''

  return (
    <>
      <div style={overlay} aria-hidden="false">
        {/* Top bar: back button (left) + room name + add button (right) */}
        <div style={topBar}>
          <button
            style={backBtn}
            onClick={() => setView('floorplan', null)}
            onMouseEnter={(e) => {
              ;(e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.82)'
            }}
            onMouseLeave={(e) => {
              ;(e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.38)'
            }}
          >
            ← floor plan
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: 18, pointerEvents: 'all' }}>
            <span style={roomNameStyle}>{roomLabel}</span>
            <button
              style={{
                ...backBtn,
                fontSize:    13,
                lineHeight:  1,
                color:       'var(--live-light-color)',
                opacity:     0.55,
                padding:     '1px 0 2px',
              }}
              onClick={() => setPortalOpen(true)}
              onMouseEnter={(e) => {
                ;(e.currentTarget as HTMLElement).style.opacity = '1'
              }}
              onMouseLeave={(e) => {
                ;(e.currentTarget as HTMLElement).style.opacity = '0.55'
              }}
              title="Add to archive"
            >
              +
            </button>
          </div>
        </div>

        {/* Bottom: room-loop dot indicator */}
        <div style={bottomBar}>
          <LoopDots activeRoomId={activeRoomId} />
        </div>
      </div>

      {isPortalOpen && <ContributionPortal />}
    </>
  )
}
