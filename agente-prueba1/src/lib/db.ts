import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export type Mode = "AI" | "HUMAN";
export type Role = "user" | "assistant" | "human";
export type Conversation = { id: number; phone: string; name: string | null; mode: Mode; last_message_at: number | null; created_at: number; last_message_preview?: string | null };
export type Message = { id: number; conversation_id: number; role: Role; content: string; wa_message_id: string | null; created_at: number };
export type WhatsAppOrder = { id: number; conversation_id: number; numero_pedido: string; pago_id: string; estado: string; created_at: number };
export type SalesContext = {
  category?: string; size?: string; filters?: Record<string, string>;
  models?: unknown[]; variants?: unknown[];
  selectedModel?: unknown; selectedVariant?: unknown;
  quantity?: number; stage?: string;
};

let client: SupabaseClient | undefined;
function supabase() {
  if (client) return client;
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY no configurada");
  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) }
  });
  return client;
}
function fail(error: { message: string } | null) { if (error) throw new Error(`Supabase: ${error.message}`); }

export async function getOrCreateConversation(phone: string, name?: string | null): Promise<Conversation> {
  const db = supabase(); const { data: existing, error: lookupError } = await db.from("conversations").select("*").eq("phone", phone).maybeSingle(); fail(lookupError);
  if (existing) { if (name && !existing.name) { const { data, error } = await db.from("conversations").update({ name }).eq("id", existing.id).select("*").single(); fail(error); return data as Conversation; } return existing as Conversation; }
  const { data, error } = await db.from("conversations").insert({ phone, name: name ?? null }).select("*").single(); fail(error); return data as Conversation;
}
export async function getConversationById(id: number): Promise<Conversation | undefined> { const { data, error } = await supabase().from("conversations").select("*").eq("id", id).maybeSingle(); fail(error); return (data as Conversation | null) ?? undefined; }
export async function insertMessage(conversationId: number, role: Role, content: string, waMessageId?: string | null) { const db = supabase(); const { data, error } = await db.from("messages").insert({ conversation_id: conversationId, role, content, wa_message_id: waMessageId ?? null }).select("id").single(); fail(error); if (!data) throw new Error("Supabase no devolvió el mensaje insertado"); const { error: updateError } = await db.from("conversations").update({ last_message_at: Math.floor(Date.now() / 1000) }).eq("id", conversationId); fail(updateError); return Number(data.id); }
export async function updateMessageWaId(id: number, waId: string) { const { error } = await supabase().from("messages").update({ wa_message_id: waId }).eq("id", id); fail(error); }
export async function getMessages(id: number, limit = 50): Promise<Message[]> { const { data, error } = await supabase().from("messages").select("*").eq("conversation_id", id).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(limit); fail(error); return (data ?? []).reverse() as Message[]; }
export async function getRecentHistory(id: number, limit = 20) { return (await getMessages(id, limit)).map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: m.content })); }
export async function setMode(id: number, mode: Mode) { const { error } = await supabase().from("conversations").update({ mode }).eq("id", id); fail(error); }
export async function listConversations(): Promise<Conversation[]> { const { data, error } = await supabase().from("conversation_summaries").select("*").order("last_message_at", { ascending: false, nullsFirst: false }).order("id", { ascending: false }); fail(error); return (data ?? []) as Conversation[]; }
export async function deleteConversation(id: number) { const { error } = await supabase().from("conversations").delete().eq("id", id); fail(error); }
export async function deleteMessages(id: number) { const { error } = await supabase().from("messages").delete().eq("conversation_id", id); fail(error); }
export async function wasMessageProcessed(id: string) { const { data, error } = await supabase().from("processed_webhook_messages").select("wa_message_id").eq("wa_message_id", id).maybeSingle(); fail(error); return Boolean(data); }
export async function markMessageProcessed(id: string) { const { error } = await supabase().from("processed_webhook_messages").upsert({ wa_message_id: id }, { onConflict: "wa_message_id", ignoreDuplicates: true }); fail(error); }
export async function saveWhatsAppOrder(conversationId: number, order: { numeroPedido: string; pagoId: string; estado: string }) { const { error } = await supabase().from("whatsapp_orders").upsert({ conversation_id: conversationId, numero_pedido: order.numeroPedido, pago_id: order.pagoId, estado: order.estado }, { onConflict: "numero_pedido" }); fail(error); }
export async function latestPendingWhatsAppOrder(conversationId: number): Promise<WhatsAppOrder | undefined> { const { data, error } = await supabase().from("whatsapp_orders").select("*").eq("conversation_id", conversationId).eq("estado", "PENDING_PAYMENT").order("id", { ascending: false }).limit(1).maybeSingle(); fail(error); return (data as WhatsAppOrder | null) ?? undefined; }
export async function setWhatsAppOrderStatus(numeroPedido: string, estado: string) { const { error } = await supabase().from("whatsapp_orders").update({ estado }).eq("numero_pedido", numeroPedido); fail(error); }
export async function getSalesContext(conversationId: number): Promise<SalesContext> { const { data, error } = await supabase().from("sales_contexts").select("state").eq("conversation_id", conversationId).maybeSingle(); fail(error); return (data?.state ?? {}) as SalesContext; }
export async function saveSalesContext(conversationId: number, state: SalesContext) { const { error } = await supabase().from("sales_contexts").upsert({ conversation_id: conversationId, state, updated_at: Math.floor(Date.now() / 1000) }, { onConflict: "conversation_id" }); fail(error); }
