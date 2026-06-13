import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default async function handler(req, res) {
  try {
    const keys = await redis.keys('user:*');
    const reports = [];

    for (const key of keys) {
      const profile = await redis.get(key);
      if (!profile) continue;

      const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 800,
          messages: [{
            role: 'user',
            content: `Write a short, warm, encouraging monthly English progress report for a student named ${profile.name}. Their recurring mistakes: ${JSON.stringify(profile.mistakes || [])}. Include: what they've been working on, their most frequent challenges, 2-3 specific recommendations to improve, and an encouraging closing. Write in simple English. Keep it under 250 words.`,
          }],
        }),
      });
      const aiData = await aiRes.json();
      const report = aiData.content[0].text;
      reports.push({ name: profile.name, report });

      if (profile.email) {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          },
          body: JSON.stringify({
            from: 'Alan Chat <onboarding@resend.dev>',
            to: profile.email,
            subject: `Your English Progress Report — ${new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`,
            html: `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
              <h1 style="color: #6366f1;">Your Monthly Progress 🌟</h1>
              <pre style="white-space: pre-wrap; font-family: sans-serif; line-height: 1.6;">${report}</pre>
              <p style="color: #888; font-size: 12px;">Keep practicing with Alex at origenes.school!</p>
            </div>`,
          }),
        });
      }
    }

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'Alan Chat <onboarding@resend.dev>',
        to: process.env.SUMMARY_EMAIL,
        subject: `Monthly Student Overview — ${new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`,
        html: `<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #6366f1;">All Students — Monthly Overview</h1>
          ${reports.map(r => `<h2>${r.name}</h2><pre style="white-space: pre-wrap; font-family: sans-serif; background: #f4f4f4; padding: 12px; border-radius: 8px;">${r.report}</pre>`).join('')}
        </div>`,
      }),
    });

    res.status(200).json({ success: true, students: reports.length });
  } catch (err) {
    console.error('Monthly report error:', err);
    res.status(500).json({ error: 'Report generation failed' });
  }
}
