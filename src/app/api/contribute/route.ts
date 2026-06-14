import { NextResponse } from 'next/server'

const corsHeaders = {
  'Access-Control-Allow-Origin':      'https://madlenw.github.io',
  'Access-Control-Allow-Methods':     'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers':     'Content-Type, Authorization, X-Requested-With, Accept',
  'Access-Control-Allow-Credentials': 'true',
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: corsHeaders,
  })
}

export async function POST(request: Request) {
  const token = process.env.ARENA_TOKEN
  if (!token) {
    return NextResponse.json({ error: 'No token' }, { status: 500, headers: corsHeaders })
  }

  let body: { channel_id?: string; content?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400, headers: corsHeaders })
  }

  const { channel_id, content } = body
  if (!channel_id || !content?.trim()) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400, headers: corsHeaders })
  }

  const arenaRes = await fetch('https://api.are.na/v3/blocks', {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      kind:        'Text',
      value:       content,
      channel_ids: [Number(channel_id)],
    }),
  })

  const arenaData = await arenaRes.json()
  return NextResponse.json(arenaData, {
    status:  200,
    headers: corsHeaders,
  })
}
