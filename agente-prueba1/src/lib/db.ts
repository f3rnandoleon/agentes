import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export type Mode = "AI" | "HUMAN";
export type Role = "user" | "assistant" | "human";
export type Conversation = { id: number; phone: string; name: string | null; mode: Mode; last_message_at: number | null; created_at: number; last_message_preview?: string | null };
export type Message = { id: number; conversation_id: number; role: Role; content: string; wa_message_id: string | null; created_at: number };

const dataDir = path.join(process.cwd(), "data");
fs.mkdirSync(dataDir, { recursive: true });
const db = new Database(path.join(dataDir, "messages.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.exec(`CREATE TABLE IF NOT EXISTS conversations (id INTEGER PRIMARY KEY AUTOINCREMENT, phone TEXT UNIQUE NOT NULL, name TEXT, mode TEXT CHECK(mode IN ('AI','HUMAN')) NOT NULL DEFAULT 'AI', last_message_at INTEGER, created_at INTEGER NOT NULL DEFAULT (unixepoch()));
CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, conversation_id INTEGER NOT NULL REFERENCES conversations(id), role TEXT CHECK(role IN ('user','assistant','human')) NOT NULL, content TEXT NOT NULL, wa_message_id TEXT, created_at INTEGER NOT NULL DEFAULT (unixepoch()));
CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_wa_id ON messages(wa_message_id) WHERE wa_message_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS processed_webhook_messages (wa_message_id TEXT PRIMARY KEY, processed_at INTEGER NOT NULL DEFAULT (unixepoch()));`);

export function getOrCreateConversation(phone: string, name?: string | null): Conversation {
  const existing = db.prepare("SELECT * FROM conversations WHERE phone = ?").get(phone) as Conversation | undefined;
  if (existing) { if (name && !existing.name) db.prepare("UPDATE conversations SET name=? WHERE id=?").run(name, existing.id); return existing; }
  const result = db.prepare("INSERT INTO conversations (phone,name) VALUES (?,?)").run(phone, name ?? null);
  return db.prepare("SELECT * FROM conversations WHERE id=?").get(result.lastInsertRowid) as Conversation;
}
export const getConversationById = (id: number) => db.prepare("SELECT * FROM conversations WHERE id=?").get(id) as Conversation | undefined;
export function insertMessage(conversationId: number, role: Role, content: string, waMessageId?: string | null) {
  const tx = db.transaction(() => { const r = db.prepare("INSERT INTO messages (conversation_id,role,content,wa_message_id) VALUES (?,?,?,?)").run(conversationId, role, content, waMessageId ?? null); db.prepare("UPDATE conversations SET last_message_at=unixepoch() WHERE id=?").run(conversationId); return Number(r.lastInsertRowid); }); return tx();
}
export const updateMessageWaId = (id: number, waId: string) => db.prepare("UPDATE messages SET wa_message_id=? WHERE id=?").run(waId, id);
export const getMessages = (id: number, limit = 50) => db.prepare("SELECT * FROM messages WHERE conversation_id=? ORDER BY created_at DESC, id DESC LIMIT ?").all(id, limit).reverse() as Message[];
export const getRecentHistory = (id: number, limit = 20) => getMessages(id, limit).map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: m.content }));
export const setMode = (id: number, mode: Mode) => db.prepare("UPDATE conversations SET mode=? WHERE id=?").run(mode, id);
export const listConversations = () => db.prepare("SELECT c.*, (SELECT content FROM messages m WHERE m.conversation_id=c.id ORDER BY m.created_at DESC,m.id DESC LIMIT 1) last_message_preview FROM conversations c ORDER BY c.last_message_at DESC, c.id DESC").all() as Conversation[];
export function deleteConversation(id: number) { const tx = db.transaction(() => { db.prepare("DELETE FROM messages WHERE conversation_id=?").run(id); db.prepare("DELETE FROM conversations WHERE id=?").run(id); }); tx(); }
export const wasMessageProcessed = (id: string) => Boolean(db.prepare("SELECT 1 FROM processed_webhook_messages WHERE wa_message_id=?").get(id));
export const markMessageProcessed = (id: string) => db.prepare("INSERT OR IGNORE INTO processed_webhook_messages (wa_message_id) VALUES (?)").run(id);
