'use client'

import { useLoader, useFrame, useThree, ThreeEvent, extend } from '@react-three/fiber'
import { SVGLoader }   from 'three-stdlib'
import { Text, shaderMaterial } from '@react-three/drei'
import { useMemo, useRef, useCallback, useEffect } from 'react'
import {
  ShapeGeometry,
  DoubleSide,
  Color,
  Vector3,
  Shape,
  Group,
  BufferGeometry,
  Float32BufferAttribute,
  Line        as ThreeLine,
  LineBasicMaterial,
  ShaderMaterial,
} from 'three'
import { ROOM_IDS, RoomId, useExperienceStore } from '../stores/useExperienceStore'
import { baseVisualConfig } from '../config/rooms'

// ─── SVG coordinate system ────────────────────────────────────────────────────

const SVG_W = 811.59
const SVG_H  = 566.95
const SCALE  = 1 / 55   // → ~14.76 × 10.31 world units

function svgToWorld(svgX: number, svgY: number): [number, number, number] {
  return [
    (svgX - SVG_W / 2) * SCALE,
    0,
    -(svgY - SVG_H / 2) * SCALE,
  ]
}

// ─── Room definitions ─────────────────────────────────────────────────────────

const ROOM_ZONES: Record<RoomId, { cx: number; cy: number; rw: number; rh: number }> = {
  'kitchen':     { cx: 680, cy: 115, rw: 2.2, rh: 2.0 },
  'hallway':     { cx: 400, cy: 220, rw: 2.0, rh: 1.6 },
  'bathroom':    { cx: 135, cy: 150, rw: 2.0, rh: 1.8 },
  'bedroom':     { cx: 210, cy: 460, rw: 3.0, rh: 2.2 },
  'living-room': { cx: 540, cy: 450, rw: 3.2, rh: 2.4 },
}

export const ROOM_WORLD_POSITIONS = ROOM_IDS.reduce<Record<RoomId, Vector3>>(
  (acc, id) => {
    const z = ROOM_ZONES[id]
    const [wx, , wz] = svgToWorld(z.cx, z.cy)
    acc[id] = new Vector3(wx, 0, wz)
    return acc
  },
  {} as Record<RoomId, Vector3>,
)

// ─── Evocative text fragments (one per room, always available) ────────────────

const ROOM_FRAGMENTS: Record<RoomId, string> = {
  'kitchen':     'the smell of burnt coffee at 6am\nwhen the house is still yours alone',
  'hallway':     'seventeen coats\nand none of them warm enough',
  'bathroom':    'condensation as a private language\nfinger-written and forgotten',
  'bedroom':     'the particular quality of light\nthrough curtains not yet opened',
  'living-room': 'a television that watches back\nin the dark',
}

// ─── Liquid glass shader ──────────────────────────────────────────────────────
// Uniform accessors (uTime, uHover, uAccent) are surfaced as direct properties
// by shaderMaterial's getter/setter wrappers — no .uniforms.x.value needed.

const GLASS_VERT = /* glsl */`
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const GLASS_FRAG = /* glsl */`
  uniform float uTime;
  uniform float uHover;
  uniform vec3  uAccent;
  varying vec2  vUv;

  void main() {
    float t   = uTime * 0.28;
    vec2  uv  = vUv;

    // ── Slow heavy liquid ripple (three overlapping sin waves) ────────────────
    float r0     = sin(uv.x * 4.2 + t)          * sin(uv.y * 3.1 + t * 0.70) * 0.020;
    float r1     = sin((uv.x + uv.y) * 5.5 + t * 1.10)                        * 0.013;
    float r2     = sin(uv.x * 2.1 - uv.y * 3.4 + t * 0.45)                    * 0.011;
    float ripple = (r0 + r1 + r2) * (1.0 + uHover * 2.4);

    // ── Edge factor ───────────────────────────────────────────────────────────
    vec2  ev   = abs(uv - 0.5) * 2.0;
    float edge = pow(max(ev.x, ev.y), 1.8);

    // ── Prismatic colour: warm/cool split that shifts with the ripple ─────────
    vec3 warm  = vec3(1.000, 0.950, 0.900);  // cream-pink
    vec3 cool  = vec3(0.880, 0.930, 1.000);  // ice-blue
    vec3 base  = vec3(0.960, 0.965, 0.970);  // near-white gallery neutral
    vec3 prism = mix(warm, cool, fract(uv.x * 0.5 + uv.y * 0.3 + ripple * 4.0));
    vec3 color = mix(base,
                     mix(prism, uAccent, 0.10),
                     edge * 0.55 + abs(ripple) * 5.0);

    // ── Caustic specular (fake internal scatter) ──────────────────────────────
    float spec = pow(
        max(0.0, sin(uv.x * 9.0 + t * 0.90 + ripple * 6.0))
      * max(0.0, cos(uv.y * 7.5 + t * 0.60)),
      8.0
    ) * 0.14;
    color += vec3(spec) * (1.0 + uHover * 0.50);

    // ── Alpha: translucent glass, thicker at edges and on hover ──────────────
    float alpha = 0.10
                + edge          * 0.28
                + uHover        * 0.14
                + abs(ripple)   * 4.0
                + spec          * 0.7;
    alpha = clamp(alpha, 0.0, 0.92);

    gl_FragColor = vec4(color, alpha);
  }
`

const GlassMaterial = shaderMaterial(
  { uTime: 0.0, uHover: 0.0, uAccent: new Color(1, 1, 1) },
  GLASS_VERT,
  GLASS_FRAG,
)

// Register so R3F recognises the class (used for instanceof checks internally).
extend({ GlassMaterial })

type GlassMat = ShaderMaterial & { uTime: number; uHover: number; uAccent: Color }

// ─── Scene background controller ──────────────────────────────────────────────
// Overrides the canvas dark-clear and clears room fog while FloorplanView is
// mounted. Restores both on unmount (i.e. when entering a room).

const BG_LIGHT = new Color('#eeecea')
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

// ─── SVG hairline outline ─────────────────────────────────────────────────────
// Extracts the raw point sequences from every sub-path of every SVGLoader path
// and renders each as a Three.Line with LineBasicMaterial — a 1 px hairline.
// Rendered via <primitive> to avoid JSX-vs-HTML `<line>` type conflicts.

function FloorOutlineLines() {
  const svgData = useLoader(SVGLoader, '/floorplan.svg')

  const lineObjects = useMemo(() => {
    const mat = new LineBasicMaterial({
      color:       '#2c2c2c',
      transparent: true,
      opacity:     0.62,
    })
    const objects: ThreeLine[] = []
    for (const path of svgData.paths) {
      for (const subPath of path.subPaths) {
        const pts = subPath.getPoints(28)
        if (pts.length < 2) continue
        const positions = new Float32Array(pts.length * 3)
        for (let i = 0; i < pts.length; i++) {
          positions[i * 3]     = pts[i].x
          positions[i * 3 + 1] = pts[i].y
          positions[i * 3 + 2] = 0
        }
        const geo = new BufferGeometry()
        geo.setAttribute('position', new Float32BufferAttribute(positions, 3))
        objects.push(new ThreeLine(geo, mat))
      }
    }
    return objects
  }, [svgData])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      lineObjects.forEach((l) => { l.geometry.dispose() })
    }
  }, [lineObjects])

  // Group transform: SVG pixel space → centred 3D world XZ plane
  // (scale → rotate –π/2 around X → translate to centre)
  return (
    <group
      scale={[SCALE, SCALE, SCALE]}
      rotation={[-Math.PI / 2, 0, 0]}
      position={[-(SVG_W / 2) * SCALE, 0.005, (SVG_H / 2) * SCALE]}
    >
      {lineObjects.map((obj, i) => (
        <primitive key={i} object={obj} />
      ))}
    </group>
  )
}

// ─── Rounded-rect shape builder (used for per-room glass panes) ──────────────

function makeRectShape(rw: number, rh: number): Shape {
  const s = new Shape()
  const r = Math.min(rw, rh) * 0.06
  s.moveTo(-rw + r,  -rh)
  s.lineTo( rw - r,  -rh)
  s.quadraticCurveTo( rw, -rh,  rw, -rh + r)
  s.lineTo( rw,  rh - r)
  s.quadraticCurveTo( rw,  rh,  rw - r,  rh)
  s.lineTo(-rw + r,  rh)
  s.quadraticCurveTo(-rw,  rh, -rw,  rh - r)
  s.lineTo(-rw, -rh + r)
  s.quadraticCurveTo(-rw, -rh, -rw + r, -rh)
  return s
}

// ─── Room glass pane ──────────────────────────────────────────────────────────
// One per room. The liquid glass shader mesh IS the interactive surface —
// no separate bounding box or hit zone. Hover/click are wired to the shape mesh.
// Sub-surface text sits at Y = –0.3, wobbling slightly to simulate refraction.

function RoomGlassPane({ roomId }: { roomId: RoomId }) {
  const setView = useExperienceStore((s) => s.setView)
  const zone    = ROOM_ZONES[roomId]
  const cfg     = baseVisualConfig[roomId]

  const [wx, , wz] = svgToWorld(zone.cx, zone.cy)

  const geo      = useMemo(() => new ShapeGeometry(makeRectShape(zone.rw, zone.rh), 8), [zone.rw, zone.rh])
  const accent   = useMemo(() => new Color(cfg.lightColor), [cfg.lightColor])
  const material = useMemo(() => {
    const m = new GlassMaterial() as unknown as GlassMat
    m.uAccent       = accent.clone()
    m.transparent   = true
    m.depthWrite    = false
    m.side          = DoubleSide
    return m
  }, [accent])

  const textGroupRef = useRef<Group>(null)
  const hoverTarget  = useRef(0)

  useEffect(() => () => { geo.dispose(); material.dispose() }, [geo, material])

  const roomLabel = roomId.replace(/-/g, ' ').toUpperCase()

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime()

    // Drive shader uniforms — no React re-renders
    material.uTime   = t
    material.uHover += (hoverTarget.current - material.uHover) * 0.08

    // Subtle text wobble — simulates refraction through the rippling glass above
    if (textGroupRef.current) {
      textGroupRef.current.position.x = wx + Math.sin(t * 0.38 + zone.cx * 0.011) * 0.05
      textGroupRef.current.position.z = wz + Math.cos(t * 0.29 + zone.cy * 0.009) * 0.04
    }
  })

  const onPointerOver = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    hoverTarget.current = 1
    document.body.style.cursor = 'pointer'
  }, [])

  const onPointerOut = useCallback(() => {
    hoverTarget.current = 0
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
    <>
      {/* Liquid glass surface — renders at Y = 0, is the click/hover target */}
      <mesh
        geometry={geo}
        material={material}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[wx, 0, wz]}
        renderOrder={1}
        onPointerOver={onPointerOver}
        onPointerOut={onPointerOut}
        onClick={onClick}
      />

      {/*
        Sub-surface text at Y = –0.3.
        The group's XZ position is animated in useFrame to wobble,
        simulating refraction distortion through the glass above.
        renderOrder={0} ensures text is drawn before the glass (which
        is transparent), so it shows through correctly.
      */}
      <group ref={textGroupRef} position={[wx, -0.3, wz]}>
        <Text
          rotation={[-Math.PI / 2, 0, 0]}
          fontSize={0.14}
          color="#1c1c1c"
          maxWidth={zone.rw * 1.7}
          textAlign="center"
          anchorX="center"
          anchorY="middle"
          renderOrder={0}
          material-depthTest={false}
          material-transparent={true}
          material-opacity={0.55}
        >
          {roomLabel}
        </Text>
        <Text
          position={[0, 0, 0.35]}
          rotation={[-Math.PI / 2, 0, 0]}
          fontSize={0.095}
          color="#3a3a3a"
          maxWidth={zone.rw * 1.6}
          textAlign="center"
          anchorX="center"
          anchorY="middle"
          renderOrder={0}
          material-depthTest={false}
          material-transparent={true}
          material-opacity={0.38}
        >
          {ROOM_FRAGMENTS[roomId]}
        </Text>
      </group>
    </>
  )
}

// ─── Public component ─────────────────────────────────────────────────────────

export function FloorplanView() {
  return (
    <group>
      <BackgroundController />
      <FloorOutlineLines />
      {ROOM_IDS.map((id) => (
        <RoomGlassPane key={id} roomId={id} />
      ))}
    </group>
  )
}
