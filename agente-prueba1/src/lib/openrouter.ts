import OpenAI from "openai";
import { getSystemPrompt } from "./system-prompt";

export async function generateReply(history: { role: string; content: string }[]) {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY no configurada");
  const client = new OpenAI({ apiKey: key, baseURL: "https://openrouter.ai/api/v1" });
  const activePrompt = await getSystemPrompt();
  const response = await client.chat.completions.create({ model: process.env.OPENROUTER_MODEL ?? "openai/gpt-4o-mini", messages: [{ role: "system", content: activePrompt }, ...history.map((m) => ({ role: m.role as "user" | "assistant", content: m.content }))] });
  return response.choices[0]?.message?.content?.trim() || "Déjame derivarte con un asesor humano.";
}
