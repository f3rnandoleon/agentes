import OpenAI from "openai";
import { DEFAULT_MODEL, getOpenRouterModel } from "./openrouter";

export type ClothingDetails = {
  color?: string;
  tipoPrenda?: string;
  tipoCuello?: string;
  patron?: string;
  descripcion?: string;
};

export type PaymentProofDetails = {
  banco?: string;
  monto?: number;
  referencia?: string;
};

export type VisionResult = {
  tipo: "COMPROBANTE" | "PRENDA" | "OTRO";
  confianza: number;
  detallesPrenda?: ClothingDetails;
  detallesComprobante?: PaymentProofDetails;
  descripcionGeneral?: string;
};

function getOpenAIClient(): OpenAI {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY no configurada");
  return new OpenAI({
    apiKey: key,
    baseURL: "https://openrouter.ai/api/v1"
  });
}

/**
 * Analiza la imagen recibida por WhatsApp usando un modelo con visión (GPT-4o-mini o Gemini).
 * Clasifica si es un comprobante de pago bancario/QR, una consulta sobre una prenda de vestir, u otra imagen.
 */
export async function analyzeIncomingImage(
  bytes: ArrayBuffer,
  mimeType: string
): Promise<VisionResult> {
  try {
    const base64 = Buffer.from(bytes).toString("base64");
    const safeMime = mimeType && mimeType.startsWith("image/") ? mimeType : "image/jpeg";
    const dataUrl = `data:${safeMime};base64,${base64}`;

    const client = getOpenAIClient();
    const model = getOpenRouterModel();

    const requestPayload = (modelName: string) => ({
      model: modelName,
      messages: [
        {
          role: "system" as const,
          content: `Eres un asistente clasificador y estilista experto de Fit Andes, una tienda de ropa en Bolivia (especializada en chompas de alpaca, poleras, ruanas y ropa de invierno).
Tu tarea es analizar detalladamente una imagen enviada por un cliente en WhatsApp y determinar cuál de las siguientes tres categorías describe mejor la imagen:

1. COMPROBANTE: Es una captura de pantalla, recibo o comprobante de pago/transferencia bancaria (ej. QR Simple, BancoSol, BCP, Banco Unión, BNB, etc.).
2. PRENDA: Es una fotografía de una prenda de vestir (chompa, suéter, chaleco, ruana, polera, abrigo, etc.) que el cliente muestra porque busca comprar algo igual o similar.
3. OTRO: Cualquier otra imagen (selfie, paisaje, meme, documento que no sea pago, foto borrosa o irreconocible).

Debes responder ÚNICAMENTE con un JSON válido con la siguiente estructura exacta:
{
  "tipo": "COMPROBANTE" | "PRENDA" | "OTRO",
  "confianza": 0.0 a 1.0,
  "detallesPrenda": {
    "color": "color principal (ej. azul, negro, plomo, beige, verde, blanco)",
    "tipoPrenda": "ej. chompa, chaleco, ruana, polera",
    "tipoCuello": "ej. redondo, V, tortuga, bote",
    "patron": "ej. liso, trenzado, rayas, bordado",
    "descripcion": "descripción sintética de la prenda"
  },
  "detallesComprobante": {
    "banco": "nombre del banco si es visible",
    "monto": null o número,
    "referencia": "número de transacción o referencia si es visible"
  },
  "descripcionGeneral": "breve descripción textual de la imagen"
}`
        },
        {
          role: "user" as const,
          content: [
            {
              type: "text" as const,
              text: "Clasifica y analiza esta imagen enviada por el cliente:"
            },
            {
              type: "image_url" as const,
              image_url: {
                url: dataUrl
              }
            }
          ]
        }
      ],
      max_tokens: 450,
      response_format: { type: "json_object" as const }
    });

    let response: any;
    try {
      response = await client.chat.completions.create(requestPayload(model));
    } catch (err: any) {
      if (
        model !== DEFAULT_MODEL &&
        (err?.status === 404 || err?.message?.includes("no provider serves this model"))
      ) {
        console.warn(
          `[vision] Modelo ${model} no disponible en OpenRouter. Reintentando visión con ${DEFAULT_MODEL}...`
        );
        response = await client.chat.completions.create(requestPayload(DEFAULT_MODEL));
      } else {
        throw err;
      }
    }

    const raw = response.choices[0]?.message?.content?.trim();
    if (!raw) {
      throw new Error("Respuesta vacía del modelo de visión");
    }

    const parsed = JSON.parse(raw);
    return {
      tipo: parsed.tipo === "COMPROBANTE" || parsed.tipo === "PRENDA" ? parsed.tipo : "OTRO",
      confianza: typeof parsed.confianza === "number" ? parsed.confianza : 0.8,
      detallesPrenda: parsed.detallesPrenda,
      detallesComprobante: parsed.detallesComprobante,
      descripcionGeneral: parsed.descripcionGeneral || ""
    };
  } catch (error) {
    console.error("[vision] Error analizando imagen:", error);
    return {
      tipo: "OTRO",
      confianza: 0.3,
      descripcionGeneral: "No se pudo clasificar automáticamente la imagen"
    };
  }
}
