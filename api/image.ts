
export const config = {
  runtime: 'edge',
};

export async function POST(request: Request) {
  try {
    const payload = await request.json().catch(() => ({}));
    const { prompt, modelId } = payload || {};
    const token = process.env.HF_TOKEN;

    if (!token) {
      return new Response(JSON.stringify({ error: "Server configuration error: Missing HF Token" }), { status: 500, headers: { "Content-Type": "application/json" } });
    }

    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      return new Response(JSON.stringify({ error: "Missing prompt" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }

    if (!modelId || typeof modelId !== "string") {
      return new Response(JSON.stringify({ error: "Missing modelId" }), { status: 400, headers: { "Content-Type": "application/json" } });
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);

    const response = await fetch(`https://api-inference.huggingface.co/models/${modelId}`, {
      headers: { 
          Authorization: `Bearer ${token}`, 
          "Content-Type": "application/json" 
      },
      method: "POST",
      body: JSON.stringify({ inputs: prompt }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      return new Response(JSON.stringify({ error: `Provider Error: ${errorText}` }), { status: response.status, headers: { "Content-Type": "application/json" } });
    }

    // Return the image blob directly
    return new Response(response.body, {
      headers: { 'Content-Type': response.headers.get('Content-Type') || 'image/jpeg', "Cache-Control": "no-store" }
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message || "Unknown error" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
