/**
 * Novixo Engine - Phase 8: Usage Example
 */
const { AIRequestManager } = require("./ai-request-manager");
const {
  createGroqProvider,
  createGeminiProvider,
  createAnthropicProvider,
} = require("./ai-providers");

const aiManager = new AIRequestManager();

aiManager.registerProvider(createGroqProvider(process.env.GROQ_API_KEY, 1));
aiManager.registerProvider(createGeminiProvider(process.env.GEMINI_API_KEY, 2));
aiManager.registerProvider(createAnthropicProvider(process.env.ANTHROPIC_API_KEY, 3));

// Optional: react to what's happening under the hood
aiManager.on("onRateLimit", ({ provider }) => console.log(`Rate limited: ${provider}`));
aiManager.on("onProviderFailover", ({ from, to }) => console.log(`Failover: ${from} -> ${to}`));
aiManager.on("onAllProvidersExhausted", () => console.log("All providers failed."));
aiManager.on("onQueued", () => console.log("Offline - request queued."));

async function main() {
  const result = await aiManager.request({
    prompt: "Explain offline-first architecture in one sentence.",
  });
  console.log(result.text || result);
  console.log(aiManager.getStats());
}

main();
