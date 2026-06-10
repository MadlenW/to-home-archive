import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const token = process.env.ARENA_TOKEN
  if (!token) {
    return NextResponse.json({ error: 'No token' }, { status: 500 })
  }

  let body: {
    channel_id?: string
    content?:    string
    color?:      string
    material?:   string
    size?:       string
    edge?:       string
  }

  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { channel_id, content, color, material, size, edge } = body
  const tag = `[col:${color} mat:${material} size:${size} edge:${edge}]`

  const arenaRes = await fetch('https://api.are.na/v3/blocks', {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      kind:        'Text',
      value:       `${content}\n${tag}`,
      channel_ids: [channel_id],
    }),
  })

  const data = await arenaRes.json()
  return NextResponse.json(data, { status: arenaRes.status })
}
