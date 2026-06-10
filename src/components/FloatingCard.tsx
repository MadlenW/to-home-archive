'use client'

import { useRef, useMemo, useState, useEffect, Suspense } from 'react'
import { useFrame }          from '@react-three/fiber'
import type { ThreeEvent }   from '@react-three/fiber'
import { Billboard, Text, useTexture } from '@react-three/drei'
import {
  Shape, ShapeGeometry, DoubleSide, Color, Vector3,
  Group, MeshBasicMaterial,
} from 'three'
import { useExperienceStore } from '../stores/useExperienceStore'
import type { Observation }   from '../hooks/useArenaData'
import type { RoomVisualState } from '../config/rooms'

// ─── Card geometry ─────────────────────────────────────────────────────────────

const CARD_DIMS = {
  small:  { hw: 0.42, hh: 0.28 },
  medium: { hw: 0.62, hh: 0.42 },
  large:  { hw: 0.88, hh: 0.60 },
} as const

function makeCardShape(hw: number, hh: number): Shape {
  const r = Math.min(hw, hh) * 0.14
  const s = new Shape()
  s.moveTo(-hw + r, -hh)
  s.lineTo( hw - r, -hh)
  s.quadraticCurveTo( hw, -hh,  hw, -hh + r)
  s.lineTo( hw,  hh - r)
  s.quadraticCurveTo( hw,  hh,  hw - r,  hh)
  s.lineTo(-hw + r,  hh)
  s.quadraticCurveTo(-hw,  hh, -hw,  hh - r)
  s.lineTo(-hw, -hh + r)
  s.quadraticCurveTo(-hw, -hh, -hw + r, -hh)
  return s
}

// ─── LOD constant ─────────────────────────────────────────────────────────────

const TIER_DIST   = 15
const HOVER_SCALE = 1.07

// ─── Sub-components ───────────────────────────────────────────────────────────

function ImagePlane({ url, hw, hh }: { url: string; hw: number; hh: number }) {
  const texture = useTexture(url)
  return (
    <mesh position={[0, 0, 0.012]}>
      <planeGeometry args={[hw * 1.86, hh * 1.86]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} />
    </mesh>
  )
}

function ImagePlaceholder({ hw, hh, color }: { hw: number; hh: number; color: string }) {
  return (
    <mesh position={[0, 0, 0.012]}>
      <planeGeometry args={[hw * 1.86, hh * 1.86]} />
      <meshBasicMaterial color={color} transparent opacity={0.15} depthWrite={false} />
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
  const [tier, setTier] = useState(1)
  const tierRef         = useRef(1)

  const isFocused          = useExperienceStore((s) => s.activeObservationId === observation.id)
  const setActiveObservation = useExperienceStore((s) => s.setActiveObservation)

  // Stable per-card phase offsets derived from index (golden-ratio sequence)
  const phase = useMemo(() => ({
    x: ((index * 1.618033988) % 1.0) * Math.PI * 2,
    y: ((index * 2.414213562) % 1.0) * Math.PI * 2,
    z: ((index * 0.732050808) % 1.0) * Math.PI * 2,
  }), [index])

  const dims    = CARD_DIMS[observation.sizeEstimate]
  const cardGeo = useMemo(
    () => new ShapeGeometry(makeCardShape(dims.hw, dims.hh), 4),
    [dims.hw, dims.hh],
  )
  useEffect(() => () => { cardGeo.dispose() }, [cardGeo])

  const worldBase = useMemo(() => new Vector3(...basePosition), [basePosition])

  const groupRef   = useRef<Group>(null)
  const bgMatRef   = useRef<MeshBasicMaterial>(null)
  const liveOpacity = useRef(0.18)
  const liveScale   = useRef(1.0)
  const hovered     = useRef(false)

  useFrame(({ camera, clock }, delta) => {
    if (!groupRef.current) return

    // ── Tier detection ─────────────────────────────────────────────────────────
    const dist    = camera.position.distanceTo(worldBase)
    const newTier = dist > TIER_DIST ? 1 : 2
    if (newTier !== tierRef.current) {
      tierRef.current = newTier
      setTier(newTier)
    }

    const decay = 1 - Math.exp(-6 * delta)

    // ── Opacity ────────────────────────────────────────────────────────────────
    const targetOpacity = isFocused
      ? 0
      : newTier === 1 ? 0.22 : hovered.current ? 0.90 : 0.70
    liveOpacity.current += (targetOpacity - liveOpacity.current) * decay
    if (bgMatRef.current) bgMatRef.current.opacity = liveOpacity.current

    // ── Scale ──────────────────────────────────────────────────────────────────
    const targetScale = hovered.current && !isFocused ? HOVER_SCALE : 1.0
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

  // ── Event handlers ─────────────────────────────────────────────────────────

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    setActiveObservation(observation.id)
  }

  const handlePointerOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    hovered.current = true
  }

  const handlePointerOut = () => {
    hovered.current = false
  }

  // ── Content ────────────────────────────────────────────────────────────────

  const displayText = observation.text.slice(0, tier === 1 ? 55 : 230)

  const cardColor = useMemo(() => {
    const base   = new Color(roomConfig.backgroundColor)
    const accent = new Color(roomConfig.lightColor)
    return '#' + base.lerp(accent, 0.09).getHexString()
  }, [roomConfig.backgroundColor, roomConfig.lightColor])

  const textColor = tier === 1
    ? 'rgba(210,210,210,0.48)'
    : roomConfig.fogColor

  return (
    <group ref={groupRef} position={basePosition}>
      <Billboard follow lockX={false} lockY={false} lockZ={false}>

        {/* Card background plane */}
        <mesh
          geometry={cardGeo}
          onClick={handleClick}
          onPointerOver={handlePointerOver}
          onPointerOut={handlePointerOut}
        >
          <meshBasicMaterial
            ref={bgMatRef}
            color={cardColor}
            transparent
            opacity={0.22}
            side={DoubleSide}
            depthWrite={false}
          />
        </mesh>

        {/* Text content */}
        {(observation.blockClass === 'Text' ||
          observation.blockClass === 'Link' ||
          observation.blockClass === 'Unknown') &&
          displayText.trim() && (
            <Text
              position={[0, 0, 0.016]}
              fontSize={0.066}
              maxWidth={dims.hw * 1.86}
              color={textColor}
              textAlign="center"
              anchorX="center"
              anchorY="middle"
            >
              {displayText}
            </Text>
          )}

        {/* Image content: placeholder (Tier 1) or texture (Tier 2) */}
        {observation.blockClass === 'Image' && (
          tier >= 2 && observation.imageUrl ? (
            <Suspense
              fallback={
                <ImagePlaceholder hw={dims.hw} hh={dims.hh} color={roomConfig.lightColor} />
              }
            >
              <ImagePlane url={observation.imageUrl} hw={dims.hw} hh={dims.hh} />
            </Suspense>
          ) : (
            <ImagePlaceholder hw={dims.hw} hh={dims.hh} color={roomConfig.lightColor} />
          )
        )}

        {/* Media: play glyph */}
        {observation.blockClass === 'Media' && (
          <Text
            position={[0, 0, 0.016]}
            fontSize={0.16}
            color={textColor}
            anchorX="center"
            anchorY="middle"
          >
            {'▶'}
          </Text>
        )}

      </Billboard>
    </group>
  )
}
