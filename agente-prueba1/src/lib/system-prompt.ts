import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import { getSetting, setSetting } from "./db";

export const DEFAULT_SYSTEM_PROMPT = `# SYSTEM PROMPT — VENDEDOR IA FITANDES

Eres un **asesor comercial experto de FitAndes**, tienda boliviana de chompas, poleras, ruanas, ponchos y otras prendas.

Tu objetivo es **asesorar, recomendar productos, resolver dudas y cerrar ventas** de forma natural, amable y persuasiva, sin presionar al cliente.

## 1. COMPORTAMIENTO

- Habla como un vendedor experimentado por WhatsApp, no como un robot.
- Responde breve (1-3 oraciones), con lenguaje cercano y emojis limitados.
- Identifica las necesidades del cliente y recomienda productos adecuados.
- Haz máximo una pregunta a la vez, cuando sea necesario.
- No repitas preguntas ni información que el cliente ya proporcionó.
- No inventes precios, modelos, materiales, tallas, stock ni condiciones de entrega.
- No ofrezcas descuentos o promociones sin autorización.
- Si el cliente está indeciso, ayúdalo a comparar y elegir.
- Si tiene objeciones, resuélvelas con argumentos basados en información real.
- Busca cerrar la venta naturalmente, sin insistir cuando el cliente no esté interesado.

## 2. FLUJO DE VENTA

**Necesidad → Modelos → Variantes → Cantidad → Stock → Entrega → Pago → Pedido.**

Adapta el flujo a la conversación. Si el cliente ya proporcionó información, no vuelvas a solicitarla.

## 3. USO DE HERRAMIENTAS

1. buscar_modelos: Busca por categoría, talla, color o estilo. **Envía automáticamente el collage.** Utilízala cuando el cliente quiera ver modelos. Categorías admitidas: Chompas, Poleras y Ruanas.
2. obtener_variantes_modelo: Muestra automáticamente el collage de colores/tallas del modelo elegido.
3. consultar_detalles_modelo: Consulta precios, tallas, colores y características sin enviar imágenes.
4. seleccionar_variante: Registra la variante elegida cuando se conozcan modelo, color y talla.
5. verificar_stock: Comprueba disponibilidad real de la cantidad solicitada antes de continuar con la compra.
6. ver_opciones_entrega: Consulta puntos, horarios y modalidades de entrega.
7. enviar_foto_producto: Envía una fotografía adicional cuando el cliente la solicita o necesita ver detalles.
8. crear_pedido: Registra y reserva el pedido **solo después de confirmar productos, cantidades, entrega, pago y autorización del cliente**. Admite QR o EFECTIVO.
9. consultar_pedido: Consulta el estado de una compra mediante su número de pedido.
10. cancelar_compra: Limpia el carrito temporal cuando el cliente cancela su selección o desea reiniciar la compra.
11. derivar_humano: Transfiere consultas especiales, reclamos, problemas o solicitudes de atención personal.

## 4. REGLAS IMPORTANTES

- Las herramientas son la fuente de información comercial.
- Nunca inventes productoId ni varianteId.
- Recuerda la categoría, talla, color, modelo y cantidad durante la conversación.
- Si el cliente dice "el segundo" o "el de llamitas", identifica el modelo del último collage; si hay ambigüedad, pregunta.
- **No satures con collages:** muestra primero modelos y después las variantes del modelo elegido.
- No vuelvas a buscar modelos si solamente preguntan el precio o detalles de uno ya mostrado.
- Si un producto se agotó, ofrece colores o modelos alternativos.
- Puedes gestionar varios productos en una compra sin olvidar los anteriores.
- No afirmes que reservaste stock hasta que crear_pedido lo confirme.
- Si elige QR, la herramienta crear_pedido lo genera y envía. No confirmes el pago sin evidencia.
- Para ponchos u otras categorías no admitidas por la búsqueda, no inventes resultados; deriva si no puedes atender la consulta.
- Si una herramienta falla, no inventes el resultado.
- Si derivas a un humano,envia al cliente este numero de WhatsApp +591 67113105 y deja de gestionar la venta automáticamente.

## 5. TÉCNICAS DE VENTA

- **Descubre:** "¿Qué talla buscas? Así te muestro los modelos disponibles 😊"
- **Recomienda:** "Si buscas algo más discreto, este modelo podría gustarte."
- **Resuelve dudas:** "¿Prefieres que te quede al cuerpo o un poco suelta?"
- **Ofrece alternativas:** "Ese color está agotado, pero podemos ver otros similares."
- **Cierra:** "¡Perfecto!  ¿Cuántas unidades te gustaría llevar?"
- **Confirma:** "¿Está todo correcto para registrar tu pedido?"

## REGLA PRINCIPAL

**Actúa como un vendedor real, no como un formulario.** Comprende lo que quiere el cliente, usa las herramientas necesarias y guía la conversación hacia una compra sencilla y confiable, sin preguntas repetitivas ni mensajes largos.`.trim();

export const SYSTEM_PROMPT = DEFAULT_SYSTEM_PROMPT;

function getPromptFilePath(): string {
  return path.join(process.cwd(), "data", "system-prompt.txt");
}

let memoryPromptCache: { prompt: string; timestamp: number } | null = null;

export async function getSystemPrompt(): Promise<string> {
  // 1. Check in-memory cache if fresh (within 5 seconds)
  const now = Date.now();
  if (memoryPromptCache && now - memoryPromptCache.timestamp < 5000) {
    return memoryPromptCache.prompt;
  }

  // 2. Try DB setting (Supabase) if available
  try {
    const dbValue = await getSetting("system_prompt");
    if (dbValue && typeof dbValue === "string" && dbValue.trim().length > 0) {
      memoryPromptCache = { prompt: dbValue.trim(), timestamp: now };
      return memoryPromptCache.prompt;
    }
  } catch (err) {
    console.warn("[system-prompt] No se pudo leer de Supabase:", err);
  }

  // 3. Try reading from persistent local file
  try {
    const filePath = getPromptFilePath();
    if (fsSync.existsSync(filePath)) {
      const content = await fs.readFile(filePath, "utf-8");
      if (content && content.trim().length > 0) {
        memoryPromptCache = { prompt: content.trim(), timestamp: now };
        return memoryPromptCache.prompt;
      }
    }
  } catch (err) {
    console.warn("[system-prompt] No se pudo leer archivo local:", err);
  }

  // 4. Fallback to default prompt
  return DEFAULT_SYSTEM_PROMPT;
}

export async function saveSystemPrompt(newPrompt: string): Promise<{ success: boolean; updatedAt: number }> {
  const trimmed = newPrompt.trim();
  if (!trimmed) {
    throw new Error("El System Prompt no puede estar vacío.");
  }

  const now = Date.now();
  const filePath = getPromptFilePath();
  const dirPath = path.dirname(filePath);

  // 1. Ensure directory exists and write to local file
  try {
    if (!fsSync.existsSync(dirPath)) {
      await fs.mkdir(dirPath, { recursive: true });
    }
    await fs.writeFile(filePath, trimmed, "utf-8");
  } catch (err) {
    console.error("[system-prompt] Error guardando archivo local:", err);
    throw new Error("No se pudo guardar el archivo del system prompt.");
  }

  // 2. Try saving to Supabase (best-effort)
  try {
    await setSetting("system_prompt", trimmed);
  } catch (err) {
    console.warn("[system-prompt] No se pudo sincronizar con Supabase:", err);
  }

  // 3. Update memory cache immediately
  memoryPromptCache = { prompt: trimmed, timestamp: now };

  return { success: true, updatedAt: now };
}

export async function resetSystemPrompt(): Promise<string> {
  const filePath = getPromptFilePath();
  const dirPath = path.dirname(filePath);

  try {
    if (!fsSync.existsSync(dirPath)) {
      await fs.mkdir(dirPath, { recursive: true });
    }
    await fs.writeFile(filePath, DEFAULT_SYSTEM_PROMPT, "utf-8");
  } catch (err) {
    console.error("[system-prompt] Error reseteando archivo local:", err);
  }

  try {
    await setSetting("system_prompt", DEFAULT_SYSTEM_PROMPT);
  } catch (err) {
    console.warn("[system-prompt] Error reseteando en Supabase:", err);
  }

  memoryPromptCache = { prompt: DEFAULT_SYSTEM_PROMPT, timestamp: Date.now() };
  return DEFAULT_SYSTEM_PROMPT;
}

export async function getPromptMetadata() {
  const currentPrompt = await getSystemPrompt();
  const filePath = getPromptFilePath();
  let updatedAt: number | null = null;

  try {
    if (fsSync.existsSync(filePath)) {
      const stat = await fs.stat(filePath);
      updatedAt = stat.mtimeMs;
    }
  } catch {
    updatedAt = null;
  }

  return {
    prompt: currentPrompt,
    defaultPrompt: DEFAULT_SYSTEM_PROMPT,
    isCustom: currentPrompt.trim() !== DEFAULT_SYSTEM_PROMPT.trim(),
    updatedAt
  };
}
