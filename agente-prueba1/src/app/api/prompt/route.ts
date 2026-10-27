import { NextResponse } from "next/server";
import { getPromptMetadata, saveSystemPrompt, resetSystemPrompt } from "@/lib/system-prompt";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const metadata = await getPromptMetadata();
    return NextResponse.json(metadata, {
      headers: { "Cache-Control": "no-store, max-age=0" }
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Error al obtener el System Prompt" },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { prompt } = body;

    if (typeof prompt !== "string" || !prompt.trim()) {
      return NextResponse.json(
        { error: "El contenido del System Prompt es requerido y no puede estar vacío." },
        { status: 400 }
      );
    }

    const result = await saveSystemPrompt(prompt);
    const metadata = await getPromptMetadata();

    return NextResponse.json({
      success: true,
      updatedAt: result.updatedAt,
      isCustom: metadata.isCustom,
      prompt: metadata.prompt
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Error al guardar el System Prompt" },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    const defaultPrompt = await resetSystemPrompt();
    return NextResponse.json({
      success: true,
      prompt: defaultPrompt,
      isCustom: false,
      updatedAt: Date.now()
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Error al restablecer el System Prompt" },
      { status: 500 }
    );
  }
}
