// Save this file as: api/tts.js in your Vite/Vercel project
// Add OPENAI_API_KEY to your Vercel environment variables

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const { text } = req.body;
  if (!text) return res.status(400).json({ error: "Missing text" });

  try {
    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "tts-1-hd",   // tts-1-hd = higher quality, tts-1 = faster/cheaper
        voice: "echo",       // Options: alloy, echo, fable, onyx, nova, shimmer
                             // "echo" sounds warm, friendly, conversational — great for Alex
                             // Try "nova" for a slightly warmer tone, "fable" for more expressive
        input: text,
        speed: 1.0,          // 0.25–4.0. Keep at 1.0 for natural pace
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(response.status).json({ error: err });
    }

    // Stream the audio binary back to the client
    const audioBuffer = await response.arrayBuffer();
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Length", audioBuffer.byteLength);
    res.send(Buffer.from(audioBuffer));
  } catch (err) {
    console.error("TTS error:", err);
    res.status(500).json({ error: "TTS generation failed" });
  }
}
