import { NextResponse } from "next/server";
import { getPhoneNumberInfo } from "@/lib/meta/client";
export const dynamic="force-dynamic";
export async function GET(){const required=["META_ACCESS_TOKEN","META_PHONE_NUMBER_ID","META_APP_SECRET","META_VERIFY_TOKEN"];const missing=required.filter(k=>!process.env[k]);if(missing.length)return NextResponse.json({status:"missing_config",missing},{headers:{"Cache-Control":"no-store"}});try{const i=await getPhoneNumberInfo();return NextResponse.json({status:"connected",phone:i.display_phone_number,verified_name:i.verified_name,quality:i.quality_rating},{headers:{"Cache-Control":"no-store"}})}catch(e:any){return NextResponse.json({status:"error",message:String(e?.message??e)},{headers:{"Cache-Control":"no-store"}})}}
