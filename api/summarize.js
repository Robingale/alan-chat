export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { messages, userName } = req.body;

  try {
    const summaryResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{
          role: 'user',
          content: `Analyze this English learning conversation and provide a structured summary with these sections:
          
1. USER NAME: The student's name
2. DURATION: Approximate number of exchanges
3. TOPICS DISCUSSED: What they talked about
4. MISTAKES MADE: List each grammar/vocabulary mistake the user made
5. CORRECTIONS GIVEN: What was corrected and how
6. PRACTICE COMPLETED: Did the user practice? How did it go?
7. OVERALL ASSESSMENT: A short encouraging note about their English level and progress

Here is the conversation:
${messages.map(m => `${m.role === 'user' ? 'Student' : 'Alex'}: ${m.content}`).join('\n')}`,
        }],
      }),
    });

    const summaryData = await summaryResponse.json();
    const summary = summaryData.content[0].text;

    const transcript = messages
      .map(m => `<p><strong>${m.role === 'user' ? userName || 'Student' : 'Alex'}:</strong> ${m.content}</p>`)
      .join('');

    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'Alan Chat <onboarding@resend.dev>',
        to: process.env.SUMMARY_EMAIL,
        subject: `Chat Summary — ${userName || 'Unknown User'} — ${new Date().toLocaleDateString()}`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #6366f1;">Alan Chat — Conversation Summary</h1>
            <p><strong>Date:</strong> ${new Date().toLocaleString()}</p>
            <hr/>
            <h2>📊 Summary</h2>
            <pre style="background: #f4f4f4; padding: 16px; border-radius: 8px; white-space: pre-wrap;">${summary}</pre>
            <hr/>
            <h2>💬 Full Transcript</h2>
            <div style="background: #f9f9f9; padding: 16px; border-radius: 8px;">
              ${transcript}
            </div>
          </div>
        `,
      }),
    });

    if (!emailResponse.ok) {
      const err = await emailResponse.text();
      return res.status(500).json({ error: err });
    }

    res.status(200).json({ success: true });
  } catch (err) {
    console.error('Summarize error:', err);
    res.status(500).json({ error: 'Failed to send summary' });
  }
}
