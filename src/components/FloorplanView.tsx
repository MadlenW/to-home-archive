'use client'

import { useLoader, ThreeEvent } from '@react-three/fiber'
import { SVGLoader } from 'three-stdlib'
import { useMemo, useRef, useCallback } from 'react'
import {
  ShapeGeometry,
  DoubleSide,
  Color,
  Shape,
  Vector3,
  Mesh,
  MeshStandardMaterial,
} from 'three'
import { ROOM_IDS, RoomId, useExperienceStore } from '../stores/useExperienceStore'
import { baseVisualConfig } from '../config/rooms'

// ─── SVG coordinate system ────────────────────────────────────────────────────
// The floorplan SVG has a single compound path (no per-room IDs).
// We parse it for the visual floor outline, then overlay 5 named interactive
// zone meshes at positions inferred from the path geometry.

const SVG_W = 811.59
const SVG_H = 566.95
const SCALE = 1 / 55  // SVG units → 3D world units  (~14.8 × 10.3 world units)

/**
 * Maps SVG pixel coordinates to centred 3D world-space [X, 0, Z].
 * SVG origin is top-left; Y flips to become –Z so north in the SVG
 * corresponds to +Z in the scene (away from the default camera).
 */
function svgToWorld(svgX: number, svgY: number): [number, number, number] {
  return [
    (svgX - SVG_W / 2) * SCALE,
    0,
    -(svgY - SVG_H / 2) * SCALE,
  ]
}

// ─── Room zone definitions ────────────────────────────────────────────────────
// cx / cy  : zone centre in SVG pixel space
// rx / rz  : half-extents in 3D world units (shape is centred on world position)

const ROOM_ZONES: Record<RoomId, { cx: number; cy: number; rx: number; rz: number }> = {
  'kitchen':      { cx: 680, cy: 115, rx: 1.80, rz: 1.55 },
  'hallway':      { cx: 400, cy: 220, rx: 1.50, rz: 1.25 },
  'bathroom':     { cx: 135, cy: 150, rx: 1.50, rz: 1.45 },
  'bedroom':      { cx: 210, cy: 460, rx: 2.50, rz: 1.70 },
  'living-room':  { cx: 540, cy: 450, rx: 2.65, rz: 1.85 },
}

/** World-space centre Vector3 for each room — consumed by the camera controller. */
export const ROOM_WORLD_POSITIONS = ROOM_IDS.reduce<Record<RoomId, Vector3>>(
  (acc, id) => {
    const z = ROOM_ZONES[id]
    const [wx, , wz] = svgToWorld(z.cx, z.cy)
    acc[id] = new Vector3(wx, 0, wz)
    return acc
  },
  {} as Record<RoomId, Vector3>,
)

// ─── Shape builder ────────────────────────────────────────────────────────────

function makeRoundedRect(rx: number, rz: number): Shape {
  const s = new Shape()
  const r = Math.min(rx, rz) * 0.12
  s.moveTo(-rx + r, -rz)
  s.lineTo( rx - r, -rz)
  s.quadraticCurveTo( rx, -rz,  rx, -rz + r)
  s.lineTo( rx,  rz - r)
  s.quadraticCurveTo( rx,  rz,  rx - r,  rz)
  s.lineTo(-rx + r,  rz)
  s.quadraticCurveTo(-rx,  rz, -rx,  rz - r)
  s.lineTo(-rx, -rz + r)
  s.quadraticCurveTo(-rx, -rz, -rx + r, -rz)
  return s
}

// ─── Room zone mesh ───────────────────────────────────────────────────────────

function RoomZoneMesh({ roomId }: { roomId: RoomId }) {
  const setView = useExperienceStore((s) => s.setView)
  const config  = baseVisualConfig[roomId]
  const zone    = ROOM_ZONES[roomId]

  const [wx, , wz] = svgToWorld(zone.cx, zone.cy)

  const geo = useMemo(
    () => new ShapeGeometry(makeRoundedRect(zone.rx, zone.rz), 4),
    [zone.rx, zone.rz],
  )

  const matRef = useRef<MeshStandardMaterial>(null)

  const onPointerOver = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    if (!matRef.current) return
    matRef.current.opacity           = 0.52
    matRef.current.emissiveIntensity = 0.72
  }, [])

  const onPointerOut = useCallback(() => {
    if (!matRef.current) return
    matRef.current.opacity           = 0.20
    matRef.current.emissiveIntensity = 0.18
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
      // ShapeGeometry lies in the local XY plane; rotating –π/2 around X
      // lays it flat: local X → world X, local Y → world –Z.
      rotation={[-Math.PI / 2, 0, 0]}
      position={[wx, 0.015, wz]}
      onPointerOver={onPointerOver}
      onPointerOut={onPointerOut}
      onClick={onClick}
    >
      <meshStandardMaterial
        ref={matRef}
        color={new Color(config.backgroundColor)}
        emissive={new Color(config.lightColor)}
        emissiveIntensity={0.18}
        transparent
        opacity={0.20}
        side={DoubleSide}
        depthWrite={false}
      />
    </mesh>
  )
}

// ─── SVG floor outline ────────────────────────────────────────────────────────

function FloorOutline() {
  const svgData = useLoader(SVGLoader, '/floorplan.svg')

  const geometries = useMemo(() => {
    const result: ShapeGeometry[] = []
    for (const path of svgData.paths) {
      for (const shape of SVGLoader.createShapes(path)) {
        result.push(new ShapeGeometry(shape, 12))
      }
    }
    return result
  }, [svgData])

  // The group transforms SVG pixel coordinates to centred world-space:
  //   1. scale  : SVG px → world units
  //   2. rotate : lay the XY shape flat into the XZ plane (–π/2 around X)
  //   3. translate: centre the result at the scene origin
  //
  // After scale + rotation, a point (svgX, svgY) lands at
  //   world (svgX·s, 0, –svgY·s) — offset by (–W/2·s, 0, +H/2·s) to centre.
  return (
    <group
      scale={[SCALE, SCALE, SCALE]}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[-(SVG_W / 2) * SCALE, 0, (SVG_H / 2) * SCALE]}
    >
      {geometries.map((geo, i) => (
        <mesh key={i} geometry={geo} receiveShadow>
          <meshStandardMaterial
            color="#1a1a1a"
            transparent
            opacity={0.70}
            side={DoubleSide}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  )
}

// ─── Public component ─────────────────────────────────────────────────────────

export function FloorplanView() {
  return (
    <group>
      <FloorOutline />
      {ROOM_IDS.map((id) => (
        <RoomZoneMesh key={id} roomId={id} />
      ))}
    </group>
  )
}
