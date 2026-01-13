
export const config = {
  runtime: 'edge',
};

export async function POST(request: Request) {
  try {
    const payload = await request.json().catch(() => ({}));
    const { text, voiceId } = payload || {};
    const apiKey = process.env.ELEVENLABS_API_KEY;

    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Server configuration error: Missing TTS Key" }), { status: 500, headers: { "Content-Type": "application/json" } });
    }

    if (!text || typeof text !== "string" || !text.trim()) {
      return new Response(JSON.stringify({ error: "Missing text" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }

    if (text.length > 5000) {
      return new Response(JSON.stringify({ error: "Text too long (max 5000 chars)" }), { status: 413, headers: { "Content-Type": "application/json" } });
    }

    // Default to 'Hanisah' voice ID if not provided
    const targetVoice = voiceId || 'JBFqnCBsd6RMkjVDRZzb';

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${targetVoice}/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': apiKey
      },
      body: JSON.stringify({
        text: text,
        model_id: "eleven_multilingual_v2",
        voice_settings: { stability: 0.5, similarity_boost: 0.75 }
      }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      return new Response(JSON.stringify({ error: `Provider Error: ${errorText}` }), { status: response.status, headers: { "Content-Type": "application/json" } });
    }

    // Return the audio stream directly
    return new Response(response.body, {
      headers: { 'Content-Type': 'audio/mpeg', "Cache-Control": "no-store" }
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message || "Unknown error" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
