import OpenAI from "openai";
import { getSystemPrompt } from "./system-prompt";

export const DEFAULT_MODEL = "openai/gpt-4o-mini";

export function getOpenRouterModel(): string {
  const model = process.env.OPENROUTER_MODEL?.trim();
  if (
    !model ||
    model.includes("ling-3.0") ||
    model.includes("sante") ||
    model === "undefined" ||
    model === "null"
  ) {
    return DEFAULT_MODEL;
  }
  return model;
}

export async function generateReply(history: { role: string; content: string }[]) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY no configurada");
  const client = new OpenAI({ apiKey: key, baseURL: "https://openrouter.ai/api/v1" });
  const activePrompt = await getSystemPrompt();

  const model = getOpenRouterModel();
  try {
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: activePrompt },
        ...history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content }))
      ]
    });
    return response.choices[0]?.message?.content?.trim() || "Déjame derivarte con un asesor humano.";
  } catch (err: any) {
    if (
      model !== DEFAULT_MODEL &&
      (err?.status === 404 || err?.message?.includes("no provider serves this model"))
    ) {
      console.warn(
        `[openrouter] Modelo ${model} no disponible en OpenRouter. Reintentando con ${DEFAULT_MODEL}...`
      );
      const fallbackResponse = await client.chat.completions.create({
        model: DEFAULT_MODEL,
        messages: [
          { role: "system", content: activePrompt },
          ...history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content }))
        ]
      });
      return fallbackResponse.choices[0]?.message?.content?.trim() || "Déjame derivarte con un asesor humano.";
    }
    throw err;
  }
}
