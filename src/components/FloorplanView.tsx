'use client'

import { useLoader, ThreeEvent }     from '@react-three/fiber'
import { SVGLoader }                  from 'three-stdlib'
import { useMemo, useRef, useCallback } from 'react'
import {
  ShapeGeometry,
  DoubleSide,
  Color,
  MeshStandardMaterial,
  Vector3,
  PlaneGeometry,
} from 'three'
import { ROOM_IDS, RoomId, useExperienceStore } from '../stores/useExperienceStore'
import { useAtmosphereStore }         from '../stores/useAtmosphereStore'
import { baseVisualConfig }           from '../config/rooms'

// ─── SVG coordinate system ────────────────────────────────────────────────────
//
// viewBox="0 0 811.59 566.95" — one compound <path> with two sub-paths:
//   1. M738.36,23.59 ... — main apartment outline
//   2. M761.14,141.53 ... Z — kitchen bay-window detail
//
// The group transform in FloorSVG converts SVG pixel space → 3D world space:
//   scale(SCALE)  →  rotate(-π/2 around X)  →  translate to centre
//
// After those three operations, a point (x_svg, y_svg) lands at:
//   world_x =  (x_svg − W/2) · SCALE
//   world_y =  0
//   world_z = −(y_svg − H/2) · SCALE
// which is exactly what svgToWorld() computes, so zone centres are consistent.

const SVG_W = 811.59
const SVG_H  = 566.95
const SCALE  = 1 / 55   // ≈ 14.76 × 10.31 world units total

function svgToWorld(svgX: number, svgY: number): [number, number, number] {
  return [
    (svgX - SVG_W / 2) * SCALE,
    0,
    -(svgY - SVG_H / 2) * SCALE,
  ]
}

// ─── Room zone definitions ────────────────────────────────────────────────────
// cx / cy  : room centre in SVG pixel space
// rw / rh  : PlaneGeometry half-extents in world units (hit area, not visual)

const ROOM_ZONES: Record<RoomId, { cx: number; cy: number; rw: number; rh: number }> = {
  'kitchen':     { cx: 680, cy: 115, rw: 2.0, rh: 1.8 },
  'hallway':     { cx: 400, cy: 220, rw: 1.8, rh: 1.4 },
  'bathroom':    { cx: 135, cy: 150, rw: 1.8, rh: 1.6 },
  'bedroom':     { cx: 210, cy: 460, rw: 2.8, rh: 2.0 },
  'living-room': { cx: 540, cy: 450, rw: 3.0, rh: 2.2 },
}

/** World-space centre for each room — consumed by CameraController on room entry. */
export const ROOM_WORLD_POSITIONS = ROOM_IDS.reduce<Record<RoomId, Vector3>>(
  (acc, id) => {
    const z = ROOM_ZONES[id]
    const [wx, , wz] = svgToWorld(z.cx, z.cy)
    acc[id] = new Vector3(wx, 0, wz)
    return acc
  },
  {} as Record<RoomId, Vector3>,
)

// ─── SVG floor outline ────────────────────────────────────────────────────────

function FloorSVG() {
  const svgData  = useLoader(SVGLoader, '/floorplan.svg')

  // Tint the floor with the currently active room's fog colour.
  // config only changes on room switch — no per-frame React re-renders.
  const fogColor = useAtmosphereStore((s) => s.config.fogColor)

  const geometries = useMemo<ShapeGeometry[]>(() => {
    const out: ShapeGeometry[] = []
    for (const path of svgData.paths) {
      // toShapes(true) enforces CCW winding; compound sub-paths that wind
      // clockwise inside a CCW parent are treated as holes automatically.
      const shapes = path.toShapes(true)
      for (const shape of shapes) {
        out.push(new ShapeGeometry(shape, 12))
      }
    }
    return out
  }, [svgData])

  // Three-step group transform — order: scale → rotate → translate.
  // After scale(SCALE):  local (x, y, 0) → (x·s, y·s, 0)
  // After rot(–π/2, X):  y component folds into –Z: (x·s, 0, –y·s)
  // After translate:     offset so SVG centre aligns with world origin.
  return (
    <group
      scale={[SCALE, SCALE, SCALE]}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[-(SVG_W / 2) * SCALE, 0.01, (SVG_H / 2) * SCALE]}
    >
      {geometries.map((geo, i) => (
        <mesh key={i} geometry={geo} receiveShadow>
          <meshBasicMaterial
            color={fogColor}
            transparent
            opacity={0.45}
            side={DoubleSide}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  )
}

// ─── Room hit zone ────────────────────────────────────────────────────────────
// A flat, invisible PlaneGeometry placed over each room area.
// Solely for pointer-event detection — no visual primitive geometry is rendered.
// On hover it fades in a subtle accent glow derived from the room's atmosphere.

function RoomHitZone({ roomId }: { roomId: RoomId }) {
  const setView = useExperienceStore((s) => s.setView)
  const zone    = ROOM_ZONES[roomId]
  const cfg     = baseVisualConfig[roomId]

  const [wx, , wz] = svgToWorld(zone.cx, zone.cy)

  // PlaneGeometry sits in the XY plane; -π/2 rotation around X lays it flat
  // so it faces upward and raycasts correctly from the top-down camera.
  const geo = useMemo(
    () => new PlaneGeometry(zone.rw * 2, zone.rh * 2),
    [zone.rw, zone.rh],
  )

  const matRef = useRef<MeshStandardMaterial>(null)

  const onPointerOver = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    if (matRef.current) {
      matRef.current.opacity           = 0.32
      matRef.current.emissiveIntensity = 0.60
    }
    document.body.style.cursor = 'pointer'
  }, [])

  const onPointerOut = useCallback(() => {
    if (matRef.current) {
      matRef.current.opacity           = 0.0
      matRef.current.emissiveIntensity = 0.0
    }
    document.body.style.cursor = ''
  }, [])

  const onClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation()
      setView('room', roomId)
    },
    [roomId, setView],
  )

  return (
    <mesh
      geometry={geo}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[wx, 0.02, wz]}
      onPointerOver={onPointerOver}
      onPointerOut={onPointerOut}
      onClick={onClick}
    >
      <meshStandardMaterial
        ref={matRef}
        color={new Color(cfg.backgroundColor)}
        emissive={new Color(cfg.lightColor)}
        emissiveIntensity={0.0}
        transparent
        opacity={0.0}
        side={DoubleSide}
        depthWrite={false}
      />
    </mesh>
  )
}

// ─── Public component ─────────────────────────────────────────────────────────

export function FloorplanView() {
  return (
    <group>
      <FloorSVG />
      {ROOM_IDS.map((id) => (
        <RoomHitZone key={id} roomId={id} />
      ))}
    </group>
  )
}
