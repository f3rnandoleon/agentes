import { NextResponse } from "next/server";
import { deleteConversation } from "@/lib/db";
export async function DELETE(_req:Request,{params}:{params:Promise<{conversationId:string}>}){const id=Number((await params).conversationId);if(!Number.isInteger(id))return NextResponse.json({error:"id inválido"},{status:400});deleteConversation(id);return NextResponse.json({ok:true})}
