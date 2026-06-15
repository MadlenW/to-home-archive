'use client'

import { create } from 'zustand'

export type RoomId =
  | 'kitchen'
  | 'hallway'
  | 'bathroom'
  | 'bedroom'
  | 'living-room'

export const ROOM_IDS: RoomId[] = [
  'kitchen',
  'hallway',
  'bathroom',
  'bedroom',
  'living-room',
]

export const ROOM_LABELS: Record<RoomId, string> = {
  'kitchen':     '01_threshold',
  'living-room': '02_wardrobe',
  'bedroom':     '03_bed matrix',
  'bathroom':    '04_profile',
  'hallway':     '05_canopy',
}

interface ExperienceState {
  currentView:          'floorplan' | 'room'
  activeRoomId:         RoomId | null
  activeObservationId:  string | null
  isPortalOpen:         boolean
  setView:              (view: 'floorplan' | 'room', roomId?: RoomId | null) => void
  setActiveObservation: (id: string | null) => void
  setPortalOpen:        (open: boolean) => void
}

export const useExperienceStore = create<ExperienceState>()((set) => ({
  currentView:         'floorplan',
  activeRoomId:        null,
  activeObservationId: null,
  isPortalOpen:        false,
  setView: (view, roomId = null) =>
    set({
      currentView:  view,
      activeRoomId: roomId ?? null,
      // Clear observation focus and portal when returning to floorplan
      ...(view === 'floorplan' ? { activeObservationId: null, isPortalOpen: false } : {}),
    }),
  setActiveObservation: (id) => set({ activeObservationId: id }),
  setPortalOpen:        (open) => set({ isPortalOpen: open }),
}))
