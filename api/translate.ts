
export const config = {
  runtime: 'edge',
};

export async function POST(request: Request) {
  try {
    const payload = await request.json().catch(() => ({}));
    const { text, target_lang } = payload || {};
    const apiKey = process.env.DEEPL_API_KEY || process.env.VITE_DEEPL_API_KEY;

    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Server configuration error: Missing DeepL API Key" }), { status: 500, headers: { "Content-Type": "application/json" } });
    }

    if (!text || typeof text !== "string" || !text.trim() || !target_lang) {
      return new Response(JSON.stringify({ error: "Missing text or target_lang" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }

    if (text.length > 5000) {
      return new Response(JSON.stringify({ error: "Text too long (max 5000 chars)" }), { status: 413, headers: { "Content-Type": "application/json" } });
    }

    // Determine Endpoint (Free vs Pro)
    // DeepL Free keys always end in ":fx"
    const isFreeTier = apiKey.endsWith(':fx');
    const endpoint = isFreeTier 
      ? 'https://api-free.deepl.com/v2/translate'
      : 'https://api.deepl.com/v2/translate';

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `DeepL-Auth-Key ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: [text],
        target_lang: target_lang.toUpperCase(),
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      return new Response(JSON.stringify({ error: `DeepL Error: ${errorText}` }), { status: response.status, headers: { "Content-Type": "application/json" } });
    }

    const data = await response.json();
    
    // DeepL returns { translations: [{ detected_source_language: "EN", text: "..." }] }
    const translatedText = data.translations?.[0]?.text;

    if (!translatedText) {
        throw new Error("Invalid response format from DeepL");
    }

    return new Response(JSON.stringify({ text: translatedText }), {
      headers: { 'Content-Type': 'application/json', "Cache-Control": "no-store" }
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message || "Unknown error" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
