'use client'

import { useRef, useMemo, useState, Suspense } from 'react'
import { useFrame }          from '@react-three/fiber'
import type { ThreeEvent }   from '@react-three/fiber'
import { Billboard, Text, useTexture } from '@react-three/drei'
import { Vector3, Group }    from 'three'
import { useExperienceStore } from '../stores/useExperienceStore'
import type { Observation }   from '../hooks/useArenaData'
import type { RoomVisualState } from '../config/rooms'

// ─── Text cleaning ────────────────────────────────────────────────────────────

const cleanText = (rawText: string) =>
  rawText.replace(/\[col:.*?\]/g, '').trim()

// ─── Constants ────────────────────────────────────────────────────────────────

const CARD_DIMS = {
  small:  { hw: 0.42, hh: 0.28 },
  medium: { hw: 0.62, hh: 0.42 },
  large:  { hw: 0.88, hh: 0.60 },
} as const

const TIER_DIST   = 15
const HOVER_SCALE = 1.07

// High-contrast charcoal — legible against every room medium and the fog shaders.
const TEXT_COLOR = '#1a1614'

// renderOrder above FurShells (0–15) and StandardEnclosure (0) so text is
// never occluded by the sphere shaders regardless of medium type.
const TEXT_RENDER_ORDER = 16

// ─── Image sub-components ─────────────────────────────────────────────────────
// No placeholder — images appear when loaded; nothing shown while loading.

function ImagePlane({
  url, hw, hh, onClick, onPointerOver, onPointerOut,
}: {
  url:            string
  hw:             number
  hh:             number
  onClick:        (e: ThreeEvent<MouseEvent>) => void
  onPointerOver:  (e: ThreeEvent<PointerEvent>) => void
  onPointerOut:   () => void
}) {
  const texture = useTexture(url)
  return (
    <mesh
      renderOrder={TEXT_RENDER_ORDER}
      onClick={onClick}
      onPointerOver={onPointerOver}
      onPointerOut={onPointerOut}
    >
      <planeGeometry args={[hw * 1.86, hh * 1.86]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} />
    </mesh>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export interface FloatingCardProps {
  observation:  Observation
  basePosition: [number, number, number]
  roomConfig:   RoomVisualState
  index:        number
}

export function FloatingCard({
  observation,
  basePosition,
  roomConfig,
  index,
}: FloatingCardProps) {
  // Tier: 1 = distant (>15 units), 2 = near. Used for text truncation + image LOD.
  const [tier, setTier]         = useState(1)
  const tierRef                 = useRef(1)

  // isHovered drives fillOpacity via React re-render; isHoveredRef drives scale
  // via useFrame (avoids stale closure on the hot path).
  const [isHovered, setIsHovered] = useState(false)
  const isHoveredRef              = useRef(false)

  const isFocused            = useExperienceStore((s) => s.activeObservationId === observation.id)
  const setActiveObservation = useExperienceStore((s) => s.setActiveObservation)

  const phase = useMemo(() => ({
    x: ((index * 1.618033988) % 1.0) * Math.PI * 2,
    y: ((index * 2.414213562) % 1.0) * Math.PI * 2,
    z: ((index * 0.732050808) % 1.0) * Math.PI * 2,
  }), [index])

  const dims      = CARD_DIMS[observation.sizeEstimate]
  const worldBase = useMemo(() => new Vector3(...basePosition), [basePosition])
  const groupRef  = useRef<Group>(null)
  const liveScale = useRef(1.0)

  useFrame(({ camera, clock }, delta) => {
    if (!groupRef.current) return

    // ── Tier detection ────────────────────────────────────────────────────────
    const dist    = camera.position.distanceTo(worldBase)
    const newTier = dist > TIER_DIST ? 1 : 2
    if (newTier !== tierRef.current) {
      tierRef.current = newTier
      setTier(newTier)
    }

    // ── Scale ─────────────────────────────────────────────────────────────────
    const decay       = 1 - Math.exp(-6 * delta)
    const targetScale = isHoveredRef.current && !isFocused ? HOVER_SCALE : 1.0
    liveScale.current += (targetScale - liveScale.current) * decay
    groupRef.current.scale.setScalar(liveScale.current)

    // ── Drift (suppressed while focused) ──────────────────────────────────────
    if (!isFocused) {
      const t  = clock.elapsedTime
      const ms = Math.max(0.06, roomConfig.particleMotionSpeed) * 0.7
      const A  = 0.15
      groupRef.current.position.set(
        basePosition[0] + Math.sin(t * ms        + phase.x) * A,
        basePosition[1] + Math.cos(t * ms * 0.65 + phase.y) * A * 0.55,
        basePosition[2] + Math.sin(t * ms * 0.48 + phase.z) * A * 0.4,
      )
    }
  })

  // ── Event handlers ────────────────────────────────────────────────────────

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    setActiveObservation(observation.id)
  }

  const handlePointerOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    isHoveredRef.current = true
    setIsHovered(true)
    document.body.style.cursor = 'pointer'
  }

  const handlePointerOut = () => {
    isHoveredRef.current = false
    setIsHovered(false)
    document.body.style.cursor = ''
  }

  // ── Derived render values ─────────────────────────────────────────────────

  // Text opacity: distant = faint, near = present, hover = full, focused = hidden
  const fillOpacity = isFocused ? 0 : tier === 1 ? 0.38 : isHovered ? 1.0 : 0.82

  // Tier 1 shows a brief excerpt; tier 2 shows the full fragment up to 260 chars
  const displayText = cleanText(observation.text).slice(0, tier === 1 ? 60 : 260)

  const isTextLike = (
    observation.blockClass === 'Text' ||
    observation.blockClass === 'Link' ||
    observation.blockClass === 'Unknown'
  )

  // Shared props for every <Text> node: high-contrast charcoal, always in front,
  // never writes depth so it doesn't occlude the medium shaders behind it.
  const textProps = {
    color:                TEXT_COLOR,
    fillOpacity,
    renderOrder:          TEXT_RENDER_ORDER,
    'material-depthWrite':  false,
    'material-transparent': true,
    textAlign:            'center' as const,
    anchorX:              'center' as const,
    anchorY:              'middle' as const,
    onClick:              handleClick,
    onPointerOver:        handlePointerOver,
    onPointerOut:         handlePointerOut,
  }

  return (
    <group ref={groupRef} position={basePosition}>
      <Billboard follow lockX={false} lockY={false} lockZ={false}>

        {/* Text / Link / Unknown — pure floating charcoal text, no backing shape */}
        {isTextLike && displayText.trim() && (
          <Text fontSize={0.068} maxWidth={dims.hw * 2.4} {...textProps}>
            {displayText}
          </Text>
        )}

        {/* Image — texture only, no placeholder; appears when in range and loaded */}
        {observation.blockClass === 'Image' && tier >= 2 && observation.imageUrl && (
          <Suspense fallback={null}>
            <ImagePlane
              url={observation.imageUrl}
              hw={dims.hw}
              hh={dims.hh}
              onClick={handleClick}
              onPointerOver={handlePointerOver}
              onPointerOut={handlePointerOut}
            />
          </Suspense>
        )}

        {/* Media — bare URL as minimal floating label */}
        {observation.blockClass === 'Media' && observation.linkUrl && (
          <Text fontSize={0.052} maxWidth={dims.hw * 2.4} {...textProps}>
            {observation.linkUrl}
          </Text>
        )}

      </Billboard>
    </group>
  )
}
