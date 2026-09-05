import { NextResponse } from "next/server";
import { getConversationById, setMode, type Mode } from "@/lib/db";
export async function POST(req:Request,{params}:{params:Promise<{conversationId:string}>}){const id=Number((await params).conversationId), c=getConversationById(id), mode=(await req.json()).mode as Mode;if(!c)return NextResponse.json({error:"not found"},{status:404});if(mode!=="AI"&&mode!=="HUMAN")return NextResponse.json({error:"modo inválido"},{status:400});setMode(id,mode);return NextResponse.json({ok:true,mode})}
