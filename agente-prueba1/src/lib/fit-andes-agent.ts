import OpenAI from "openai";
import { createCatalogImage } from "./catalog-image";
import {
  createWhatsAppOrder,
  deliveryOptions,
  orderStatus,
  productDetail,
  productMeasurements,
  publicPolicies,
  searchCatalog,
  uploadPaymentProof,
  type WhatsAppProduct as Product,
  type WhatsAppVariant as Variant
} from "./fit-andes-api";
import {
  getSalesContext,
  latestPendingWhatsAppOrder,
  saveSalesContext,
  saveWhatsAppOrder,
  setMode,
  setWhatsAppOrderStatus,
  type SalesContext
} from "./db";
import { downloadWhatsAppMedia, sendImageBuffer, sendImageMessage, sendTextMessage } from "./meta/client";
import { getSystemPrompt } from "./system-prompt";

type Context = { phone: string; name: string | null; conversationId: number; messageId: string };
type ModelOption = {
  numero: number;
  productoId: string;
  nombre: string;
  modelo: string;
  categoria?: string;
  precioVenta?: number;
  tallasDisponibles: string[];
  varianteRepresentativa: Variant;
};
type VariantOption = {
  numero: number;
  productoId: string;
  nombre: string;
  modelo: string;
  precioVenta?: number;
  variante: Variant;
};

const ownerPhone = "59167113105";

const tools: any[] = [
  {
    type: "function",
    function: {
      name: "buscar_modelos",
      description: "Busca modelos en el catálogo y envía el collage de modelos disponibles con stock real. Requiere categoría (Chompas, Poleras, Ruanas) o término de búsqueda. La talla es opcional; si se especifica, solo incluye modelos que tengan esa talla disponible. Úsala al presentar catálogo o ante búsquedas de prendas, NO para responder dudas informativas sobre medidas o tallas.",
      parameters: {
        type: "object",
        properties: {
          categoria: { type: "string", description: "Categoría del producto: Chompas, Poleras o Ruanas." },
          talla: { type: "string", description: "Talla solicitada (ej. 'M', 'L', 'XL'). Opcional." },
          color: { type: "string", description: "Color solicitado (ej. 'azul', 'marino', 'negro', 'plomo')." },
          q: { type: "string", description: "Estilo, tipo de cuello, modelo u otro término de búsqueda." },
          minPrecio: { type: "number", description: "Precio mínimo en Bs." },
          maxPrecio: { type: "number", description: "Precio máximo en Bs." },
          limit: { type: "number", description: "Límite de resultados a mostrar (default: 5, máx: 20)." }
        },
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "buscarPrendas",
      description: "Alias oficial de búsqueda rápida de prendas con fotos optimizadas de Cloudinary y stock real disponible.",
      parameters: {
        type: "object",
        properties: {
          q: { type: "string", description: "Término o modelo (ej. 'cuello V', 'alpaca clásica')" },
          color: { type: "string", description: "Color solicitado (ej. 'azul', 'marino', 'negro')" },
          talla: { type: "string", description: "Talla buscada (ej. 'S', 'M', 'L', 'XL')" },
          minPrecio: { type: "number", description: "Precio mínimo en Bs" },
          maxPrecio: { type: "number", description: "Precio máximo en Bs" },
          limit: { type: "number", description: "Límite de resultados (default: 5)" }
        },
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "consultar_medidas",
      description: "Obtiene las medidas exactas en centímetros (ancho de pecho, hombros, largo total, largo de mangas) de un modelo para asesorar al cliente como sastre experto sobre qué talla elegir según su contextura o estatura.",
      parameters: {
        type: "object",
        properties: {
          productoId: { type: "string", description: "ID del producto retornado en la búsqueda." }
        },
        required: ["productoId"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "consultarMedidas",
      description: "Alias oficial para consultar medidas anatómicas por talla de un producto para asesoría de tallas.",
      parameters: {
        type: "object",
        properties: {
          productoId: { type: "string", description: "ID del producto retornado en buscarPrendas." }
        },
        required: ["productoId"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "obtener_variantes_modelo",
      description: "Después de que el cliente elija un modelo para comprar o ver sus colores, obtiene y envía el collage de sus variantes disponibles en la talla indicada. Si la talla solicitada no está disponible en este modelo, NO envía collage y devuelve las tallas que sí hay.",
      parameters: {
        type: "object",
        properties: {
          productoId: { type: "string", description: "ID del producto." },
          talla: { type: "string", description: "Talla a filtrar. Opcional." }
        },
        required: ["productoId"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "consultar_detalles_modelo",
      description: "Consulta los detalles de un modelo (tallas disponibles, colores con stock, precios, medidas) SIN enviar imágenes ni collages. Úsala cuando el cliente pregunte qué tallas tiene un modelo, qué colores hay, o dudas sobre características, para responderle por texto.",
      parameters: {
        type: "object",
        properties: {
          productoId: { type: "string", description: "ID del producto a consultar." }
        },
        required: ["productoId"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "seleccionar_variante",
      description: "Valida la variante elegida contra los datos actuales y guarda la selección exacta antes de preguntar cantidad.",
      parameters: {
        type: "object",
        properties: {
          productoId: { type: "string" },
          varianteId: { type: "string" },
          talla: { type: "string" }
        },
        required: ["productoId", "varianteId"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "verificar_stock",
      description: "Consulta nuevamente el producto en la base real y verifica el stock disponible para la variante exacta y cantidad solicitada. Úsala siempre antes de confirmar cantidad o continuar la compra.",
      parameters: {
        type: "object",
        properties: {
          productoId: { type: "string" },
          varianteId: { type: "string" },
          talla: { type: "string" },
          cantidad: { type: "integer", minimum: 1 }
        },
        required: ["productoId", "varianteId", "cantidad"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "ver_opciones_entrega",
      description: "Obtiene puntos de recojo en La Paz (estaciones de teleférico, tiendas), horarios habilitados y empresas de envío interdepartamental.",
      parameters: { type: "object", properties: {}, additionalProperties: false }
    }
  },
  {
    type: "function",
    function: {
      name: "consultarOpcionesEntrega",
      description: "Alias oficial para consultar puntos de recojo y empresas de encomienda habilitadas.",
      parameters: { type: "object", properties: {}, additionalProperties: false }
    }
  },
  {
    type: "function",
    function: {
      name: "enviar_foto_producto",
      description: "Envía al cliente una foto individual de una variante ya consultada.",
      parameters: {
        type: "object",
        properties: {
          productoId: { type: "string" },
          varianteId: { type: "string" }
        },
        required: ["productoId", "varianteId"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "crear_pedido",
      description: "Crea el pedido formal de compra, aparta el stock del cliente con vencimiento a fin de día (La Paz UTC-4) y emite el QR BancoSol si aplica. En envío nacional paymentMethod debe ser QR; en punto de encuentro admite EFECTIVO o QR.",
      parameters: {
        type: "object",
        properties: {
          customerName: { type: "string" },
          paymentMethod: { type: "string", enum: ["QR", "EFECTIVO"] },
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                productoId: { type: "string" },
                varianteId: { type: "string" },
                cantidad: { type: "integer", minimum: 1 }
              },
              required: ["productoId", "varianteId", "cantidad"],
              additionalProperties: false
            }
          },
          delivery: {
            type: "object",
            properties: {
              method: { type: "string", enum: ["PICKUP_POINT", "SHIPPING_NATIONAL"] },
              scheduledFor: { type: "string", description: "Fecha u hora programada en formato ISO con zona -04:00 (ej: 2026-10-25T16:00:00-04:00)" },
              pickupPointId: { type: "string" },
              pickupScheduleId: { type: "string" },
              department: { type: "string" },
              city: { type: "string" },
              shippingCompanyId: { type: "string" },
              branch: { type: "string" },
              recipientName: { type: "string" },
              recipientCi: { type: "string" },
              phone: { type: "string" }
            },
            required: ["method", "scheduledFor", "recipientName", "phone"],
            additionalProperties: false
          },
          notes: { type: "string" }
        },
        required: ["items", "delivery", "paymentMethod"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "crearPedidoWhatsApp",
      description: "Alias oficial para la creación de pedido con reserva de stock e instrucciones de pago QR BancoSol.",
      parameters: {
        type: "object",
        properties: {
          customerName: { type: "string" },
          paymentMethod: { type: "string", enum: ["QR", "EFECTIVO"] },
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                productoId: { type: "string" },
                varianteId: { type: "string" },
                cantidad: { type: "integer", minimum: 1 }
              },
              required: ["productoId", "varianteId", "cantidad"]
            }
          },
          delivery: { type: "object" },
          notes: { type: "string" }
        },
        required: ["items", "delivery", "paymentMethod"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "consultar_pedido",
      description: "Consulta el estado actual de preparación, pago o entrega de un pedido existente.",
      parameters: {
        type: "object",
        properties: {
          numeroPedido: { type: "string", description: "Código del pedido (ej. 'P-261020-001')" },
          phone: { type: "string", description: "Número de teléfono del cliente (opcional si se consulta en su propio chat)" }
        },
        required: ["numeroPedido"],
        additionalProperties: false
      }
    }
  },
  {
    type: "function",
    function: {
      name: "rastrearPedido",
      description: "Alias oficial para rastrear estado de pedido por número y celular.",
      parameters: {
        type: "object",
        properties: {
          numeroPedido: { type: "string", description: "Código del pedido (ej. 'P-261020-001')" },
          phone: { type: "string", description: "Número de teléfono del cliente" }
        },
        required: ["numeroPedido"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "consultar_politicas",
      description: "Consulta las políticas oficiales de Fit Andes (cambios, devoluciones, envíos y términos legales).",
      parameters: { type: "object", properties: {}, additionalProperties: false }
    }
  },
  {
    type: "function",
    function: {
      name: "cancelar_compra",
      description: "Limpia la selección y carrito temporal de la conversación cuando el cliente cancela o decide empezar otra compra.",
      parameters: { type: "object", properties: {}, additionalProperties: false }
    }
  },
  {
    type: "function",
    function: {
      name: "derivar_humano",
      description: "Deriva la conversación a un asesor humano si el cliente lo solicita o hay una excepción.",
      parameters: {
        type: "object",
        properties: {
          motivo: { type: "string" }
        },
        required: ["motivo"],
        additionalProperties: false
      }
    }
  }
];

function client() {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY no configurada");
  return new OpenAI({ apiKey: key, baseURL: "https://openrouter.ai/api/v1" });
}

function parse(value: string | undefined) {
  try {
    return value ? JSON.parse(value) : {};
  } catch {
    return {};
  }
}

function unwrapProduct(result: any): Product {
  return (result?.data ?? result) as Product;
}

function availableStock(variant: Variant) {
  return variant.stockDisponible ?? ((variant.stock ?? 0) - (variant.stockReservado ?? 0));
}

function isAvailable(variant: Variant) {
  return availableStock(variant) > 0;
}

function normalizeSize(s: string): string {
  return s.trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function parseSizes(size?: string | null): string[] {
  if (!size) return [];
  let trimmed = size.trim().toUpperCase().replace(/^TALLAS?\s*:?\s*/i, "");
  if (!trimmed || ["TODAS", "CUALQUIERA", "TODOS", "TODAS LAS TALLAS", "ALL"].includes(trimmed)) return [];
  return trimmed
    .split(/[,/;\-|]|\s+O\s+|\s+Y\s+/i)
    .map((s) => s.trim().replace(/^TALLA\s*:?\s*/i, ""))
    .filter(Boolean);
}

function matchesSize(variant: Variant, size?: string | null): boolean {
  if (!size) return true;
  const targetSizes = parseSizes(size).map(normalizeSize);
  if (!targetSizes.length) return true;
  const rawVariantSize = String(variant.talla ?? "");
  if (!rawVariantSize.trim()) return false;
  const variantSizes = parseSizes(rawVariantSize).map(normalizeSize);
  const normalizedVariant = normalizeSize(rawVariantSize);
  return targetSizes.some((t) => variantSizes.includes(t) || normalizedVariant === t);
}

function getAvailableSizes(product: Product): string[] {
  const sizes = (product.variantes ?? [])
    .filter((v) => isAvailable(v) && v.talla)
    .map((v) => String(v.talla).trim().toUpperCase());
  return Array.from(new Set(sizes));
}

function secondVariantImage(variant: Variant): string | undefined {
  return variant.imagenes?.[1] || variant.imagen || variant.imagenes?.[0];
}

function modelName(product: Product) {
  return product.modelo?.trim() || product.nombre;
}

function variantLabel(variant: Variant) {
  return [variant.color, variant.colorSecundario, variant.talla && `Talla ${variant.talla}`].filter(Boolean).join(" · ");
}

function contextForPrompt(state: SalesContext) {
  const safe = { ...state };
  return Object.keys(safe).length ? `\n\nContexto comercial persistente (interno): ${JSON.stringify(safe)}. Usa sus IDs únicamente para llamar herramientas; jamás los muestres al cliente.` : "";
}

async function notifyOwner(text: string) {
  try {
    await sendTextMessage(ownerPhone, text);
  } catch (error) {
    console.error("[fit-andes] no se pudo notificar al asesor:", error);
  }
}

async function sendCollage(phone: string, options: { number: number; imageUrl: string; label: string }[], caption: string) {
  if (!options.length) return false;
  await sendImageBuffer(phone, await createCatalogImage(options), caption);
  return true;
}

async function buscarModelos(args: any, ctx: Context) {
  const singleSizes = parseSizes(args.talla);
  const products = await searchCatalog({
    categoria: args.categoria,
    color: args.color,
    q: args.q,
    minPrecio: args.minPrecio,
    maxPrecio: args.maxPrecio,
    limit: args.limit ?? 20,
    ...(singleSizes.length === 1 ? { talla: singleSizes[0] } : {})
  });
  const allProducts = products as Product[];

  const models: ModelOption[] = allProducts.flatMap((product) => {
    const representative = product.variantes?.find((variant) => matchesSize(variant, args.talla) && isAvailable(variant));
    if (!representative) return [];
    return [{
      numero: 0,
      productoId: product.productoId || product._id,
      nombre: product.nombre,
      modelo: modelName(product),
      categoria: product.categoria,
      precioVenta: product.precioVenta,
      tallasDisponibles: getAvailableSizes(product),
      varianteRepresentativa: representative
    }];
  }).slice(0, 10).map((model, index) => ({ ...model, numero: index + 1 }));

  if (args.talla && models.length === 0) {
    const categorySizes = Array.from(new Set(allProducts.flatMap((p) => getAvailableSizes(p))));
    return {
      catalogoEnviado: false,
      disponibleEnTalla: false,
      tallaBuscada: args.talla,
      categoria: args.categoria || "catálogo",
      tallasDisponibles: categorySizes,
      modelos: [],
      mensaje: `No hay modelos disponibles en talla ${args.talla}. Las tallas disponibles son: ${categorySizes.join(", ") || "agotado temporalmente"}. Explica esto al cliente por texto y pregúntale si desea ver alguna de esas tallas disponibles.`
    };
  }

  const sent = await sendCollage(
    ctx.phone,
    models.flatMap((model) => {
      const imageUrl = secondVariantImage(model.varianteRepresentativa);
      return imageUrl ? [{ number: model.numero, imageUrl, label: `${model.modelo}${model.precioVenta !== undefined ? ` · Bs ${model.precioVenta}` : ""}` }] : [];
    }),
    `Modelos de ${args.categoria || "Fit Andes"} disponibles${args.talla ? ` (Talla ${args.talla})` : ""}: responde con el número o nombre del modelo que prefieras.`
  );

  const state: SalesContext = {
    category: args.categoria,
    size: args.talla,
    filters: Object.fromEntries(Object.entries({ color: args.color, q: args.q }).filter(([, value]) => typeof value === "string" && value.trim())),
    models,
    variants: [],
    selectedModel: undefined,
    selectedVariant: undefined,
    quantity: undefined,
    stage: "AWAIT_MODEL"
  };
  await saveSalesContext(ctx.conversationId, state);

  return {
    catalogoEnviado: sent,
    tallaFiltrada: args.talla || null,
    modelos: models.map(({ varianteRepresentativa, ...model }) => ({
      ...model,
      varianteRepresentativa: {
        color: varianteRepresentativa.color,
        talla: varianteRepresentativa.talla,
        stockDisponible: availableStock(varianteRepresentativa)
      }
    }))
  };
}

async function consultarMedidas(args: any, ctx: Context) {
  try {
    const data = await productMeasurements(args.productoId);
    return data;
  } catch (error) {
    console.warn("[fit-andes-agent] Fallback en consultarMedidas:", error);
    const product = unwrapProduct(await productDetail(args.productoId));
    return {
      productoId: product.productoId || product._id,
      nombre: product.nombre,
      modelo: modelName(product),
      categoria: product.categoria,
      tallas: (product.variantes ?? []).map((v) => ({
        talla: v.talla,
        coloresDisponibles: [v.color].filter(Boolean),
        medidas: v.medidasResumen || (v as any).medidas || null
      }))
    };
  }
}

async function obtenerVariantesModelo(args: any, ctx: Context) {
  const state = await getSalesContext(ctx.conversationId);
  const product = unwrapProduct(await productDetail(args.productoId));
  const sizeFilter = args.talla || state.size;

  const availableVariants = (product.variantes ?? []).filter((variant) => isAvailable(variant));
  const availableSizes = Array.from(new Set(
    availableVariants.map((v) => String(v.talla ?? "").trim().toUpperCase()).filter(Boolean)
  ));

  const matching = sizeFilter
    ? availableVariants.filter((variant) => matchesSize(variant, sizeFilter))
    : availableVariants;

  if (sizeFilter && !matching.length) {
    return {
      catalogoEnviado: false,
      disponibleEnTalla: false,
      tallaBuscada: sizeFilter,
      tallasDisponibles: availableSizes,
      modelo: { productoId: product.productoId || product._id, nombre: product.nombre, modelo: modelName(product), precioVenta: product.precioVenta },
      mensaje: `El modelo ${modelName(product)} no está disponible en talla ${sizeFilter}. Las tallas disponibles para este modelo son: ${availableSizes.join(", ") || "agotado"}. Explica esto al cliente por texto y pregúntale si prefiere ver alguna de esas tallas disponibles o buscar otros modelos en talla ${sizeFilter}.`
    };
  }

  const variants: VariantOption[] = matching.map((variant, index) => ({
    numero: index + 1,
    productoId: product.productoId || product._id,
    nombre: product.nombre,
    modelo: modelName(product),
    precioVenta: product.precioVenta,
    variante: variant
  }));

  const sent = await sendCollage(
    ctx.phone,
    variants.flatMap((option) => {
      const imageUrl = secondVariantImage(option.variante);
      return imageUrl ? [{ number: option.numero, imageUrl, label: variantLabel(option.variante) }] : [];
    }),
    `Variantes de ${modelName(product)}${sizeFilter ? ` (Talla ${sizeFilter})` : ""}: responde con el número o color que prefieras.`
  );

  await saveSalesContext(ctx.conversationId, {
    ...state,
    size: sizeFilter || state.size,
    selectedModel: { productoId: product.productoId || product._id, nombre: product.nombre, modelo: modelName(product), precioVenta: product.precioVenta },
    variants,
    selectedVariant: undefined,
    quantity: undefined,
    stage: "AWAIT_VARIANT"
  });

  return {
    catalogoEnviado: sent,
    tallaFiltrada: sizeFilter || null,
    modelo: { productoId: product.productoId || product._id, nombre: product.nombre, modelo: modelName(product), precioVenta: product.precioVenta, tallasDisponibles: availableSizes },
    variantes: variants.map(({ variante, ...option }) => ({
      ...option,
      variante: {
        color: variante.color,
        colorSecundario: variante.colorSecundario,
        talla: variante.talla,
        descripcion: variante.descripcion,
        stockDisponible: availableStock(variante)
      }
    }))
  };
}

async function consultarDetallesModelo(args: any, ctx: Context) {
  let measurements: any = null;
  try {
    measurements = await productMeasurements(args.productoId);
  } catch {
    // Si no está disponible, se continúa sin medidas anatómicas
  }
  const product = unwrapProduct(await productDetail(args.productoId));
  const availableVariants = (product.variantes ?? []).filter((v) => isAvailable(v));
  const availableSizes = Array.from(new Set(
    availableVariants.map((v) => String(v.talla ?? "").trim().toUpperCase()).filter(Boolean)
  ));
  const colors = Array.from(new Set(
    availableVariants.map((v) => [v.color, v.colorSecundario].filter(Boolean).join(" con ")).filter(Boolean)
  ));

  return {
    productoId: product.productoId || product._id,
    nombre: product.nombre,
    modelo: modelName(product),
    categoria: product.categoria,
    precioVenta: product.precioVenta,
    tallasDisponibles: availableSizes,
    coloresDisponibles: colors,
    totalVariantesDisponibles: availableVariants.length,
    medidasAnatomicas: measurements?.tallas || null,
    variantes: availableVariants.map((v) => ({
      varianteId: v.varianteId,
      color: v.color,
      colorSecundario: v.colorSecundario,
      talla: v.talla,
      stockDisponible: availableStock(v),
      medidasResumen: v.medidasResumen
    }))
  };
}

async function seleccionarVariante(args: any, ctx: Context) {
  const state = await getSalesContext(ctx.conversationId);
  const product = unwrapProduct(await productDetail(args.productoId));
  const variant = product.variantes?.find((item) => item.varianteId === args.varianteId && (!args.talla || matchesSize(item, args.talla))) ?? product.variantes?.find((item) => item.varianteId === args.varianteId);
  if (!variant) return { ok: false, message: "La variante elegida ya no existe. Muestra nuevamente las variantes." };
  if (!isAvailable(variant)) return { ok: false, message: "La variante elegida se agotó. Muestra las otras variantes disponibles del mismo modelo." };
  const selected = { productoId: product.productoId || product._id, varianteId: variant.varianteId, nombre: product.nombre, modelo: modelName(product), precioVenta: product.precioVenta, color: variant.color, colorSecundario: variant.colorSecundario, talla: variant.talla, descripcion: variant.descripcion, stockDisponible: availableStock(variant) };
  await saveSalesContext(ctx.conversationId, { ...state, size: variant.talla ?? state.size, selectedVariant: selected, quantity: undefined, stage: "AWAIT_QUANTITY" });
  return { ok: true, variante: selected };
}

async function verificarStock(args: any, ctx: Context) {
  const state = await getSalesContext(ctx.conversationId);
  const product = unwrapProduct(await productDetail(args.productoId));
  const variant = product.variantes?.find((item) => item.varianteId === args.varianteId && (!args.talla || matchesSize(item, args.talla))) ?? product.variantes?.find((item) => item.varianteId === args.varianteId);
  if (!variant) return { ok: false, message: "La variante ya no existe.", disponible: 0 };
  const disponible = availableStock(variant);
  const suficiente = disponible >= args.cantidad;
  const selected = { productoId: product.productoId || product._id, varianteId: variant.varianteId, nombre: product.nombre, modelo: modelName(product), precioVenta: product.precioVenta, color: variant.color, colorSecundario: variant.colorSecundario, talla: variant.talla, descripcion: variant.descripcion, stockDisponible: disponible };
  await saveSalesContext(ctx.conversationId, { ...state, size: variant.talla ?? state.size, selectedVariant: selected, quantity: args.cantidad, stage: suficiente ? "AWAIT_DELIVERY" : "AWAIT_QUANTITY" });
  return { ok: true, suficiente, solicitada: args.cantidad, disponible, producto: selected, precioUnitario: product.precioVenta, total: (product.precioVenta ?? 0) * args.cantidad };
}

async function crearPedido(args: any, ctx: Context) {
  const deliveryMethod = args.delivery?.method;
  const paymentMethod = deliveryMethod === "SHIPPING_NATIONAL" ? "QR" : args.paymentMethod;
  if (paymentMethod !== "QR" && paymentMethod !== "EFECTIVO") {
    return { ok: false, message: "Método de pago no válido. Usa QR o EFECTIVO." };
  }

  const body = {
    idempotencyKey: ctx.messageId,
    customer: {
      phone: ctx.phone,
      name: args.customerName ?? ctx.name ?? undefined
    },
    items: args.items,
    paymentMethod,
    delivery: {
      ...args.delivery,
      phone: args.delivery?.phone || ctx.phone,
      recipientName: args.delivery?.recipientName || args.customerName || ctx.name || "Cliente"
    },
    notes: args.notes ?? "Cliente atendido por WhatsApp"
  };

  const order = await createWhatsAppOrder(body);

  if (paymentMethod === "QR" && order.pagoId) {
    await saveWhatsAppOrder(ctx.conversationId, {
      numeroPedido: order.numeroPedido,
      pagoId: order.pagoId,
      estado: order.estado
    });
  }

  if (paymentMethod === "QR" && order.paymentInstructions?.qrImageUrl) {
    const bank = order.paymentInstructions.bank || "BancoSol";
    const holder = order.paymentInstructions.accountHolder || "Fernando Leon Andrade Gutierrez";
    const caption = `QR ${bank} · Pedido #${order.numeroPedido}\nTitular: ${holder}\nTotal: Bs ${order.total}\n\n${order.paymentInstructions.message || "Realiza el pago por QR y envía aquí la captura de tu comprobante."}`;
    await sendImageMessage(ctx.phone, order.paymentInstructions.qrImageUrl, caption);
  }

  if (order.notification?.text) {
    await notifyOwner(order.notification.text);
  }

  const state = await getSalesContext(ctx.conversationId);
  await saveSalesContext(ctx.conversationId, { ...state, stage: "ORDER_CREATED" });

  return {
    numeroPedido: order.numeroPedido,
    pedidoId: order.pedidoId,
    pagoId: order.pagoId,
    subtotal: order.subtotal,
    costoEnvio: order.costoEnvio,
    total: order.total,
    estado: order.estado,
    vencimientoReserva: order.vencimientoReserva,
    metodoPago: paymentMethod,
    banco: order.paymentInstructions?.bank || "BancoSol",
    titular: order.paymentInstructions?.accountHolder || "Fernando Leon Andrade Gutierrez",
    qrEnviado: paymentMethod === "QR" && Boolean(order.paymentInstructions?.qrImageUrl),
    instrucciones: order.paymentInstructions?.message || "Realiza el pago por QR y envía aquí la captura de tu comprobante."
  };
}

async function runTool(name: string, args: any, ctx: Context) {
  if (name === "buscar_modelos" || name === "buscarPrendas") return buscarModelos(args, ctx);
  if (name === "consultar_medidas" || name === "consultarMedidas") return consultarMedidas(args, ctx);
  if (name === "obtener_variantes_modelo") return obtenerVariantesModelo(args, ctx);
  if (name === "consultar_detalles_modelo") return consultarDetallesModelo(args, ctx);
  if (name === "seleccionar_variante") return seleccionarVariante(args, ctx);
  if (name === "verificar_stock") return verificarStock(args, ctx);
  if (name === "ver_opciones_entrega" || name === "consultarOpcionesEntrega") return deliveryOptions();
  if (name === "enviar_foto_producto") {
    const product = unwrapProduct(await productDetail(args.productoId));
    const variant = product.variantes?.find((item) => item.varianteId === args.varianteId);
    const image = variant && secondVariantImage(variant);
    if (!image) return { ok: false, message: "No hay imagen disponible para esa variante." };
    await sendImageMessage(ctx.phone, image, `${product.nombre} · ${variantLabel(variant)}`);
    return { ok: true, message: "Foto enviada al cliente." };
  }
  if (name === "crear_pedido" || name === "crearPedidoWhatsApp") return crearPedido(args, ctx);
  if (name === "consultar_pedido" || name === "rastrearPedido") {
    const phone = args.phone || ctx.phone;
    return orderStatus(args.numeroPedido, phone);
  }
  if (name === "consultar_politicas") return publicPolicies();
  if (name === "cancelar_compra") {
    await saveSalesContext(ctx.conversationId, {});
    return { ok: true, message: "Compra temporal cancelada." };
  }
  if (name === "derivar_humano") {
    await setMode(ctx.conversationId, "HUMAN");
    await notifyOwner(`Atención humana solicitada por ${ctx.name ?? ctx.phone} (${ctx.phone}). Motivo: ${args.motivo}`);
    return { ok: true, message: "Conversación derivada al asesor humano." };
  }
  return { ok: false, message: `Herramienta desconocida: ${name}` };
}

export async function respondToFitAndes(history: { role: string; content: string }[], ctx: Context) {
  const state = await getSalesContext(ctx.conversationId);
  const activePrompt = await getSystemPrompt();
  const messages: any[] = [
    { role: "system", content: `${activePrompt}${contextForPrompt(state)}` },
    ...history.map((message) => ({ role: message.role === "user" ? "user" : "assistant", content: message.content }))
  ];
  let collageSentInTurn = false;

  for (let round = 0; round < 6; round++) {
    const model = getOpenRouterModel();
    let completion: any;
    try {
      completion = await client().chat.completions.create({
        model,
        messages,
        tools,
        tool_choice: "auto"
      });
    } catch (err: any) {
      if (
        model !== DEFAULT_MODEL &&
        (err?.status === 404 || err?.message?.includes("no provider serves this model"))
      ) {
        console.warn(
          `[agent] Modelo ${model} no disponible en OpenRouter. Reintentando con ${DEFAULT_MODEL}...`
        );
        completion = await client().chat.completions.create({
          model: DEFAULT_MODEL,
          messages,
          tools,
          tool_choice: "auto"
        });
      } else {
        throw err;
      }
    }
    const message: any = completion.choices[0]?.message;
    if (!message) throw new Error("OpenRouter no devolvió una respuesta");
    messages.push(message);

    if (!message.tool_calls?.length) {
      const text = message.content?.trim() || "";
      if (collageSentInTurn) {
        const isGenericPresentation =
          !text ||
          /^(¡?(aquí|aca|te muestro|te comparto|estos son|estas son|revisa|mira|claro|por supuesto|a continuación|te presento)[^.?!]*([.?!]|$)\s*)+$/i.test(text);
        if (isGenericPresentation) {
          return "";
        }
      }
      return text || (collageSentInTurn ? "" : "Déjame derivarte con un asesor humano.");
    }

    for (const call of message.tool_calls) {
      let result: any;
      try {
        result = await runTool(call.function.name, parse(call.function.arguments), ctx);
        if (result && typeof result === "object" && (result as any).catalogoEnviado === true) {
          collageSentInTurn = true;
        }
      } catch (error) {
        result = { ok: false, message: error instanceof Error ? error.message : "No se pudo consultar el sistema" };
      }
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(result) });
    }
  }
  return "Estoy verificando los detalles con el sistema. Un asesor te ayudará enseguida.";
}

export async function registerPaymentProof(ctx: Context, mediaId: string) {
  const order = await latestPendingWhatsAppOrder(ctx.conversationId);
  if (!order) {
    return "No encuentro un pedido pendiente de pago en este chat. Envíame primero el número de pedido o pide ayuda a un asesor.";
  }
  const media = await downloadWhatsAppMedia(mediaId);
  const result = await uploadPaymentProof(order.pago_id, media.bytes, media.mimeType);
  await setWhatsAppOrderStatus(order.numero_pedido, "PROOF_UPLOADED");
  if (result.notification?.text) {
    await notifyOwner(result.notification.text);
  }
  return `¡Listo! Registramos tu comprobante del pedido *${order.numero_pedido}*. Un asesor validará el pago y te confirmará por este medio.`;
}

export async function registerPaymentProofFromBytes(
  ctx: Context,
  bytes: ArrayBuffer,
  mimeType: string
) {
  const order = await latestPendingWhatsAppOrder(ctx.conversationId);
  if (!order) {
    return "Recibimos tu comprobante de pago, pero no encontramos ningún pedido pendiente de pago en este chat. Por favor envíanos tu número de pedido (ej. P-261020-001) para asociarlo, o un asesor te ayudará enseguida.";
  }
  const result = await uploadPaymentProof(order.pago_id, bytes, mimeType);
  await setWhatsAppOrderStatus(order.numero_pedido, "PROOF_UPLOADED");
  if (result.notification?.text) {
    await notifyOwner(result.notification.text);
  }
  return `¡Listo! Registramos tu comprobante del pedido *${order.numero_pedido}*. Un asesor validará el pago y te confirmará por este medio.`;
}
