import { NextRequest, NextResponse } from "next/server";
import { getConversationById, getMessages, insertMessage, updateMessageWaId } from "@/lib/db";
import { sendTextMessage } from "@/lib/meta/client";

export const dynamic = "force-dynamic";
export async function GET(_req: NextRequest, { params }: { params: Promise<{ conversationId: string }> }) { return NextResponse.json(await getMessages(Number((await params).conversationId))); }
export async function POST(req: NextRequest, { params }: { params: Promise<{ conversationId: string }> }) {
  const id = Number((await params).conversationId), body = await req.json(), content = String(body.content ?? "").trim(), c = await getConversationById(id);
  if (!c) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (c.mode !== "HUMAN") return NextResponse.json({ error: "El chat está en modo IA" }, { status: 409 });
  if (!content) return NextResponse.json({ error: "Mensaje vacío" }, { status: 400 });
  const messageId = await insertMessage(id, "human", content);
  try { const sent = await sendTextMessage(c.phone, content); await updateMessageWaId(messageId, sent.wa_message_id); return NextResponse.json({ ok: true, messageId }); }
  catch (e: any) { return NextResponse.json({ ok: false, messageId, error: String(e?.message ?? e) }, { status: 502 }); }
}
