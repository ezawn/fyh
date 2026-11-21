/**
 * SERVER LANE. Setup check for the AI backend chosen by server/ai.ts: one small
 * structured-output call, then the real cartridge schema is accepted or not.
 * Run: npx tsx server/check-ai.ts   (prints no credentials)
 */
import { generationJsonSchema } from "../src/shared/schema";
import { aiComplete, aiProvider, geminiModels } from "./ai";

const small = {
  type: "object",
  properties: { answer: { type: "string" }, number: { type: "integer" } },
  required: ["answer", "number"],
};

async function main() {
  console.log(`AI provider: ${aiProvider()}`);
  if (aiProvider() === "gemini") {
    const models = await geminiModels();
    console.log(`Gemini model: ${process.env.GEMINI_MODEL ?? "gemini-3.6-flash"} (key can use: ${models.map((m) => m.name).join(", ")})`);
  }
  let started = Date.now();
  const out = await aiComplete<{ answer: string; number: number }>('Reply with answer "ok" and number 7.', small, { maxTokens: 2000, effort: "low" });
  console.log(`Small schema OK (${Date.now() - started} ms): ${JSON.stringify(out)}`);

  started = Date.now();
  const res = await aiComplete<{ outcome: string; question?: string; message?: string }>(
    'For this check only, return outcome "unknown_source" with message "schema check" and no cartridge.',
    generationJsonSchema(),
    { maxTokens: 2000, effort: "low" },
  );
  console.log(`Cartridge schema accepted (${Date.now() - started} ms): outcome=${res.outcome}`);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(`AI check failed: ${(err as Error).message.split("\n")[0]}`);
    process.exit(1);
  },
);
