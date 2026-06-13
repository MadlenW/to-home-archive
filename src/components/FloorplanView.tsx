'use client'

import { useFrame, useThree, ThreeEvent } from '@react-three/fiber'
import { useTexture }                      from '@react-three/drei'
import { useRef, useCallback, useEffect }  from 'react'
import {
  Color, Vector3, MeshBasicMaterial, NormalBlending,
} from 'three'
import type { Texture }                    from 'three'
import { ROOM_IDS, RoomId, useExperienceStore } from '../stores/useExperienceStore'

// ─── Scan texture paths ───────────────────────────────────────────────────────

const SCAN_URLS: string[] = [
  '/tohome1.png',
  '/tohome2.png',
  '/tohome3.png',
  '/tohome4.png',
  '/tohome5.png',
]

// ─── Geometry ─────────────────────────────────────────────────────────────────
// Fixed 3:4 vertical ratio — width 3.0, height 4.0 world units.
// All five scans share these dimensions; no per-image computation needed.
const PLANE_W = 9.0
const PLANE_H = 12.0

// ─── Hover opacity levels ─────────────────────────────────────────────────────
const OPACITY_IDLE    = 0.35   // default resting state
const OPACITY_FOCUS   = 1.00   // hovered scan
const OPACITY_DIM     = 0.15   // all other scans when one is hovered

// ─── Shared hover tracker (module-level, avoids React re-render overhead) ────
// Written by pointer handlers; read every frame by all ScanPlane useFrames.
let hoverRoomId: RoomId | null = null

// ─── Node layout ──────────────────────────────────────────────────────────────
// Positions: user-space [x, z_ground, y_stagger] → Three.js [x, y_stagger, z].
// Centers are within a 1.2 × 1.7 unit cluster; with 3×4 planes each extending
// ±1.5/±2.0 from centre, all five scans fully overlap — the transparent PNG
// edges layer into a single continuous architectural mass.
// yawRad: in-plane rotation for angular differentiation in the overlap zone.

interface NodeDef {
  pos:    [number, number, number]   // Three.js world XYZ
  yawRad: number
}

const NODES: Record<RoomId, NodeDef> = {
  'kitchen':     { pos: [-4.5, 0.02,  3.8], yawRad:  0.04 },  // Top Left
  'hallway':     { pos: [ 4.2, 0.01,  4.0], yawRad: -0.03 },  // Top Right
  'bathroom':    { pos: [ 0.0, 0.05,  0.3], yawRad:  0.01 },  // Center Bridge
  'bedroom':     { pos: [-3.8, 0.03, -3.6], yawRad: -0.05 },  // Bottom Left
  'living-room': { pos: [ 3.5, 0.04, -3.4], yawRad:  0.02 },  // Bottom Right
}

// ─── Room world positions (exported for camera plunge target) ─────────────────

export const ROOM_WORLD_POSITIONS: Record<RoomId, Vector3> = Object.fromEntries(
  ROOM_IDS.map((id) => [id, new Vector3(...NODES[id].pos)])
) as Record<RoomId, Vector3>

// ─── Scene background controller ──────────────────────────────────────────────

const BG_LIGHT = new Color('#fcfbf9')
const BG_DARK  = new Color('#080808')

function BackgroundController() {
  const { scene } = useThree()
  useEffect(() => {
    const prevBg  = scene.background
    const prevFog = scene.fog
    scene.background = BG_LIGHT
    scene.fog        = null
    return () => {
      scene.background = prevBg ?? BG_DARK
      scene.fog        = prevFog
    }
  }, [scene])
  return null
}

// ─── Single scan plane ────────────────────────────────────────────────────────
// Each plane:
//   - transparent + NormalBlending + depthWrite=false — transparent edges never
//     clip or mask the scans beneath them
//   - opacity driven entirely in useFrame (no React state on the animation path)
//   - hover: this scan → 1.0, others → 0.15 (emphasis through contrast)
//   - idle:  all scans → 0.35

function ScanPlane({
  roomId, texture, pos, yawRad,
}: {
  roomId:  RoomId
  texture: Texture
  pos:     [number, number, number]
  yawRad:  number
}) {
  const setView = useExperienceStore((s) => s.setView)
  const matRef  = useRef<MeshBasicMaterial>(null)

  useFrame((_, delta) => {
    if (!matRef.current) return

    // Decide this plane's target opacity from the shared hover state
    const target =
      hoverRoomId === null    ? OPACITY_IDLE
      : hoverRoomId === roomId ? OPACITY_FOCUS
      : OPACITY_DIM

    // Asymmetric damping: fast lift-in (λ=14), slower fade (λ=6)
    const λ = target > matRef.current.opacity ? 14 : 6
    matRef.current.opacity +=
      (target - matRef.current.opacity) * (1 - Math.exp(-λ * delta))
  })

  const onPointerOver = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    hoverRoomId                = roomId
    document.body.style.cursor = 'pointer'
  }, [roomId])

  const onPointerOut = useCallback(() => {
    hoverRoomId                = null
    document.body.style.cursor = ''
  }, [])

  const onClick = useCallback((e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    setView('room', roomId)
  }, [roomId, setView])

  return (
    <mesh
      position={pos}
      rotation={[-Math.PI / 2, yawRad, 0]}
      onPointerOver={onPointerOver}
      onPointerOut={onPointerOut}
      onClick={onClick}
    >
      <planeGeometry args={[PLANE_W, PLANE_H]} />
      <meshBasicMaterial
        ref={matRef}
        map={texture}
        transparent
        blending={NormalBlending}
        depthWrite={false}
        opacity={OPACITY_IDLE}
      />
    </mesh>
  )
}

// ─── Inner scene (useTexture must live inside the Canvas) ─────────────────────

function ScanLayout() {
  const textures = useTexture(SCAN_URLS) as Texture[]

  return (
    <>
      <BackgroundController />
      {ROOM_IDS.map((id, i) => (
        <ScanPlane
          key={id}
          roomId={id}
          texture={textures[i]}
          pos={NODES[id].pos}
          yawRad={NODES[id].yawRad}
        />
      ))}
    </>
  )
}

// ─── Public component ─────────────────────────────────────────────────────────

export function FloorplanView() {
  return <ScanLayout />
}
