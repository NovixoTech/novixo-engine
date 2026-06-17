/**
 * Novixo Engine - Phase 8: Provider Adapters
 * -------------------------------------------
 * Out-of-the-box `send` functions for Groq, Gemini, and Anthropic that match
 * the signature AIRequestManager expects: (prompt, model, config) => Promise<ResponseLike>
 *
 * Each adapter normalizes its provider's reply shape into { text, provider, raw }
 * so AIRequestManager.request() always returns the same structure regardless
 * of which provider actually answered.
 */

// Wraps a real fetch Response so .json() returns normalized data,
// while .ok / .status / .headers stay intact for rate-limit detection.
function normalizeResponse(fetchResponse, normalizer) {
  return {
    ok: fetchResponse.ok,
    status: fetchResponse.status,
    headers: fetchResponse.headers,
    json: async () => normalizer(await fetchResponse.json()),
  };
}

/**
 * @param {string} apiKey
 * @param {number} [priority]
 */
function createGroqProvider(apiKey, priority = 1) {
  return {
    name: "groq",
    priority,
    send: async (prompt, model = "llama-3.3-70b-versatile") => {
      const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      return normalizeResponse(res, (data) => ({
        text: data.choices?.[0]?.message?.content ?? "",
        provider: "groq",
        raw: data,
      }));
    },
  };
}

/**
 * @param {string} apiKey
 * @param {number} [priority]
 */
function createGeminiProvider(apiKey, priority = 2) {
  return {
    name: "gemini",
    priority,
    send: async (prompt, model = "gemini-2.0-flash") => {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
          }),
        }
      );
      return normalizeResponse(res, (data) => ({
        text: data.candidates?.[0]?.content?.parts?.[0]?.text ?? "",
        provider: "gemini",
        raw: data,
      }));
    },
    // Gemini often signals quota issues with 429 but check error.status too
    rateLimitDetector: (response) =>
      response.status === 429 || response.status === 403,
  };
}

/**
 * @param {string} apiKey
 * @param {number} [priority]
 */
function createAnthropicProvider(apiKey, priority = 3) {
  return {
    name: "anthropic",
    priority,
    send: async (prompt, model = "claude-sonnet-4-6") => {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: 1000,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      return normalizeResponse(res, (data) => ({
        text: data.content?.[0]?.text ?? "",
        provider: "anthropic",
        raw: data,
      }));
    },
  };
}

module.exports = { createGroqProvider, createGeminiProvider, createAnthropicProvider };
