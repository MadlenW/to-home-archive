import { NextResponse } from 'next/server'

const CORS_HEADERS = {
  'Access-Control-Allow-Credentials': 'true',
  'Access-Control-Allow-Origin':      'https://madlenw.github.io',
  'Access-Control-Allow-Methods':     'GET,OPTIONS,PATCH,DELETE,POST,PUT',
  'Access-Control-Allow-Headers':     'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version',
}

// Handle browser preflight checks
export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: CORS_HEADERS })
}

export async function POST(request: Request) {
  const token = process.env.ARENA_TOKEN
  if (!token) {
    return NextResponse.json({ error: 'No token' }, { status: 500, headers: CORS_HEADERS })
  }

  let body: { channel_id?: string; content?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400, headers: CORS_HEADERS })
  }

  const { channel_id, content } = body
  if (!channel_id || !content?.trim()) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400, headers: CORS_HEADERS })
  }

  const arenaRes = await fetch('https://api.are.na/v3/channels/' + channel_id + '/blocks', {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ kind: 'Text', content }),
  })

  const data = await arenaRes.json()
  return NextResponse.json(data, { status: arenaRes.status, headers: CORS_HEADERS })
}
