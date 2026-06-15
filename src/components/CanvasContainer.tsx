'use client'

import { Suspense, useRef, useEffect } from 'react'
import { Canvas, useThree, useFrame }  from '@react-three/fiber'
import { EffectComposer, Vignette, ChromaticAberration } from '@react-three/postprocessing'
import { BlendFunction }               from 'postprocessing'
import { PerspectiveCamera, Vector2, Vector3, FogExp2, Color } from 'three'
import { damp3 }                       from 'maath/easing'
import { useExperienceStore }          from '../stores/useExperienceStore'
import { useAtmosphereStore, liveConfig } from '../stores/useAtmosphereStore'
import { FloorplanView, ROOM_WORLD_POSITIONS } from './FloorplanView'
import { RoomView }                    from './RoomView'
import { lookRefs, resetLook, useSpatialLook } from '../hooks/useSpatialLook'
import { baseVisualConfig }            from '../config/rooms'
import { computeBaselineVisualState }  from '../logic/visualMapping'
import { useArenaData }                from '../hooks/useArenaData'

// ─── Camera constants ─────────────────────────────────────────────────────────

const FP_POSITION  = new Vector3(0, 20, 6)
const FP_LOOKAT    = new Vector3(0,  0, 0)
const FP_FOV       = 45

// Submerged position: camera drops below the floorplan plane (Y=0) for room mode.
// No Z offset — the plunge lands directly beneath the room's world centre.
const SUBMERGE_Y   = -3.0          // units below the floorplan
const PLUNGE_PITCH = -Math.PI / 6  // ~30° downward look-angle on room entry

const LOOK_DIST    = 5
const ROOM_FOV     = 68
const DAMP_λ       = 3.5
const LOOK_DAMP_λ  = 7.0

// ─── Pre-allocated Color instances for lerpColor (no per-frame allocation) ───

const _ca = new Color()
const _cb = new Color()

function lerpColor(baseHex: string, spikeHex: string, t: number): string {
  _ca.set(baseHex)
  _cb.set(spikeHex)
  _ca.lerp(_cb, t)
  return '#' + _ca.getHexString()
}

// ─── Atmosphere bridge ────────────────────────────────────────────────────────

function AtmosphereBridge() {
  useFrame(() => {
    const el = document.documentElement
    el.style.setProperty('--live-light-color', liveConfig.current.lightColor)
    el.style.setProperty('--live-fog-color',   liveConfig.current.fogColor)
    el.style.setProperty('--live-bg-color',    liveConfig.current.backgroundColor)
  })
  return null
}

// ─── Atmosphere decay ─────────────────────────────────────────────────────────

function AtmosphereDecay() {
  const { scene }    = useThree()
  const currentView  = useExperienceStore((s) => s.currentView)
  const activeRoomId = useExperienceStore((s) => s.activeRoomId)
  const arenaData    = useArenaData()

  const baselineRef = useRef(liveConfig.current)
  useEffect(() => {
    if (!activeRoomId) return
    const allObs = arenaData.data[activeRoomId] ?? []
    baselineRef.current = computeBaselineVisualState(baseVisualConfig[activeRoomId], allObs)
  }, [activeRoomId, arenaData.data])

  useFrame(() => {
    if (currentView !== 'room' || !activeRoomId) return

    const { spikeDelta, spikeColorTarget, spikeTimestamp } = useAtmosphereStore.getState()
    const b = baselineRef.current

    if (!spikeDelta) {
      liveConfig.current.fogDensity          = b.fogDensity
      liveConfig.current.particleDensity     = b.particleDensity
      liveConfig.current.particleMotionSpeed = b.particleMotionSpeed
      liveConfig.current.textureNoiseLevel   = b.textureNoiseLevel
      liveConfig.current.hueShift            = b.hueShift
      liveConfig.current.saturation          = b.saturation
      liveConfig.current.lightIntensity      = b.lightIntensity
      liveConfig.current.fogColor            = b.fogColor
      liveConfig.current.lightColor          = b.lightColor
      liveConfig.current.backgroundColor     = b.backgroundColor
      liveConfig.current.roomScale           = b.roomScale
    } else {
      const timeSec     = (performance.now() - spikeTimestamp) / 1000
      const decayFactor = Math.exp(-(Math.LN2 / 8) * timeSec)

      liveConfig.current.fogDensity          = Math.min(1, b.fogDensity          + spikeDelta.fogDensity          * decayFactor)
      liveConfig.current.particleDensity     = Math.min(1, b.particleDensity     + spikeDelta.particleDensity     * decayFactor)
      liveConfig.current.particleMotionSpeed = Math.min(1, b.particleMotionSpeed + spikeDelta.particleMotionSpeed * decayFactor)
      liveConfig.current.textureNoiseLevel   = Math.min(1, b.textureNoiseLevel   + spikeDelta.textureNoiseLevel   * decayFactor)
      liveConfig.current.lightIntensity      = Math.min(3, b.lightIntensity      + spikeDelta.lightIntensity      * decayFactor)
      liveConfig.current.saturation          = Math.min(2, b.saturation          + spikeDelta.saturation          * decayFactor)
      liveConfig.current.hueShift            = b.hueShift
      liveConfig.current.roomScale           = b.roomScale

      if (spikeColorTarget?.fogDensity !== undefined)
        liveConfig.current.fogDensity = b.fogDensity + (spikeColorTarget.fogDensity - b.fogDensity) * decayFactor
      if (spikeColorTarget?.particleMotionSpeed !== undefined)
        liveConfig.current.particleMotionSpeed = b.particleMotionSpeed + (spikeColorTarget.particleMotionSpeed - b.particleMotionSpeed) * decayFactor

      liveConfig.current.fogColor = spikeColorTarget?.fogColor
        ? lerpColor(b.fogColor, spikeColorTarget.fogColor, decayFactor)
        : b.fogColor
      liveConfig.current.lightColor = spikeColorTarget?.lightColor
        ? lerpColor(b.lightColor, spikeColorTarget.lightColor, decayFactor)
        : b.lightColor
      liveConfig.current.backgroundColor = spikeColorTarget?.backgroundColor
        ? lerpColor(b.backgroundColor, spikeColorTarget.backgroundColor, decayFactor)
        : b.backgroundColor

      if (decayFactor < 0.01) {
        useAtmosphereStore.getState().setSpike(null, null)
      }
    }

    if (scene.fog instanceof FogExp2) {
      scene.fog.color.set(liveConfig.current.fogColor)
      scene.fog.density = 0.004 + liveConfig.current.fogDensity * 0.072
    }
  })

  return null
}

// ─── Camera controller ────────────────────────────────────────────────────────
// Floorplan → room: camera plunges from Y=20 straight down through the
// floorplan plane (Y=0) to SUBMERGE_Y below. X/Z converge on the room's world
// centre with no forward Z offset. The sphere enclosure follows camera.position
// each frame (see SpaceEnclosure in RoomView), so the room medium is always
// centred on the viewer — no floor plane visible from below.

function CameraController() {
  const { camera } = useThree()

  const currentView  = useExperienceStore((s) => s.currentView)
  const activeRoomId = useExperienceStore((s) => s.activeRoomId)

  const liveAt        = useRef(FP_LOOKAT.clone())
  const roomTargetPos = useRef(new Vector3())
  const prevView      = useRef<'floorplan' | 'room'>(currentView)
  const targetFov     = useRef(FP_FOV)

  useEffect(() => {
    camera.position.copy(FP_POSITION)
    liveAt.current.copy(FP_LOOKAT)
    camera.lookAt(liveAt.current)
    if (camera instanceof PerspectiveCamera) {
      camera.fov = FP_FOV
      camera.updateProjectionMatrix()
    }
  }, [camera])

  useFrame(({ camera: cam }, delta) => {
    const decay = 1 - Math.exp(-DAMP_λ * delta)

    const viewChanged = prevView.current !== currentView
    if (viewChanged) {
      if (currentView === 'room') {
        // Enter plunge: reset look state and start with a downward pitch so the
        // camera appears to look along the dive axis as it drops through the floor.
        resetLook()
        lookRefs.targetPitch = PLUNGE_PITCH
        lookRefs.livePitch   = PLUNGE_PITCH
      } else {
        // Return to floorplan: smooth liveAt transition from current camera state
        const y = lookRefs.liveYaw
        const p = lookRefs.livePitch
        liveAt.current.set(
          cam.position.x + Math.sin(y) * Math.cos(p) * LOOK_DIST,
          cam.position.y + Math.sin(p) * LOOK_DIST,
          cam.position.z - Math.cos(y) * Math.cos(p) * LOOK_DIST,
        )
      }
      prevView.current = currentView
    }

    if (currentView === 'floorplan') {
      damp3(cam.position, FP_POSITION, DAMP_λ, delta)
      damp3(liveAt.current, FP_LOOKAT, DAMP_λ, delta)
      cam.lookAt(liveAt.current)
      targetFov.current = FP_FOV

    } else if (activeRoomId != null) {
      // Plunge target: directly below the room's world centre, submerged.
      // No Z entry offset — the motion is purely vertical (plus X/Z convergence).
      const centre = ROOM_WORLD_POSITIONS[activeRoomId]
      roomTargetPos.current.set(centre.x, SUBMERGE_Y, centre.z)
      damp3(cam.position, roomTargetPos.current, DAMP_λ, delta)

      const lookDecay     = 1 - Math.exp(-LOOK_DAMP_λ * delta)
      lookRefs.liveYaw   += (lookRefs.targetYaw   - lookRefs.liveYaw)   * lookDecay
      lookRefs.livePitch += (lookRefs.targetPitch - lookRefs.livePitch) * lookDecay

      const yaw   = lookRefs.liveYaw
      const pitch = lookRefs.livePitch
      cam.lookAt(
        cam.position.x + Math.sin(yaw)  * Math.cos(pitch) * LOOK_DIST,
        cam.position.y + Math.sin(pitch)                   * LOOK_DIST,
        cam.position.z - Math.cos(yaw)  * Math.cos(pitch) * LOOK_DIST,
      )

      targetFov.current = ROOM_FOV
    }

    if (cam instanceof PerspectiveCamera) {
      const prev = cam.fov
      cam.fov += (targetFov.current - cam.fov) * decay
      if (Math.abs(cam.fov - prev) > 0.001) cam.updateProjectionMatrix()
    }
  })

  return null
}

// ─── Floorplan lights ─────────────────────────────────────────────────────────

function FloorplanLights() {
  return (
    <>
      <ambientLight intensity={0.35} />
      <directionalLight position={[5, 14, 6]} intensity={1.1} castShadow shadow-mapSize={[2048, 2048]} />
      <pointLight position={[-6, 8, -4]} intensity={0.55} color="#aaccff" />
    </>
  )
}

// ─── Allocated outside render ─────────────────────────────────────────────────

const CA_OFFSET = new Vector2(0.0004, 0.0004)

// ─── Canvas container ─────────────────────────────────────────────────────────

export function CanvasContainer() {
  useSpatialLook()

  // Subscribe here so that conditional FloorplanView render is driven by React
  // state, which triggers immediately when setView() is called.
  const currentView = useExperienceStore((s) => s.currentView)

  return (
    <Canvas
      style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', zIndex: 0 }}
      gl={{ antialias: true, alpha: false, stencil: false, powerPreference: 'high-performance' }}
      dpr={[1, 2]}
      camera={{ fov: FP_FOV, near: 0.1, far: 120 }}
      shadows
    >
      <color attach="background" args={['#080808']} />

      <FloorplanLights />
      <CameraController />

      <AtmosphereBridge />
      <AtmosphereDecay />

      {/*
        FloorplanView mounts only in floorplan mode. Unmounting it immediately
        when a room is entered (a) hides the floor geometry before the camera
        crosses it and (b) triggers BackgroundController's cleanup, which
        restores the dark canvas background for the room medium.
        useLoader caches the SVG globally, so remounting on return is instant.
      */}
      {currentView === 'floorplan' && (
        <Suspense fallback={null}>
          <FloorplanView />
        </Suspense>
      )}

      <RoomView />

      <EffectComposer>
        <Vignette offset={0.28} darkness={0.62} blendFunction={BlendFunction.NORMAL} />
        <ChromaticAberration offset={CA_OFFSET} radialModulation={false} modulationOffset={0.0} />
      </EffectComposer>
    </Canvas>
  )
}
