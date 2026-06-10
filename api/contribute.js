export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = process.env.ARENA_TOKEN;
  if (!token) return res.status(500).json({ error: 'No token' });

  const { channel_id, content, color, material, size, edge } = req.body;
  const tag = `[col:${color} mat:${material} size:${size} edge:${edge}]`;

  const arenaRes = await fetch('https://api.are.na/v3/blocks', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      kind: 'Text',
      value: `${content}\n${tag}`,
      channel_ids: [channel_id]
    })
  });

  const data = await arenaRes.json();
  return res.status(arenaRes.status).json(data);
}
