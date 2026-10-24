const baseUrl = () => {
  const envUrl = process.env.CONTROL_VENTAS_URL || process.env.CENTRAL_API_URL || "https://control-ventas-azure.vercel.app";
  const trimmed = envUrl.replace(/\/+$/, "");
  return trimmed.endsWith("/api") ? trimmed : `${trimmed}/api`;
};

function key() {
  const value = process.env.WHATSAPP_INTEGRATION_API_KEY || process.env.CENTRAL_WHATSAPP_SERVICE_KEY;
  if (!value) {
    throw new Error("WHATSAPP_INTEGRATION_API_KEY o CENTRAL_WHATSAPP_SERVICE_KEY no configurada");
  }
  return value;
}

async function request(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${key()}`);
  headers.set("Accept", "application/json");

  if (init.body && !headers.has("Content-Type") && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers,
    cache: "no-store"
  });

  const raw = await response.text();
  let data: unknown;
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    data = { message: raw };
  }

  if (!response.ok) {
    const message = typeof data === "object" && data && "message" in data ? String(data.message) : raw;
    throw new Error(`Sistema central ${response.status}: ${message}`);
  }

  return data as any;
}

export type WhatsAppVariant = {
  varianteId: string;
  color?: string;
  colorSecundario?: string | null;
  talla?: string;
  stockDisponible?: number;
  stock?: number;
  stockReservado?: number;
  precioVenta?: number;
  descripcion?: string;
  imagen?: string;
  imagenes?: string[];
  medidasResumen?: {
    anchoPecho?: number;
    largoTotal?: number;
  };
};

export type WhatsAppProduct = {
  _id: string;
  productoId: string;
  nombre: string;
  modelo?: string;
  categoria?: string;
  precioVenta?: number;
  descripcionCorta?: string;
  variantes?: WhatsAppVariant[];
  variantesDisponibles?: WhatsAppVariant[];
};

export function normalizeProduct(p: any): WhatsAppProduct {
  const id = p.productoId || p._id || "";
  const rawVariants = p.variantesDisponibles || p.variantes || [];
  const variantes: WhatsAppVariant[] = rawVariants.map((v: any) => ({
    varianteId: v.varianteId,
    color: v.color,
    colorSecundario: v.colorSecundario ?? null,
    talla: v.talla,
    stockDisponible: v.stockDisponible ?? (v.stock !== undefined ? v.stock - (v.stockReservado ?? 0) : 0),
    stock: v.stock ?? v.stockDisponible ?? 0,
    stockReservado: v.stockReservado ?? 0,
    precioVenta: v.precioVenta ?? p.precioVenta,
    imagen: v.imagen || v.imagenes?.[0],
    imagenes: v.imagenes || (v.imagen ? [v.imagen] : []),
    medidasResumen: v.medidasResumen || (v.medidas ? {
      anchoPecho: v.medidas.anchoPecho,
      largoTotal: v.medidas.largoTotal
    } : undefined),
    descripcion: v.descripcion
  }));

  return {
    _id: id,
    productoId: id,
    nombre: p.nombre,
    modelo: p.modelo || p.nombre,
    categoria: p.categoria,
    precioVenta: p.precioVenta,
    descripcionCorta: p.descripcionCorta,
    variantes,
    variantesDisponibles: variantes
  };
}

/**
 * 3.1 Búsqueda rápida y compacta con fotos optimizadas de Cloudinary
 * Endpoint oficial: GET /api/integrations/whatsapp/products/search
 */
export async function searchWhatsAppProducts(filters: {
  q?: string;
  color?: string;
  talla?: string;
  minPrecio?: number;
  maxPrecio?: number;
  limit?: number;
}): Promise<{ total: number; productos: WhatsAppProduct[] }> {
  const params = new URLSearchParams();
  if (filters.q?.trim()) params.set("q", filters.q.trim());
  if (filters.color?.trim()) params.set("color", filters.color.trim());
  if (filters.talla?.trim()) params.set("talla", filters.talla.trim());
  if (filters.minPrecio !== undefined) params.set("minPrecio", String(filters.minPrecio));
  if (filters.maxPrecio !== undefined) params.set("maxPrecio", String(filters.maxPrecio));
  if (filters.limit !== undefined) params.set("limit", String(Math.min(Math.max(filters.limit, 1), 20)));

  const res = await request(`/integrations/whatsapp/products/search?${params}`);
  const rawList = Array.isArray(res) ? res : res.productos ?? res.data ?? [];
  const normalized = rawList.map(normalizeProduct);

  return {
    total: typeof res.total === "number" ? res.total : normalized.length,
    productos: normalized
  };
}

/**
 * Búsqueda combinada: utiliza el endpoint especializado de WhatsApp y cuenta con fallback
 */
export async function searchCatalog(filters: Record<string, unknown>): Promise<WhatsAppProduct[]> {
  try {
    const qParts: string[] = [];
    if (typeof filters.categoria === "string" && filters.categoria.trim()) {
      qParts.push(filters.categoria.trim());
    }
    if (typeof filters.q === "string" && filters.q.trim()) {
      qParts.push(filters.q.trim());
    }

    const { productos } = await searchWhatsAppProducts({
      q: qParts.join(" ").trim() || undefined,
      color: typeof filters.color === "string" ? filters.color : undefined,
      talla: typeof filters.talla === "string" ? filters.talla : undefined,
      minPrecio: typeof filters.minPrecio === "number" ? filters.minPrecio : undefined,
      maxPrecio: typeof filters.maxPrecio === "number" ? filters.maxPrecio : undefined,
      limit: typeof filters.limit === "number" ? filters.limit : 20
    });

    if (productos.length > 0) return productos;
  } catch (error) {
    console.warn("[fit-andes-api] Error en endpoint whatsapp/products/search, intentando fallback:", error);
  }

  // Fallback a catálogo público estándar si el endpoint especializado no devuelve o falla
  const params = new URLSearchParams({ soloDisponible: "true", limit: "50" });
  for (const [key, value] of Object.entries(filters)) {
    if (typeof value === "string" && value.trim()) params.set(key, value.trim());
    else if (typeof value === "number") params.set(key, String(value));
  }

  const result = await request(`/productos/publicos?${params}`);
  const list = Array.isArray(result) ? result : result.data ?? [];
  return list.map(normalizeProduct);
}

/**
 * 3.2 Consulta de Medidas Anatómicas y Tallas
 * Endpoint oficial: GET /api/integrations/whatsapp/products/:id/measurements
 */
export async function productMeasurements(productId: string) {
  return request(`/integrations/whatsapp/products/${encodeURIComponent(productId)}/measurements`);
}

/**
 * Detalle público de producto con todas las fotos y variantes
 */
export async function productDetail(productId: string) {
  const result = await request(`/productos/publicos/${encodeURIComponent(productId)}`);
  return normalizeProduct(result?.data ?? result);
}

/**
 * Búsqueda directa por código de prenda (código de barras, QR o SKU)
 */
export async function productByCode(code: string) {
  const result = await request(`/productos/by-code/${encodeURIComponent(code)}`);
  return normalizeProduct(result?.data ?? result);
}

/**
 * 3.6 Puntos de Recojo y Opciones de Entrega
 * Endpoint oficial: GET /api/delivery-options
 */
export async function deliveryOptions() {
  return request("/delivery-options");
}

/**
 * 3.3 Crear Pedido y Reserva con QR BancoSol
 * Endpoint oficial: POST /api/integrations/whatsapp/orders
 */
export async function createWhatsAppOrder(body: unknown) {
  return request("/integrations/whatsapp/orders", {
    method: "POST",
    body: JSON.stringify(body)
  });
}

/**
 * 3.5 Rastrear Estado de Pedido por Celular
 * Endpoint oficial: GET /api/integrations/whatsapp/orders/:id?phone=...
 */
export async function orderStatus(number: string, phone: string) {
  return request(`/integrations/whatsapp/orders/${encodeURIComponent(number)}?phone=${encodeURIComponent(phone)}`);
}

/**
 * 3.4 Subida de Comprobante de Pago
 * Endpoint oficial: POST /api/integrations/whatsapp/payments/:id/proof
 */
export async function uploadPaymentProof(paymentId: string, bytes: ArrayBuffer, mimeType: string) {
  const form = new FormData();
  form.set("file", new Blob([bytes], { type: mimeType }), "comprobante.jpg");
  return request(`/integrations/whatsapp/payments/${encodeURIComponent(paymentId)}/proof`, {
    method: "POST",
    body: form
  });
}

/**
 * Políticas públicas y legales de la tienda (cambios, devoluciones, envíos)
 * Endpoint oficial: GET /api/public/politicas
 */
export async function publicPolicies() {
  return request("/public/politicas");
}
