import { NextRequest, NextResponse } from "next/server";
import { processWebhookPayload } from "@/lib/meta/handler";
import { verifySignature } from "@/lib/meta/verify";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) { const u=new URL(req.url); if(u.searchParams.get("hub.mode")==="subscribe"&&u.searchParams.get("hub.verify_token")===process.env.META_VERIFY_TOKEN) return new NextResponse(u.searchParams.get("hub.challenge")??"",{status:200,headers:{"Content-Type":"text/plain"}}); return new NextResponse("forbidden",{status:403}); }
export async function POST(req: NextRequest) { const raw=await req.text(); if(!verifySignature(raw,req.headers.get("x-hub-signature-256"),process.env.META_APP_SECRET??"")) return new NextResponse("invalid signature",{status:401}); let payload:unknown; try{payload=JSON.parse(raw);}catch{return new NextResponse("bad json",{status:400});} void processWebhookPayload(payload).catch((e)=>console.error("[webhook] error procesando:",e)); return NextResponse.json({ok:true}); }
