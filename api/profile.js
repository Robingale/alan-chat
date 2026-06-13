import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const key = (req.query.name || req.body?.name || '').toLowerCase().trim();
  if (!key) return res.status(400).json({ error: 'Name required' });

  if (req.method === 'GET') {
    try {
      const profile = await redis.get(`user:${key}`);
      return res.status(200).json(profile || null);
    } catch {
      return res.status(200).json(null);
    }
  }

  if (req.method === 'POST') {
    try {
      const existing = await redis.get(`user:${key}`) || {};
      const { mistakes, recentMessages, name, email } = req.body;
      const existingMistakes = existing.mistakes || [];
      const updatedMistakes = [...existingMistakes];

      for (const newMistake of (mistakes || [])) {
        const idx = updatedMistakes.findIndex(m => m.rule === newMistake.rule);
        if (idx >= 0) {
          updatedMistakes[idx].count += 1;
          updatedMistakes[idx].lastSeen = new Date().toISOString();
          updatedMistakes[idx].example = newMistake.example;
        } else {
          updatedMistakes.push({ ...newMistake, count: 1, lastSeen: new Date().toISOString() });
        }
      }

      const profile = {
        name: name || key,
        email: email || existing.email || null,
        lastSeen: new Date().toISOString(),
        mistakes: updatedMistakes.slice(-20),
        recentMessages: (recentMessages || []).slice(-20),
      };

      await redis.set(`user:${key}`, profile);
      return res.status(200).json({ success: true });
    } catch (err) {
      console.error('Profile save error:', err);
      return res.status(500).json({ error: 'Failed to save profile' });
    }
  }

  return res.status(405).end();
}
