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

const FP_POSITION = new Vector3(0, 20, 6)
const FP_LOOKAT   = new Vector3(0,  0, 0)
const FP_FOV      = 45

const ROOM_Y         = 1.7
const ROOM_Z_ENTRY   = 2.5
const LOOK_DIST      = 5
const ROOM_FOV       = 68
const DAMP_λ         = 3.5
const LOOK_DAMP_λ    = 7.0

// ─── Pre-allocated Color instances for lerpColor (no per-frame allocation) ───

const _ca = new Color()
const _cb = new Color()

/**
 * Interpolates two hex color strings.
 * At t=0 → baseline, at t=1 → spike.
 */
function lerpColor(baseHex: string, spikeHex: string, t: number): string {
  _ca.set(baseHex)
  _cb.set(spikeHex)
  _ca.lerp(_cb, t)
  return '#' + _ca.getHexString()
}

// ─── Atmosphere bridge ────────────────────────────────────────────────────────
// Writes liveConfig values as CSS custom properties on :root every frame so
// HTML overlay components (NavigationHUD, etc.) can read live atmosphere colors
// without subscribing to React state or triggering re-renders.

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
// Runs BEFORE RoomView in the scene graph (registered earlier → runs first in
// R3F's frame loop) so liveConfig is updated before SkyDome/Particles/Lights
// read it in their own useFrame callbacks.

function AtmosphereDecay() {
  const { scene }    = useThree()
  const currentView  = useExperienceStore((s) => s.currentView)
  const activeRoomId = useExperienceStore((s) => s.activeRoomId)
  const arenaData    = useArenaData()

  // Accumulated baseline — recomputed only when room or data changes (O(n) call)
  const baselineRef = useRef(liveConfig.current)
  useEffect(() => {
    if (!activeRoomId) return
    const allObs = arenaData.data[activeRoomId] ?? []
    baselineRef.current = computeBaselineVisualState(baseVisualConfig[activeRoomId], allObs)
  }, [activeRoomId, arenaData.data])

  useFrame(() => {
    if (currentView !== 'room' || !activeRoomId) return

    // Non-reactive reads for the hot path (avoid re-render subscription cost)
    const { spikeDelta, spikeColorTarget, spikeTimestamp } = useAtmosphereStore.getState()
    const b = baselineRef.current

    if (!spikeDelta) {
      // No active spike — mirror baseline into liveConfig
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

      // ── Quantitative spike (numeric fields only) ───────────────────────────
      liveConfig.current.fogDensity          = Math.min(1, b.fogDensity          + spikeDelta.fogDensity          * decayFactor)
      liveConfig.current.particleDensity     = Math.min(1, b.particleDensity     + spikeDelta.particleDensity     * decayFactor)
      liveConfig.current.particleMotionSpeed = Math.min(1, b.particleMotionSpeed + spikeDelta.particleMotionSpeed * decayFactor)
      liveConfig.current.textureNoiseLevel   = Math.min(1, b.textureNoiseLevel   + spikeDelta.textureNoiseLevel   * decayFactor)
      liveConfig.current.lightIntensity      = Math.min(3, b.lightIntensity      + spikeDelta.lightIntensity      * decayFactor)
      liveConfig.current.saturation          = Math.min(2, b.saturation          + spikeDelta.saturation          * decayFactor)
      liveConfig.current.hueShift            = b.hueShift   // not part of spike
      liveConfig.current.roomScale           = b.roomScale  // not part of spike

      // ── Semantic overrides (fog density + motion) ──────────────────────────
      if (spikeColorTarget?.fogDensity !== undefined)
        liveConfig.current.fogDensity = b.fogDensity + (spikeColorTarget.fogDensity - b.fogDensity) * decayFactor
      if (spikeColorTarget?.particleMotionSpeed !== undefined)
        liveConfig.current.particleMotionSpeed = b.particleMotionSpeed + (spikeColorTarget.particleMotionSpeed - b.particleMotionSpeed) * decayFactor

      // ── Semantic color interpolation ───────────────────────────────────────
      // Colors aren't in computeSpikeState; we drive them from semantic analysis.
      liveConfig.current.fogColor = spikeColorTarget?.fogColor
        ? lerpColor(b.fogColor, spikeColorTarget.fogColor, decayFactor)
        : b.fogColor
      liveConfig.current.lightColor = spikeColorTarget?.lightColor
        ? lerpColor(b.lightColor, spikeColorTarget.lightColor, decayFactor)
        : b.lightColor
      liveConfig.current.backgroundColor = spikeColorTarget?.backgroundColor
        ? lerpColor(b.backgroundColor, spikeColorTarget.backgroundColor, decayFactor)
        : b.backgroundColor

      // ── Clear fully-decayed spike to stop per-frame computation ───────────
      if (decayFactor < 0.01) {
        useAtmosphereStore.getState().setSpike(null, null)
      }
    }

    // Push fog changes directly to the Three.js scene (bypasses React props)
    if (scene.fog instanceof FogExp2) {
      scene.fog.color.set(liveConfig.current.fogColor)
      scene.fog.density = 0.004 + liveConfig.current.fogDensity * 0.072
    }
  })

  return null
}

// ─── Camera controller ────────────────────────────────────────────────────────

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
        resetLook()
      } else {
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
      const centre = ROOM_WORLD_POSITIONS[activeRoomId]
      roomTargetPos.current.set(centre.x, ROOM_Y, centre.z + ROOM_Z_ENTRY)
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

      {/*
        AtmosphereBridge writes liveConfig → CSS custom properties each frame
        so HTML overlays (NavigationHUD, etc.) can read live atmosphere colors.
        AtmosphereDecay runs BEFORE RoomView so liveConfig is up-to-date when
        SkyDome / Particles / Lights read it in their own useFrame callbacks.
      */}
      <AtmosphereBridge />
      <AtmosphereDecay />

      <Suspense fallback={null}>
        <FloorplanView />
      </Suspense>

      <RoomView />

      <EffectComposer>
        <Vignette offset={0.28} darkness={0.62} blendFunction={BlendFunction.NORMAL} />
        <ChromaticAberration offset={CA_OFFSET} radialModulation={false} modulationOffset={0.0} />
      </EffectComposer>
    </Canvas>
  )
}
