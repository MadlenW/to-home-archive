import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const token = process.env.ARENA_TOKEN
  if (!token) {
    return NextResponse.json({ error: 'No token' }, { status: 500 })
  }

  let body: { channel_id?: string; content?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { channel_id, content } = body
  if (!channel_id || !content?.trim()) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const arenaRes = await fetch('https://api.are.na/v2/channels/' + channel_id + '/blocks', {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ kind: 'Text', content }),
  })

  const data = await arenaRes.json()
  return NextResponse.json(data, { status: arenaRes.status })
}
