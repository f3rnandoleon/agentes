import {
  getConversationById,
  getOrCreateConversation,
  getRecentHistory,
  insertMessage,
  markMessageProcessed,
  wasMessageProcessed,
  updateMessageWaId,
  latestPendingWhatsAppOrder
} from "../db";
import { registerPaymentProofFromBytes, respondToFitAndes } from "../fit-andes-agent";
import { downloadWhatsAppMedia, sendTextMessage } from "./client";
import { analyzeIncomingImage } from "../vision";

export async function processWebhookPayload(payload: any) {
  if (payload?.object !== "whatsapp_business_account") return;
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages") continue;
      const value = change.value ?? {};
      for (const s of value.statuses ?? []) {
        console.log(`[webhook] status ${s.status} para ${s.id}`);
      }
      const names = new Map<string, string | null>(
        (value.contacts ?? []).map((c: any): [string, string | null] => [c.wa_id, c.profile?.name ?? null])
      );
      for (const msg of value.messages ?? []) {
        await handleIncomingMessage(msg, names.get(msg.from) ?? null);
      }
    }
  }
}

export async function handleIncomingMessage(msg: any, name: string | null) {
  if (!msg?.id || !msg?.from) return;
  if (msg.type !== "text" && msg.type !== "image") {
    console.log(`[webhook] tipo no soportado: ${msg.type}`);
    return;
  }
  if (await wasMessageProcessed(msg.id)) {
    console.log(`[webhook] mensaje ya procesado previamente: ${msg.id}`);
    return;
  }

  const conversation = await getOrCreateConversation(msg.from, name);
  const ctx = {
    phone: conversation.phone,
    name,
    conversationId: conversation.id,
    messageId: msg.id
  };

  let incomingText = "[Imagen recibida]";
  let downloadedMedia: { bytes: ArrayBuffer; mimeType: string } | null = null;
  let isPaymentProof = false;

  if (msg.type === "text") {
    incomingText = msg.text?.body || "";
  } else if (msg.type === "image") {
    try {
      downloadedMedia = await downloadWhatsAppMedia(msg.image?.id);
      const analysis = await analyzeIncomingImage(downloadedMedia.bytes, downloadedMedia.mimeType);

      if (analysis.tipo === "COMPROBANTE") {
        isPaymentProof = true;
        const banco = analysis.detallesComprobante?.banco ? ` · ${analysis.detallesComprobante.banco}` : "";
        const monto = analysis.detallesComprobante?.monto ? ` · Bs ${analysis.detallesComprobante.monto}` : "";
        incomingText = `[Comprobante de pago recibido${banco}${monto}]`;
      } else if (analysis.tipo === "PRENDA") {
        const d = analysis.detallesPrenda;
        const features = [d?.tipoPrenda, d?.color && `color ${d.color}`, d?.tipoCuello, d?.patron && `patrón ${d.patron}`]
          .filter(Boolean)
          .join(", ");
        incomingText = `[Foto de prenda enviada por cliente: ${features || "prenda"}. ${d?.descripcion || ""}]`;
      } else {
        // Si no se clasificó como comprobante pero hay una orden pendiente de pago y no es claramente ropa, verificar
        const pendingOrder = await latestPendingWhatsAppOrder(conversation.id);
        if (pendingOrder && !analysis.detallesPrenda?.tipoPrenda) {
          isPaymentProof = true;
          incomingText = "[Comprobante de pago recibido]";
        } else {
          incomingText = `[Imagen recibida: ${analysis.descripcionGeneral || "Foto enviada por el cliente"}]`;
        }
      }
    } catch (err) {
      console.error("[handler] Error procesando imagen recibida:", err);
      incomingText = "[Imagen recibida]";
    }
  }

  await insertMessage(conversation.id, "user", incomingText, msg.id);
  await markMessageProcessed(msg.id);

  const fresh = await getConversationById(conversation.id);
  if (!fresh || fresh.mode !== "AI") return;

  const started = Date.now();
  let reply = "";

  if (msg.type === "image" && isPaymentProof && downloadedMedia) {
    reply = await registerPaymentProofFromBytes(ctx, downloadedMedia.bytes, downloadedMedia.mimeType);
  } else {
    reply = await respondToFitAndes(await getRecentHistory(conversation.id), ctx);
  }

  console.log(`[wh] atención Fit Andes en ${Date.now() - started}ms`);

  if (!reply || !reply.trim()) {
    console.log(`[wh] respuesta de texto vacía (collage enviado con su pie de foto), no se envía texto adicional.`);
    return;
  }

  const replyId = await insertMessage(conversation.id, "assistant", reply);
  const sent = await sendTextMessage(conversation.phone, reply);
  await updateMessageWaId(replyId, sent.wa_message_id);
  console.log(`[wh] enviado a ${conversation.phone} (wamid: ${sent.wa_message_id})`);
}
