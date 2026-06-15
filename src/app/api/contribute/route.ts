import { NextResponse } from 'next/server'

const corsHeaders = {
  'Access-Control-Allow-Origin':      'https://archive.to-home.org',
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

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400, headers: corsHeaders })
  }

  const channelId = formData.get('channel_id')?.toString()
  const content   = formData.get('content')?.toString()?.trim()
  const imageFile = formData.get('image') as File | null

  if (!channelId) {
    return NextResponse.json({ error: 'Missing channel_id' }, { status: 400, headers: corsHeaders })
  }
  if (!content && !(imageFile && imageFile.size > 0)) {
    return NextResponse.json({ error: 'Missing content or image' }, { status: 400, headers: corsHeaders })
  }

  let arenaRes: Response

  if (imageFile && imageFile.size > 0) {
    const arenaForm = new FormData()
    arenaForm.append('channel_ids[]', channelId)
    arenaForm.append('block[kind]', 'Image')
    arenaForm.append('block[attachment]', imageFile)

    arenaRes = await fetch('https://api.are.na/v2/blocks', {
      method:  'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body:    arenaForm,
    })
  } else {
    arenaRes = await fetch('https://api.are.na/v3/blocks', {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        kind:        'Text',
        value:       content,
        channel_ids: [Number(channelId)],
      }),
    })
  }

  const arenaData = await arenaRes.json()
  return NextResponse.json(arenaData, { status: 200, headers: corsHeaders })
}
