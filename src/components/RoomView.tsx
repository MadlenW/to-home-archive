'use client'

import { useEffect, useRef, useMemo } from 'react'
import { useFrame, useThree }         from '@react-three/fiber'
import {
  AmbientLight,
  BackSide,
  Color,
  DoubleSide,
  FogExp2,
  Mesh,
  PointLight,
  SphereGeometry,
} from 'three'
import { useExperienceStore }              from '../stores/useExperienceStore'
import type { RoomId }                     from '../stores/useExperienceStore'
import { useAtmosphereStore, liveConfig }  from '../stores/useAtmosphereStore'
import { ROOM_WORLD_POSITIONS }            from './FloorplanView'
import { useArenaData }                    from '../hooks/useArenaData'
import { FloatingCard }                    from './FloatingCard'
import type { Observation }                from '../hooks/useArenaData'
import { MediumMaterial, MediumMat, MEDIUM_BY_ROOM, FOG_SCALE } from './MediumMaterial'

// ─── Standard enclosure (modes 0 – 3) ────────────────────────────────────────
// Single BackSide sphere following the camera. One material instance, zero
// draw-call overhead beyond a normal mesh.

interface EnclosureProps {
  sphereGeo: SphereGeometry
  roomScale: [number, number, number]
}

function StandardEnclosure({ sphereGeo, roomScale }: EnclosureProps) {
  const material = useMemo(() => {
    const m = new MediumMaterial() as unknown as MediumMat
    m.side  = BackSide
    m.uLayer = 0.0
    return m
  }, [])

  const meshRef = useRef<Mesh>(null)
  const _base   = useMemo(() => new Color('#fcfbf9'), [])
  const _atm    = useMemo(() => new Color(), [])

  useEffect(() => () => { material.dispose() }, [material])

  useFrame(({ clock, camera, size }) => {
    const { activeRoomId } = useExperienceStore.getState()
    const mt = activeRoomId ? (MEDIUM_BY_ROOM[activeRoomId as RoomId] ?? 0) : 0
    const lc = liveConfig.current
    const t  = clock.getElapsedTime()

    if (meshRef.current) meshRef.current.position.copy(camera.position)

    material.uTime       = t
    material.uMediumType = mt
    material.uIntensity  = lc.lightIntensity * 0.55
    material.uNoiseScale = 0.35 + lc.textureNoiseLevel * 1.0
    material.uRoughness  = 0.6
    material.uWindowSize.set(size.width, size.height)

    _base.set('#fcfbf9')
    _atm.set(lc.fogColor)
    _base.lerp(_atm, 0.18)
    material.uBaseColor.copy(_base)
  })

  return (
    <mesh ref={meshRef} geometry={sphereGeo} material={material} scale={roomScale} />
  )
}

// ─── Fur / Cloud enclosure (mode 4) ──────────────────────────────────────────
// 16 concentric shells share one SphereGeometry. Each shell has its own
// MediumMaterial instance with a fixed uLayer (0 = root, 1 = tip).
// Shells render back-to-front (outermost first) via explicit renderOrder so
// alpha-blending accumulates correctly. depthWrite={false} prevents z-fighting.

const SHELL_COUNT = 16

function FurShells({ sphereGeo, roomScale }: EnclosureProps) {
  // One material per shell — uLayer is fixed at creation time, never changes
  const shellMats = useMemo(() => {
    return Array.from({ length: SHELL_COUNT }, (_, i) => {
      const layer = i / (SHELL_COUNT - 1)
      const m     = new MediumMaterial() as unknown as MediumMat
      m.side        = DoubleSide
      m.transparent = true
      m.depthWrite  = false
      m.uMediumType = 4.0
      m.uLayer      = layer
      return m
    })
  }, [])

  const meshRefs = useRef<(Mesh | null)[]>(Array(SHELL_COUNT).fill(null))
  const _base    = useMemo(() => new Color('#fcfbf9'), [])
  const _atm     = useMemo(() => new Color(), [])

  useEffect(() => () => { shellMats.forEach((m) => m.dispose()) }, [shellMats])

  useFrame(({ clock, camera }) => {
    const lc = liveConfig.current
    const t  = clock.getElapsedTime()

    _base.set('#fcfbf9')
    _atm.set(lc.fogColor)
    _base.lerp(_atm, 0.14)  // lighter atmosphere tint for the airy cloud feel

    for (let i = 0; i < SHELL_COUNT; i++) {
      const mesh = meshRefs.current[i]
      if (mesh) mesh.position.copy(camera.position)

      const mat      = shellMats[i]
      mat.uTime       = t
      mat.uIntensity  = lc.lightIntensity * 0.65
      mat.uNoiseScale = 0.30 + lc.textureNoiseLevel * 0.8
      mat.uBaseColor.copy(_base)
    }
  })

  return (
    <>
      {shellMats.map((mat, i) => (
        // renderOrder ensures outer (root) shells draw first, inner (tip) shells last
        <mesh
          key={i}
          ref={(el) => { meshRefs.current[i] = el }}
          geometry={sphereGeo}
          material={mat}
          scale={roomScale}
          renderOrder={i}
        />
      ))}
    </>
  )
}

// ─── Space enclosure coordinator ──────────────────────────────────────────────
// Owns the scene fog and the shared sphere geometry. Delegates the actual mesh
// rendering to StandardEnclosure (modes 0–3) or FurShells (mode 4).

function SpaceEnclosure() {
  const { scene }  = useThree()
  const config     = useAtmosphereStore((s) => s.config)
  const roomId     = useExperienceStore((s) => s.activeRoomId)
  const medType    = roomId ? (MEDIUM_BY_ROOM[roomId as RoomId] ?? 0) : 0

  // Shared geometry for all enclosure types (created once, disposed on unmount)
  const sphereGeo  = useMemo(() => new SphereGeometry(30, 48, 32), [])

  useEffect(() => {
    scene.fog = new FogExp2(liveConfig.current.fogColor, 0.02)
    return () => {
      scene.fog = null
      sphereGeo.dispose()
    }
  }, [scene, sphereGeo])

  // Update fog density every frame — AtmosphereDecay sets the base, we apply
  // the medium-type scale on top (since SpaceEnclosure's useFrame runs after it).
  useFrame(() => {
    const { activeRoomId } = useExperienceStore.getState()
    const mt = activeRoomId ? (MEDIUM_BY_ROOM[activeRoomId as RoomId] ?? 0) : 0
    const lc = liveConfig.current

    if (scene.fog instanceof FogExp2) {
      scene.fog.color.set(lc.fogColor)
      const base = 0.004 + lc.fogDensity * 0.072
      scene.fog.density = base * (FOG_SCALE[mt] ?? 1.0)
    }
  })

  return medType === 4
    ? <FurShells    sphereGeo={sphereGeo} roomScale={config.roomScale} />
    : <StandardEnclosure sphereGeo={sphereGeo} roomScale={config.roomScale} />
}

// ─── Room lighting ────────────────────────────────────────────────────────────

function RoomLights() {
  const config   = useAtmosphereStore((s) => s.config)
  const ambRef   = useRef<AmbientLight>(null)
  const pointRef = useRef<PointLight>(null)

  useFrame(() => {
    const lc = liveConfig.current
    if (ambRef.current) {
      ambRef.current.color.set(lc.lightColor)
      ambRef.current.intensity = lc.lightIntensity * 0.22
    }
    if (pointRef.current) {
      pointRef.current.color.set(lc.lightColor)
      pointRef.current.intensity = lc.lightIntensity * 1.4
    }
  })

  return (
    <>
      <ambientLight ref={ambRef} color={config.lightColor} intensity={config.lightIntensity * 0.22} />
      <pointLight
        ref={pointRef}
        color={config.lightColor}
        intensity={config.lightIntensity * 1.4}
        distance={22}
        decay={2}
        position={[0, 2.8, 0]}
      />
    </>
  )
}

// ─── Card position helpers ────────────────────────────────────────────────────

function stableHash(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h  = (Math.imul(h, 0x01000193) >>> 0)
  }
  return h / 0xFFFFFFFF
}

function computeCardPosition(
  obs: Observation,
  index: number,
  total: number,
  center: { x: number; z: number },
): [number, number, number] {
  const h0 = stableHash(obs.id)
  const h1 = stableHash(obs.id + 'r')
  const h2 = stableHash(obs.id + 'y')

  const baseAngle = (index / Math.max(total, 1)) * Math.PI * 2
  const jitter    = (h0 - 0.5) * (Math.PI * 0.6 / Math.max(total, 1))
  const angle     = baseAngle + jitter

  const radius = 3.2 + h1 * 3.8
  const height = 0.9 + h2 * 2.8

  return [
    center.x + Math.cos(angle) * radius,
    height,
    center.z + Math.sin(angle) * radius,
  ]
}

// ─── Public component ─────────────────────────────────────────────────────────

export function RoomView() {
  const currentView  = useExperienceStore((s) => s.currentView)
  const activeRoomId = useExperienceStore((s) => s.activeRoomId)
  const setFromRoom  = useAtmosphereStore((s) => s.setFromRoom)
  const config       = useAtmosphereStore((s) => s.config)

  const { data } = useArenaData()

  useEffect(() => {
    if (activeRoomId) setFromRoom(activeRoomId)
  }, [activeRoomId, setFromRoom])

  if (currentView !== 'room') return null

  const observations = (activeRoomId ? data[activeRoomId] : null) ?? []
  const roomCenter   = activeRoomId ? ROOM_WORLD_POSITIONS[activeRoomId] : null

  return (
    <>
      <RoomLights />
      <SpaceEnclosure />

      {roomCenter && observations.map((obs, i) => (
        <FloatingCard
          key={obs.id}
          observation={obs}
          basePosition={computeCardPosition(obs, i, observations.length, roomCenter)}
          roomConfig={config}
          index={i}
        />
      ))}
    </>
  )
}
