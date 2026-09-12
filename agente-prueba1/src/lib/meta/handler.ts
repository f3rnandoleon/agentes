import { getConversationById, getOrCreateConversation, getRecentHistory, insertMessage, markMessageProcessed, wasMessageProcessed, updateMessageWaId } from "../db";
import { registerPaymentProof, respondToFitAndes } from "../fit-andes-agent";
import { sendTextMessage } from "./client";

export async function processWebhookPayload(payload: any) { if(payload?.object!=="whatsapp_business_account") return; for(const entry of payload.entry??[]) for(const change of entry.changes??[]) { if(change.field!=="messages") continue; const value=change.value??{}; for(const s of value.statuses??[]) console.log(`[webhook] status ${s.status} para ${s.id}`); const names=new Map<string,string|null>((value.contacts??[]).map((c:any):[string,string|null]=>[c.wa_id,c.profile?.name??null])); for(const msg of value.messages??[]) await handleIncomingMessage(msg,names.get(msg.from)??null); } }
export async function handleIncomingMessage(msg:any, name:string|null) {
  if(!msg?.id||!msg?.from) return;
  if(msg.type!=="text"&&msg.type!=="image") { console.log(`[webhook] tipo no soportado: ${msg.type}`); return; }
  if(await wasMessageProcessed(msg.id)) return;
  await markMessageProcessed(msg.id);
  const conversation=await getOrCreateConversation(msg.from,name);
  const incoming=msg.type==="text"?msg.text?.body:"[Imagen recibida]";
  await insertMessage(conversation.id,"user",incoming,msg.id);
  const fresh=await getConversationById(conversation.id);
  if(!fresh||fresh.mode!=="AI") return;
  const started=Date.now();
  const reply=msg.type==="image" ? await registerPaymentProof({phone:conversation.phone,name,conversationId:conversation.id,messageId:msg.id},msg.image?.id) : await respondToFitAndes(await getRecentHistory(conversation.id),{phone:conversation.phone,name,conversationId:conversation.id,messageId:msg.id});
  console.log(`[wh] atención Fit Andes en ${Date.now()-started}ms`);
  const replyId=await insertMessage(conversation.id,"assistant",reply);
  const sent=await sendTextMessage(conversation.phone,reply);
  await updateMessageWaId(replyId,sent.wa_message_id);
  console.log(`[wh] enviado a ${conversation.phone} (wamid: ${sent.wa_message_id})`);
}
