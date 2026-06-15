'use client'

import { create } from 'zustand'
import { RoomVisualState, baseVisualConfig } from '../config/rooms'
import { computeSpikeState, SpikeState }     from '../logic/visualMapping'
import type { RoomId }                        from './useExperienceStore'

// ─── Live config singleton ────────────────────────────────────────────────────
// Written every frame by AtmosphereDecay (CanvasContainer).
// Read every frame by SkyDome, AtmosphereParticles, RoomLights (RoomView).
// Plain mutable object — zero React overhead on the hot render path.

export const liveConfig: { current: RoomVisualState } = {
  current: {
    ...baseVisualConfig['living-room'],
    roomScale: [...baseVisualConfig['living-room'].roomScale] as [number, number, number],
  },
}

// ─── Semantic color / motion overrides ───────────────────────────────────────

export interface SpikeColorTarget {
  fogColor?:            string
  lightColor?:          string
  backgroundColor?:     string
  fogDensity?:          number
  particleMotionSpeed?: number
}

// ─── Store ────────────────────────────────────────────────────────────────────

interface AtmosphereState {
  /** Current stable config — used as React state for room switches. */
  config:           RoomVisualState
  /** Pre-computed numeric delta from computeSpikeState. */
  spikeDelta:       SpikeState | null
  /** Semantic color/motion overrides derived from user's text content. */
  spikeColorTarget: SpikeColorTarget | null
  /** performance.now() timestamp at the moment the spike was fired. */
  spikeTimestamp:   number

  setFromRoom: (roomId: RoomId) => void
  setSpike:    (raw: object | null, colors: SpikeColorTarget | null) => void
}

export const useAtmosphereStore = create<AtmosphereState>()((set) => ({
  config:           baseVisualConfig['living-room'],
  spikeDelta:       null,
  spikeColorTarget: null,
  spikeTimestamp:   0,

  setFromRoom: (roomId) => {
    const cfg = baseVisualConfig[roomId]
    // Sync liveConfig immediately so there is no one-frame flicker on room entry
    liveConfig.current = {
      ...cfg,
      roomScale: [...cfg.roomScale] as [number, number, number],
    }
    set({ config: cfg, spikeDelta: null, spikeColorTarget: null, spikeTimestamp: 0 })
  },

  setSpike: (raw, colors) => {
    const delta = raw ? computeSpikeState(raw) : null
    set({ spikeDelta: delta, spikeColorTarget: colors, spikeTimestamp: performance.now() })
  },
}))
