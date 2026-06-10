'use client'

import { useState, useEffect } from 'react'
import type { RoomId } from '../stores/useExperienceStore'

// ─── Types ─────────────────────────────────────────────────────────────────────

export type BlockClass = 'Text' | 'Image' | 'Link' | 'Media' | 'Unknown'

export interface VisualTag {
  color:    string
  material: string
  size:     'small' | 'medium' | 'large'
  edge:     string
}

export interface Observation {
  id:           string
  roomId:       RoomId
  blockClass:   BlockClass
  text:         string
  imageUrl:     string | null
  thumbUrl:     string | null
  linkUrl:      string | null
  title:        string
  sizeEstimate: 'small' | 'medium' | 'large'
  timestamp:    Date
  tag:          VisualTag | null
  isMock:       boolean
}

export type ArenaDataMap = Partial<Record<RoomId, Observation[]>>

// ─── Are.na channel configuration ─────────────────────────────────────────────

const ARENA_BASE      = 'https://api.are.na/v2/channels'
const PER_CHANNEL     = 20
const FETCH_TIMEOUT   = 6000

const ARENA_SLUGS: Record<RoomId, string> = {
  'kitchen':     'kitchen-_dpxnlj4op8',
  'hallway':     'hallway-pmywetfnlve',
  'bathroom':    'bathroom-6orcuuzqerc',
  'bedroom':     'bedroom-cceaffchfdg',
  'living-room': 'living-room-te9ggrtmjzc',
}

const ROOM_IDS: RoomId[] = ['kitchen', 'hallway', 'bathroom', 'bedroom', 'living-room']

// ─── Raw Are.na block shape ────────────────────────────────────────────────────

interface ArenaBlock {
  id:          number
  title:       string | null
  content:     string | null
  description: string | null
  class:       string
  image?: {
    original?: { url: string }
    large?:    { url: string }
    thumb?:    { url: string }
  }
  source?: { url?: string }
  created_at:  string
}

// ─── Module-level cache ────────────────────────────────────────────────────────
// Each room is fetched at most once per session. Shared across all hook instances.

const cache:    Partial<Record<RoomId, Observation[]>> = {}
const inflight: Partial<Record<RoomId, Promise<Observation[]>>> = {}

// ─── HTML / tag utilities ──────────────────────────────────────────────────────

const ENTITIES: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"',
  '&#39;': "'", '&nbsp;': ' ', '&hellip;': '…',
}

function cleanHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\[col:[^\]]*\]/gi, '')
    .replace(/&\w+;/g, (m) => ENTITIES[m] ?? m)
    .replace(/\s{2,}/g, ' ')
    .trim()
}

const TAG_RE = /\[col:([^\s\]]+)\s+mat:([^\s\]]+)\s+size:(small|medium|large)\s+edge:([^\s\]]+)\]/i

function parseTag(raw: string): VisualTag | null {
  const m = raw.match(TAG_RE)
  if (!m) return null
  return { color: m[1], material: m[2], size: m[3] as VisualTag['size'], edge: m[4] }
}

function estimateSize(cls: BlockClass, text: string): 'small' | 'medium' | 'large' {
  if (cls === 'Image' || cls === 'Media') return 'medium'
  if (cls === 'Link') return 'small'
  const n = text.split(/\s+/).filter(Boolean).length
  return n < 12 ? 'small' : n < 48 ? 'medium' : 'large'
}

function normalise(block: ArenaBlock, roomId: RoomId): Observation {
  const raw  = block.content ?? ''
  const cls: BlockClass =
    block.class === 'Text'  ? 'Text'  :
    block.class === 'Image' ? 'Image' :
    block.class === 'Link'  ? 'Link'  :
    block.class === 'Media' ? 'Media' :
    'Unknown'
  const text = cleanHtml((raw || block.description) ?? '')
  const tag  = parseTag(raw)
  return {
    id:           `arena_${block.id}`,
    roomId,
    blockClass:   cls,
    text:         text || block.title || '',
    imageUrl:     block.image?.original?.url ?? block.image?.large?.url ?? null,
    thumbUrl:     block.image?.thumb?.url ?? null,
    linkUrl:      block.source?.url ?? null,
    title:        block.title ?? '',
    sizeEstimate: tag?.size ?? estimateSize(cls, text),
    timestamp:    new Date(block.created_at),
    tag,
    isMock:       false,
  }
}

// ─── Fetch single channel ──────────────────────────────────────────────────────

async function fetchRoom(roomId: RoomId): Promise<Observation[]> {
  const slug  = ARENA_SLUGS[roomId]
  const ctrl  = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT)
  try {
    const res  = await fetch(
      `${ARENA_BASE}/${slug}/contents?per=${PER_CHANNEL}`,
      { signal: ctrl.signal },
    )
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const json = await res.json() as { contents?: ArenaBlock[] }
    return (json.contents ?? []).map((b) => normalise(b, roomId))
  } finally {
    clearTimeout(timer)
  }
}

// ─── Mock data (evocative domestic text fragments) ────────────────────────────

function makeMock(roomId: RoomId): Observation[] {
  const texts: Record<RoomId, string[]> = {
    'kitchen': [
      'the smell of burnt coffee at 6am, when the house is still yours alone',
      'a recipe folded four times, its creases forming a map of use',
      'sugar granules that never quite sweep into the corner',
      'the drawer that opens differently in winter',
      'water marks on the ceiling above the stove, a history of steam',
      'the colour of olive oil held to afternoon light',
    ],
    'hallway': [
      'seventeen coats and none of them warm enough',
      'the key hook, always missing one key',
      'the particular dust that gathers at the base of umbrellas',
      'footprints that lead inward but never out',
      'a suitcase packed and unpacked more than it has travelled',
      'the sound of the door in every season',
    ],
    'bathroom': [
      'condensation as a private language, finger-written and forgotten',
      'a razorblade left on the edge, time suspended',
      'tiles at the grout line hold the truth of every year',
      'the mirror knows only the present tense',
      'water cooling in the basin, postponing',
      'hair caught in the drain, archive of passage',
    ],
    'bedroom': [
      'the particular quality of light through curtains not yet opened',
      'a pillow still holds the shape of a head that has left',
      'books chosen as sleeping companions, mostly for their weight',
      'sleep as a form of editing',
      'the ceiling becomes a screen between waking and not',
      'two blankets folded once and never the same way twice',
    ],
    'living-room': [
      'a television that watches back in the dark',
      'the sofa holds the negative space of everyone who sat here',
      'afternoon light rotates through the room without asking',
      'a plant that survives on neglect, the most domestic of relationships',
      "the remote control as symbol of a room's authority",
      'marks on the wall where a picture used to be',
    ],
  }

  const t0 = new Date('2023-03-15T00:00:00Z').getTime()
  return texts[roomId].map((text, i): Observation => ({
    id:           `mock_${roomId}_${i}`,
    roomId,
    blockClass:   'Text',
    text,
    imageUrl:     null,
    thumbUrl:     null,
    linkUrl:      null,
    title:        '',
    sizeEstimate: estimateSize('Text', text),
    timestamp:    new Date(t0 + i * 86_400_000 * 11),
    tag:          null,
    isMock:       true,
  }))
}

// ─── Cache access (non-reactive, for use inside useFrame) ────────────────────

/** Returns the current cached array for a room without subscribing to React. */
export function getCachedRoomData(roomId: RoomId): Observation[] {
  return cache[roomId] ?? []
}

// ─── Prepend + listener mechanism ────────────────────────────────────────────
// Called by ContributionPortal on submission. Notifies mounted useArenaData
// instances so their React state re-syncs with the mutated cache.

type DataListener = () => void
const dataListeners: Set<DataListener> = new Set()

/** Inserts `obs` at the front of a room's cached array and triggers re-render. */
export function prependObservation(roomId: RoomId, obs: Observation): void {
  cache[roomId] = [obs, ...(cache[roomId] ?? [])]
  dataListeners.forEach((fn) => fn())
}

// ─── Hook ──────────────────────────────────────────────────────────────────────

interface ArenaDataState {
  data:    Record<RoomId, Observation[]>
  loading: boolean
  error:   string | null
}

function emptyMap(): Record<RoomId, Observation[]> {
  const m = {} as Record<RoomId, Observation[]>
  for (const id of ROOM_IDS) m[id] = []
  return m
}

function buildDataFromCache(): Record<RoomId, Observation[]> {
  const d = emptyMap()
  for (const id of ROOM_IDS) d[id] = cache[id] ?? []
  return d
}

export function useArenaData(): ArenaDataState {
  const [state, setState] = useState<ArenaDataState>(() => ({
    data:    emptyMap(),
    loading: true,
    error:   null,
  }))

  // Subscribe to prepend notifications so new cards appear immediately
  useEffect(() => {
    const onPrepend: DataListener = () =>
      setState((prev) => ({ ...prev, data: buildDataFromCache() }))
    dataListeners.add(onPrepend)
    return () => { dataListeners.delete(onPrepend) }
  }, [])

  // Initial fetch for all rooms
  useEffect(() => {
    let cancelled = false

    async function load() {
      const results = await Promise.allSettled(
        ROOM_IDS.map(async (roomId) => {
          if (cache[roomId]) return { roomId, obs: cache[roomId]! }

          if (!inflight[roomId]) {
            inflight[roomId] = fetchRoom(roomId)
              .then((obs) => { cache[roomId] = obs; return obs })
              .catch(() => {
                const mock = makeMock(roomId)
                cache[roomId] = mock
                return mock
              })
          }

          const obs = await inflight[roomId]!
          return { roomId, obs }
        }),
      )

      if (cancelled) return

      const data = emptyMap()
      for (const r of results) {
        if (r.status === 'fulfilled') {
          data[r.value.roomId] = r.value.obs
        }
      }

      setState({ data, loading: false, error: null })
    }

    void load()
    return () => { cancelled = true }
  }, [])

  return state
}
