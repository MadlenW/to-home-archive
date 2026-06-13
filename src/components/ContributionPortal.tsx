'use client'

import { useState, type CSSProperties } from 'react'
import { useExperienceStore }           from '../stores/useExperienceStore'
import { useAtmosphereStore }           from '../stores/useAtmosphereStore'
import type { SpikeColorTarget }        from '../stores/useAtmosphereStore'
import { prependObservation }           from '../hooks/useArenaData'
import type { Observation, BlockClass } from '../hooks/useArenaData'

// ─── Semantic style extraction ────────────────────────────────────────────────

function extractSemanticStyle(text: string): SpikeColorTarget {
  const s      = text.toLowerCase()
  const has    = (...kws: string[]) => kws.some((w) => s.includes(w))
  const result: SpikeColorTarget = {}

  if (has('dream', 'cloud', 'mist', 'haze', 'pearl', 'gauze', 'veil', 'float', 'drift'))
    Object.assign(result, { fogColor: '#ccc0e8', lightColor: '#e8d4f0' })
  else if (has('warm', 'amber', 'gold', 'honey', 'ember', 'wheat', 'glow', 'harvest'))
    Object.assign(result, { fogColor: '#b86020', lightColor: '#e8a040' })
  else if (has('cold', 'ice', 'frost', 'snow', 'winter', 'grey', 'gray', 'steel', 'ash', 'pale'))
    Object.assign(result, { fogColor: '#506070', lightColor: '#90a8c0' })
  else if (has('dark', 'night', 'shadow', 'void', 'deep', 'black', 'abyss', 'absence'))
    Object.assign(result, { fogColor: '#060810', lightColor: '#1c1c2a' })
  else if (has('green', 'forest', 'grass', 'moss', 'leaf', 'garden', 'bloom', 'grow'))
    Object.assign(result, { fogColor: '#1a4010', lightColor: '#60c030' })
  else if (has('water', 'ocean', 'rain', 'river', 'sea', 'wave', 'flow', 'liquid', 'flood'))
    Object.assign(result, { fogColor: '#0a2040', lightColor: '#2870c0' })
  else if (has('fire', 'burn', 'flame', 'heat', 'blaze', 'scorch', 'spark'))
    Object.assign(result, { fogColor: '#280806', lightColor: '#e04020' })
  else if (has('pink', 'rose', 'blush', 'petal', 'tender', 'pastel', 'peach'))
    Object.assign(result, { fogColor: '#c87090', lightColor: '#f0b0c0' })

  if (has('thick', 'dense', 'heavy', 'murk', 'cloud', 'mist', 'fog', 'opaque', 'humid'))
    result.fogDensity = 0.88
  else if (has('clear', 'bright', 'open', 'airy', 'transparent', 'bare', 'exposed'))
    result.fogDensity = 0.12

  if (has('still', 'silent', 'quiet', 'pause', 'freeze', 'suspended', 'slow', 'dream', 'hold'))
    result.particleMotionSpeed = 0.08
  else if (has('fast', 'quick', 'rush', 'spin', 'swirl', 'wind', 'storm', 'scatter', 'wild'))
    result.particleMotionSpeed = 0.88

  return result
}

// ─── Stable unique ID ─────────────────────────────────────────────────────────

let _seq = 0
function nextId(): string {
  return `contrib_${Date.now()}_${++_seq}`
}

// ─── Styles ───────────────────────────────────────────────────────────────────
// Light card on frosted-dark backdrop — the bright card floats against the
// dimmed, blurred room medium behind it.

const backdrop: CSSProperties = {
  position:             'fixed',
  inset:                0,
  display:              'flex',
  alignItems:           'center',
  justifyContent:       'center',
  background:           'rgba(8,8,8,0.58)',
  backdropFilter:       'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  zIndex:               500,
  fontFamily:           "'Martian Mono', monospace",
}

const panel: CSSProperties = {
  width:        'min(418px, 94vw)',
  background:   '#fcfbf9',
  border:       '1px solid rgba(0,0,0,0.07)',
  borderRadius: 2,
  padding:      '24px 22px 20px',
  boxShadow:    '0 8px 48px rgba(0,0,0,0.28)',
}

const sectionHead: CSSProperties = {
  fontSize:      8,
  textTransform: 'uppercase',
  letterSpacing: '0.15em',
  color:         'rgba(0,0,0,0.32)',
  marginBottom:  22,
}

const lbl: CSSProperties = {
  display:       'block',
  fontSize:      7,
  textTransform: 'uppercase',
  letterSpacing: '0.14em',
  color:         'rgba(0,0,0,0.30)',
  marginBottom:  7,
}

const textareaBase: CSSProperties = {
  width:        '100%',
  minHeight:    82,
  background:   'rgba(0,0,0,0.03)',
  border:       '1px solid rgba(0,0,0,0.10)',
  borderRadius: 1,
  color:        'rgba(0,0,0,0.80)',
  fontFamily:   'inherit',
  fontSize:     11,
  lineHeight:   1.72,
  padding:      '8px 10px',
  resize:       'none',
  outline:      'none',
  marginBottom: 14,
  boxSizing:    'border-box' as const,
}

const inputBase: CSSProperties = {
  width:        '100%',
  background:   'rgba(0,0,0,0.03)',
  border:       '1px solid rgba(0,0,0,0.10)',
  borderRadius: 1,
  color:        'rgba(0,0,0,0.65)',
  fontFamily:   'inherit',
  fontSize:     10,
  padding:      '7px 10px',
  outline:      'none',
  marginBottom: 22,
  boxSizing:    'border-box' as const,
}

const btnRow: CSSProperties = {
  display:        'flex',
  justifyContent: 'flex-end',
  gap:            12,
}

const cancelBtnStyle: CSSProperties = {
  fontSize:      8,
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
  background:    'none',
  border:        'none',
  color:         'rgba(0,0,0,0.28)',
  cursor:        'pointer',
  fontFamily:    'inherit',
  padding:       '5px 0',
}

const submitBtnStyle: CSSProperties = {
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

const errStyle: CSSProperties = {
  fontSize:     9,
  color:        'rgba(170,30,15,0.85)',
  marginBottom: 14,
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ContributionPortal() {
  const activeRoomId  = useExperienceStore((s) => s.activeRoomId)
  const setPortalOpen = useExperienceStore((s) => s.setPortalOpen)
  const setSpike      = useAtmosphereStore((s) => s.setSpike)

  const [content, setContent] = useState('')
  const [linkUrl, setLinkUrl] = useState('')
  const [err, setErr]         = useState<string | null>(null)

  const close = () => {
    setPortalOpen(false)
    setContent('')
    setLinkUrl('')
    setErr(null)
  }

  const handleSubmit = () => {
    const hasText = content.trim().length > 0
    const hasLink = linkUrl.trim().length > 0

    if (!hasText && !hasLink) {
      setErr('enter a text fragment or url to contribute')
      return
    }
    if (!activeRoomId) return

    const blockClass: BlockClass = hasLink ? 'Link' : 'Text'
    const words = content.trim().split(/\s+/).filter(Boolean).length

    const newObs: Observation = {
      id:           nextId(),
      roomId:       activeRoomId,
      blockClass,
      text:         content.trim(),
      imageUrl:     null,
      thumbUrl:     null,
      linkUrl:      hasLink ? linkUrl.trim() : null,
      title:        '',
      sizeEstimate: words < 12 ? 'small' : words < 48 ? 'medium' : 'large',
      timestamp:    new Date(),
      tag:          null,
      isMock:       false,
    }

    const semanticStyle = extractSemanticStyle(content.trim() || linkUrl.trim())
    const rawForSpike   = { content: content.trim() || linkUrl.trim(), class: blockClass }

    prependObservation(activeRoomId, newObs)
    setSpike(rawForSpike, Object.keys(semanticStyle).length > 0 ? semanticStyle : null)

    close()
  }

  return (
    <div style={backdrop} onClick={close}>
      <div style={panel} onClick={(e) => e.stopPropagation()}>

        <div style={sectionHead}>add to archive</div>

        <label style={lbl}>text fragment</label>
        <textarea
          style={textareaBase}
          value={content}
          onChange={(e) => { setContent(e.target.value); setErr(null) }}
          placeholder="what does this room hold..."
          spellCheck={false}
          // eslint-disable-next-line jsx-a11y/no-autofocus
          autoFocus
        />

        <label style={lbl}>link / url (optional)</label>
        <input
          type="url"
          style={inputBase}
          value={linkUrl}
          onChange={(e) => { setLinkUrl(e.target.value); setErr(null) }}
          placeholder="https://..."
        />

        {err && <div style={errStyle}>{err}</div>}

        <div style={btnRow}>
          <button
            style={cancelBtnStyle}
            onClick={close}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'rgba(0,0,0,0.55)' }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(0,0,0,0.28)' }}
          >
            cancel
          </button>
          <button
            style={submitBtnStyle}
            onClick={handleSubmit}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#2e2a28' }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#1a1614' }}
          >
            submit
          </button>
        </div>

      </div>
    </div>
  )
}
