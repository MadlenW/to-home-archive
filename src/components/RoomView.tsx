'use client'

import { useEffect, useRef, useMemo } from 'react'
import { useFrame }                   from '@react-three/fiber'
import {
  AmbientLight,
  BackSide,
  AdditiveBlending,
  BufferGeometry,
  Float32BufferAttribute,
  Mesh,
  Points,
  PointLight,
  PointsMaterial,
  MeshBasicMaterial,
} from 'three'
import { useExperienceStore }              from '../stores/useExperienceStore'
import { useAtmosphereStore, liveConfig }  from '../stores/useAtmosphereStore'
import { ROOM_WORLD_POSITIONS }   from './FloorplanView'
import { useArenaData }           from '../hooks/useArenaData'
import { FloatingCard }           from './FloatingCard'
import type { Observation }       from '../hooks/useArenaData'

// ─── Sky dome ─────────────────────────────────────────────────────────────────

function SkyDome() {
  const config  = useAtmosphereStore((s) => s.config)
  const meshRef = useRef<Mesh>(null)
  const matRef  = useRef<MeshBasicMaterial>(null)

  useFrame(({ camera }) => {
    if (meshRef.current) meshRef.current.position.copy(camera.position)
    if (matRef.current)  matRef.current.color.set(liveConfig.current.fogColor)
  })

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[50, 24, 24]} />
      <meshBasicMaterial
        ref={matRef}
        color={config.fogColor}
        side={BackSide}
        depthWrite={false}
      />
    </mesh>
  )
}

// ─── Atmosphere particles ─────────────────────────────────────────────────────

const PARTICLE_COUNT = 380

function AtmosphereParticles() {
  const config     = useAtmosphereStore((s) => s.config)
  const activeRoom = useExperienceStore((s) => s.activeRoomId)
  const pointsRef  = useRef<Points>(null)
  const matRef     = useRef<PointsMaterial>(null)

  const { geo, base, offsets } = useMemo(() => {
    const base    = new Float32Array(PARTICLE_COUNT * 3)
    const offsets = new Float32Array(PARTICLE_COUNT)
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const theta     = Math.random() * Math.PI * 2
      const r         = 2.5 + Math.random() * 12
      base[i * 3 + 0] = Math.cos(theta) * r
      base[i * 3 + 1] = (Math.random() - 0.5) * 6
      base[i * 3 + 2] = Math.sin(theta) * r
      offsets[i]       = Math.random() * Math.PI * 2
    }
    const live = new Float32Array(base)
    const g    = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(live, 3))
    return { geo: g, base, offsets }
  }, [activeRoom])

  useFrame(({ clock, camera }) => {
    if (!pointsRef.current) return
    const live = pointsRef.current.geometry.attributes.position.array as Float32Array
    const t    = clock.elapsedTime
    const spd  = liveConfig.current.particleMotionSpeed
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const o         = offsets[i]
      live[i * 3 + 0] = base[i * 3 + 0] + Math.sin(t * 0.22 * spd + o)       * 0.45
      live[i * 3 + 1] = base[i * 3 + 1] + Math.sin(t * 0.31 * spd + o * 1.3) * 0.52
      live[i * 3 + 2] = base[i * 3 + 2] + Math.cos(t * 0.27 * spd + o * 0.8) * 0.45
    }
    pointsRef.current.geometry.attributes.position.needsUpdate = true
    pointsRef.current.position.copy(camera.position)
    if (matRef.current) matRef.current.color.set(liveConfig.current.lightColor)
  })

  return (
    <points ref={pointsRef} geometry={geo}>
      <pointsMaterial
        ref={matRef}
        color={config.lightColor}
        size={0.045}
        transparent
        opacity={0.55}
        blending={AdditiveBlending}
        depthWrite={false}
        sizeAttenuation
      />
    </points>
  )
}

// ─── Room lighting ────────────────────────────────────────────────────────────

function RoomLights() {
  const config    = useAtmosphereStore((s) => s.config)
  const ambRef    = useRef<AmbientLight>(null)
  const pointRef  = useRef<PointLight>(null)

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

/** FNV-1a 32-bit hash → [0, 1) float. Stable for any string input. */
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

  const radius = 3.2 + h1 * 3.8   // 3.2 – 7.0 units from room centre
  const height = 0.9 + h2 * 2.8   // 0.9 – 3.7 above floor

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

  const fogDensity3js = 0.004 + config.fogDensity * 0.072

  const observations = (activeRoomId ? data[activeRoomId] : null) ?? []
  const roomCenter   = activeRoomId ? ROOM_WORLD_POSITIONS[activeRoomId] : null

  return (
    <>
      <fogExp2 attach="fog" color={config.fogColor} density={fogDensity3js} />

      <RoomLights />
      <SkyDome />
      <AtmosphereParticles />

      {/* Floating archive cards */}
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
