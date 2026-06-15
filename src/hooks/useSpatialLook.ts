'use client'

import { useEffect } from 'react'
import { useExperienceStore } from '../stores/useExperienceStore'
import type { RoomId }        from '../stores/useExperienceStore'

// ─── Room loop definition ─────────────────────────────────────────────────────

/** Logical clockwise ordering of rooms. Panning right advances forward in this array. */
export const ROOM_LOOP: RoomId[] = [
  'living-room',
  'kitchen',
  'hallway',
  'bathroom',
  'bedroom',
]

// ─── Sensitivity & limits ─────────────────────────────────────────────────────

const DRAG_SENSITIVITY_X = 0.0028          // rad / screen-pixel
const DRAG_SENSITIVITY_Y = 0.0022          // rad / screen-pixel
const MAX_PITCH          = Math.PI / 4     // ± 45° vertical clamp
const YAW_THRESHOLD      = Math.PI * 2     // full revolution triggers next room

// ─── Module-level mutable singleton ──────────────────────────────────────────
// Written by pointer events, read every frame by CameraController.
// Using a plain object avoids React overhead on the hot-path.

export const lookRefs = {
  /** User's intended yaw (accumulated, not wrapped). */
  targetYaw:      0,
  /** User's intended pitch, clamped to ±MAX_PITCH. */
  targetPitch:    0,
  /** Smoothly-damped yaw — consumed by CameraController each frame. */
  liveYaw:        0,
  /** Smoothly-damped pitch — consumed by CameraController each frame. */
  livePitch:      0,
  /** Running horizontal total used to detect room-boundary transitions. */
  cumulativeYaw:  0,
  isDragging:     false,
  lastX:          0,
  lastY:          0,
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clamp(v: number, lo: number, hi: number) {
  return Math.min(Math.max(v, lo), hi)
}

/**
 * Resets the look state to forward-facing.
 * Called by CameraController when transitioning FROM floorplan INTO a room.
 */
export function resetLook() {
  lookRefs.targetYaw     = 0
  lookRefs.targetPitch   = 0
  lookRefs.liveYaw       = 0
  lookRefs.livePitch     = 0
  lookRefs.cumulativeYaw = 0
}

/** Advances the active room in the loop. direction: +1 = next, -1 = previous. */
function transitionRoom(direction: 1 | -1) {
  const { activeRoomId, setView, setActiveObservation } = useExperienceStore.getState()
  if (!activeRoomId) return
  const idx  = ROOM_LOOP.indexOf(activeRoomId)
  if (idx === -1) return
  // Clear any focused observation before changing room
  setActiveObservation(null)
  const next = ROOM_LOOP[((idx + direction) + ROOM_LOOP.length) % ROOM_LOOP.length]
  setView('room', next)
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Attaches global pointer-drag listeners for first-person look-around.
 * Only active when `currentView === 'room'`; reads store state via `getState()`
 * to avoid stale closures without subscribing.
 *
 * Drag is suppressed while an observation detail overlay is open.
 */
export function useSpatialLook() {
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (useExperienceStore.getState().currentView !== 'room') return
      if (useExperienceStore.getState().isPortalOpen) return
      lookRefs.isDragging = true
      lookRefs.lastX      = e.clientX
      lookRefs.lastY      = e.clientY
      ;(e.target as Element | null)?.setPointerCapture?.(e.pointerId)
    }

    function onPointerMove(e: PointerEvent) {
      if (!lookRefs.isDragging) return
      // Lock drag while the contribution portal is open
      if (useExperienceStore.getState().isPortalOpen) {
        lookRefs.isDragging = false
        return
      }
      // Lock drag while an observation detail is open
      if (useExperienceStore.getState().activeObservationId !== null) {
        lookRefs.isDragging = false
        return
      }
      if (useExperienceStore.getState().currentView !== 'room') {
        lookRefs.isDragging = false
        return
      }

      const dx = e.clientX - lookRefs.lastX
      const dy = e.clientY - lookRefs.lastY
      lookRefs.lastX = e.clientX
      lookRefs.lastY = e.clientY

      lookRefs.targetYaw   += dx * DRAG_SENSITIVITY_X
      lookRefs.targetPitch  = clamp(
        lookRefs.targetPitch - dy * DRAG_SENSITIVITY_Y,
        -MAX_PITCH,
        MAX_PITCH,
      )
      lookRefs.cumulativeYaw += dx * DRAG_SENSITIVITY_X

      // ── Boundary loop transition ─────────────────────────────────────────────
      if (lookRefs.cumulativeYaw > YAW_THRESHOLD) {
        lookRefs.cumulativeYaw -= YAW_THRESHOLD
        transitionRoom(1)
      } else if (lookRefs.cumulativeYaw < -YAW_THRESHOLD) {
        lookRefs.cumulativeYaw += YAW_THRESHOLD
        transitionRoom(-1)
      }
    }

    function onPointerUp() {
      lookRefs.isDragging = false
    }

    window.addEventListener('pointerdown',   onPointerDown,  { passive: true })
    window.addEventListener('pointermove',   onPointerMove,  { passive: true })
    window.addEventListener('pointerup',     onPointerUp,    { passive: true })
    window.addEventListener('pointercancel', onPointerUp,    { passive: true })

    return () => {
      window.removeEventListener('pointerdown',   onPointerDown)
      window.removeEventListener('pointermove',   onPointerMove)
      window.removeEventListener('pointerup',     onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)
    }
  }, [])
}
