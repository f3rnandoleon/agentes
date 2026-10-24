# 🤖 MANUAL DE INTEGRACIÓN Y GUÍA DE ENDPOINTS PARA EL AGENTE IA DE WHATSAPP
**Sistema Central:** Fit Andes (`control-ventas`)  
**Audiencia:** Desarrolladores e integradores del Bot / Agente Inteligente de WhatsApp.  
**Propósito:** Documento de referencia técnica completa con todas las APIs que el agente puede invocar para buscar prendas, asesorar tallas, reservar stock, emitir cobros QR y rastrear pedidos.

---

## 📑 Índice de Contenidos
1. [Autenticación y Cabeceras Obligatorias](#1-autenticación-y-cabeceras-obligatorias)
2. [Entornos y Variables de Configuración](#2-entornos-y-variables-de-configuración)
3. [Familia de Endpoints del Agente](#3-familia-de-endpoints-del-agente)
   - [3.1 Búsqueda Rápida y Compacta con Fotos (`GET /search`)](#31-búsqueda-rápida-y-compacta-con-fotos-get-apiintegrationswhatsappproductssearch)
   - [3.2 Consulta de Medidas Anatómicas y Tallas (`GET /measurements`)](#32-consulta-de-medidas-anatómicas-y-tallas-get-apiintegrationswhatsappproductsidmeasurements)
   - [3.3 Crear Pedido y Reserva con QR BancoSol (`POST /orders`)](#33-crear-pedido-y-reserva-con-qr-bancosol-post-apiintegrationswhatsapporders)
   - [3.4 Subida de Comprobante de Pago (`POST /payments/:id/proof`)](#34-subida-de-comprobante-de-pago-post-apiintegrationswhatsapppaymentsidproof)
   - [3.5 Rastrear Estado de Pedido por Celular (`GET /orders/:id`)](#35-rastrear-estado-de-pedido-por-celular-get-apiintegrationswhatsappordersnumeropedido)
   - [3.6 Puntos de Recojo y Opciones de Entrega (`GET /delivery-options`)](#36-puntos-de-recojo-y-opciones-de-entrega-get-apidelivery-options)
4. [Especificación de Tools para el LLM (JSON Schema)](#4-especificación-de-tools-para-el-llm-json-schema)
5. [Estrategia para Fotos Enviadas por Clientes](#5-estrategia-para-fotos-enviadas-por-clientes)
6. [Manejo de Errores y Códigos HTTP](#6-manejo-de-errores-y-códigos-http)

---

## 1. Autenticación y Cabeceras Obligatorias

Todos los endpoints bajo `/api/integrations/whatsapp/*` están asegurados con una clave estática de alta seguridad mediante comparación de tiempo constante (`timingSafeEqual`).

### Cabecera Requerida:
```http
Authorization: Bearer <WHATSAPP_INTEGRATION_API_KEY>
Content-Type: application/json
Accept: application/json
```

> ⚠️ **Importante:** Si el encabezado no comienza con `Bearer ` o el token no coincide exactamente con el configurado en el servidor, la API responderá inmediatamente con `HTTP 401 Unauthorized`:
> ```json
> { "message": "No autorizado" }
> ```

---

## 2. Entornos y Variables de Configuración

En el archivo `.env` de tu proyecto del **Agente**, define:

```env
# Entorno Local
CONTROL_VENTAS_URL=http://localhost:3000

# Entorno Producción (Vercel)
# CONTROL_VENTAS_URL=https://control-ventas-azure.vercel.app

# Clave Secreta de Integración (debe coincidir con .env.local de control-ventas)
WHATSAPP_INTEGRATION_API_KEY=fit_andes_wa_secret_key_2026_fghgsegbvvbdsfe
```

---

## 3. Familia de Endpoints del Agente

```mermaid
flowchart TD
    Agent[Agente IA de WhatsApp]

    subgraph "1. Preventa y Descubrimiento"
        Search["GET /api/integrations/whatsapp/products/search\n(Búsqueda, Colores, Tallas, Stock y Fotos)"]
        Measure["GET /api/integrations/whatsapp/products/:id/measurements\n(Medidas corporales para asesorar tallas)"]
        Delivery["GET /api/delivery-options\n(Puntos de recojo y transportadoras)"]
    end

    subgraph "2. Venta y Cierre"
        Order["POST /api/integrations/whatsapp/orders\n(Reserva de stock y QR de cobro BancoSol)"]
        Proof["POST /api/integrations/whatsapp/payments/:id/proof\n(Subir captura de comprobante)"]
    end

    subgraph "3. Postventa"
        Status["GET /api/integrations/whatsapp/orders/:id?phone=...\n(Rastreo de estado del pedido)"]
    end

    Agent --> Search
    Agent --> Measure
    Agent --> Delivery
    Agent --> Order
    Agent --> Proof
    Agent --> Status
```

---

### 3.1 Búsqueda Rápida y Compacta con Fotos (`GET /api/integrations/whatsapp/products/search`)
Diseñado para responder en **menos de 50ms**. Devuelve un JSON ultra compacto (ahorra el 80% de tokens del LLM) conteniendo únicamente prendas activas cuyas variantes tienen **stock web real disponible (`stockDisponible > 0`)**.

* **Método:** `GET`
* **Ruta:** `/api/integrations/whatsapp/products/search`
* **Query Params:**
  * `q` *(string, opcional)*: Texto libre o modelo (ej. `alpaca`, `cuello V`, `trenzado`).
  * `color` *(string, opcional)*: Color buscado (ej. `azul`, `marino`, `negro`). Coincide con color primario o secundario.
  * `talla` *(string, opcional)*: Talla solicitada (`S`, `M`, `L`, `XL`).
  * `minPrecio` *(number, opcional)*: Precio mínimo en Bs.
  * `maxPrecio` *(number, opcional)*: Precio máximo en Bs.
  * `limit` *(number, opcional, default: 5, máx: 20)*: Cantidad máxima de prendas a retornar.

#### Ejemplo de Petición cURL:
```bash
curl -X GET "https://control-ventas-azure.vercel.app/api/integrations/whatsapp/products/search?color=azul&talla=M" \
  -H "Authorization: Bearer fit_andes_wa_secret_key_..."
```

#### Respuesta Exitosa (`HTTP 200`):
```json
{
  "total": 1,
  "productos": [
    {
      "productoId": "670e10a2f1b4c90012345678",
      "nombre": "Chompa Cuello V",
      "modelo": "Alpaca Clásica",
      "categoria": "Chompas",
      "precioVenta": 140,
      "descripcionCorta": "Chompa tejida con lana de alpaca suave, abrigadora y liviana para clima frío.",
      "variantesDisponibles": [
        {
          "varianteId": "var-alp-az-m",
          "color": "Azul Marino",
          "colorSecundario": null,
          "talla": "M",
          "stockDisponible": 4,
          "precioVenta": 140,
          "imagen": "https://res.cloudinary.com/dq1jeikev/image/upload/f_auto,q_auto,w_800/v1728864000/chompa-azul-m.jpg",
          "medidasResumen": {
            "anchoPecho": 54,
            "largoTotal": 68
          }
        }
      ]
    }
  ]
}
```

> ⚡ **Optimización Automática de Imágenes:**  
> Las URLs de imágenes en Cloudinary se transforman en el backend inyectando `f_auto,q_auto,w_800/`. Esto reduce el peso del archivo a menos de 80 KB manteniendo una nitidez impecable, asegurando una descarga inmediata en conexiones celulares en Bolivia.

---

### 3.2 Consulta de Medidas Anatómicas y Tallas (`GET /api/integrations/whatsapp/products/:id/measurements`)
Permite al bot responder como un sastre experto cuando el cliente tiene dudas sobre la talla (ej. *"¿La talla M me quedará bien si mido 1.75m y peso 70kg?"*).

* **Método:** `GET`
* **Ruta:** `/api/integrations/whatsapp/products/:productoId/measurements`

#### Ejemplo de Petición cURL:
```bash
curl -X GET "https://control-ventas-azure.vercel.app/api/integrations/whatsapp/products/670e10a2f1b4c90012345678/measurements" \
  -H "Authorization: Bearer fit_andes_wa_secret_key_..."
```

#### Respuesta Exitosa (`HTTP 200`):
```json
{
  "productoId": "670e10a2f1b4c90012345678",
  "nombre": "Chompa Cuello V",
  "modelo": "Alpaca Clásica",
  "categoria": "Chompas",
  "tallas": [
    {
      "talla": "M",
      "coloresDisponibles": ["Azul Marino", "Negro"],
      "medidas": {
        "anchoPecho": 54,
        "anchoHombros": 46,
        "largoTotal": 68,
        "largoMangaAxila": 50,
        "largoMangaHombro": 62
      }
    },
    {
      "talla": "L",
      "coloresDisponibles": ["Azul Marino"],
      "medidas": {
        "anchoPecho": 58,
        "anchoHombros": 49,
        "largoTotal": 72,
        "largoMangaAxila": 52,
        "largoMangaHombro": 64
      }
    }
  ]
}
```

---

### 3.3 Crear Pedido y Reserva con QR BancoSol (`POST /api/integrations/whatsapp/orders`)
Crea un pedido omnicanal con `canal: "WHATSAPP"`, reserva automáticamente el stock en el almacén de despacho web y calcula el vencimiento de la reserva para las **23:59:59.999 hora de La Paz (UTC-4)** del día programado.

* **Método:** `POST`
* **Ruta:** `/api/integrations/whatsapp/orders`

#### Cuerpo de la Petición (`JSON` - Caso Recojo en Punto):
```json
{
  "idempotencyKey": "wa-msg-8877665544",
  "customer": {
    "phone": "59167113105",
    "name": "Carlos Mendoza"
  },
  "items": [
    {
      "productoId": "670e10a2f1b4c90012345678",
      "varianteId": "var-alp-az-m",
      "cantidad": 1
    }
  ],
  "paymentMethod": "QR",
  "delivery": {
    "method": "PICKUP_POINT",
    "scheduledFor": "2026-10-25T16:00:00-04:00",
    "pickupPointId": "teleferico-central",
    "pickupScheduleId": "sab-10-14",
    "recipientName": "Carlos Mendoza",
    "phone": "59167113105"
  },
  "notes": "Cliente atendido por WhatsApp"
}
```

#### Cuerpo de la Petición (`JSON` - Caso Envío Nacional):
> 💡 *En envíos nacionales, el costo de flete es automáticamente **Bs 10.00** calculados por el backend.*
```json
{
  "idempotencyKey": "wa-msg-9988771122",
  "customer": {
    "phone": "59178945612",
    "name": "Maria Flores"
  },
  "items": [
    {
      "productoId": "670e10a2f1b4c90012345678",
      "varianteId": "var-alp-az-m",
      "cantidad": 2
    }
  ],
  "paymentMethod": "QR",
  "delivery": {
    "method": "SHIPPING_NATIONAL",
    "scheduledFor": "2026-10-26T10:00:00-04:00",
    "department": "Cochabamba",
    "city": "Cochabamba",
    "shippingCompanyId": "trans-bolivar",
    "branch": "Terminal de Buses Of. 12",
    "recipientName": "Maria Flores",
    "recipientCi": "5487921 CB",
    "phone": "59178945612"
  }
}
```

#### Respuesta Exitosa (`HTTP 201`):
```json
{
  "numeroPedido": "P-261020-001",
  "pedidoId": "670e3500f1b4c90011556677",
  "pagoId": "670e3500f1b4c90011556678",
  "subtotal": 140.00,
  "costoEnvio": 0.00,
  "descuento": 0.00,
  "total": 140.00,
  "estado": "PENDING_PAYMENT",
  "vencimientoReserva": "2026-10-26T03:59:59.999Z",
  "paymentInstructions": {
    "method": "QR",
    "bank": "BancoSol",
    "accountHolder": "Fernando Leon Andrade Gutierrez",
    "qrImageUrl": "https://res.cloudinary.com/dq1jeikev/image/upload/v1777964054/comprobante_xvdhuf.jpg",
    "amount": 140.00,
    "message": "Realiza el pago por QR y envía aquí la captura de tu comprobante."
  },
  "notification": {
    "to": "59167113105",
    "type": "NEW_ORDER",
    "text": "📦 *NUEVO PEDIDO DESDE WHATSAPP*\n\n*Pedido:* #P-261020-001\n*Cliente:* Carlos Mendoza (59167113105)\n*Total:* Bs 140.00..."
  }
}
```

---

### 3.4 Subida de Comprobante de Pago (`POST /api/integrations/whatsapp/payments/:id/proof`)
Cuando el cliente envía la captura de su transferencia QR por WhatsApp, el bot reenvía el archivo binario a este endpoint.
* Sube la imagen a Cloudinary en la carpeta `control-ventas/comprobantes`.
* Pone la transacción en estado de revisión.
* Dispara una alerta instantánea por **Telegram** al equipo administrador con el link de aprobación.

* **Método:** `POST`
* **Ruta:** `/api/integrations/whatsapp/payments/:paymentId/proof`
* **Content-Type:** `multipart/form-data`
* **Campo del archivo:** `file` (JPG/PNG, máx 5 MB)

#### Respuesta Exitosa (`HTTP 200`):
```json
{
  "message": "Comprobante registrado exitosamente. El administrador fue notificado para su verificación.",
  "paymentId": "670e3500f1b4c90011556678",
  "urlComprobante": "https://res.cloudinary.com/dq1jeikev/image/upload/v1728864700/control-ventas/comprobantes/wa_comp_8877.jpg",
  "tokenRevision": "8f31b4e5-9012-4c56-8a90-abcdef123456",
  "verifyUrl": "https://control-ventas-azure.vercel.app/verificar/pago/8f31b4e5-9012-4c56-8a90-abcdef123456"
}
```

---

### 3.5 Rastrear Estado de Pedido por Celular (`GET /api/integrations/whatsapp/orders/:numeroPedido`)
Permite responder cuando el cliente pregunta: *"¿En qué estado está mi pedido P-261020-001?"*.

* **Método:** `GET`
* **Ruta:** `/api/integrations/whatsapp/orders/:numeroPedido?phone=59167113105`
* **Parámetro obligatorio:** `phone` (Verificación de privacidad).

#### Respuesta Exitosa (`HTTP 200`):
```json
{
  "numeroPedido": "P-261020-001",
  "createdAt": "2026-10-20T18:30:00.000Z",
  "estadoPedido": "CONFIRMED",
  "estadoPago": "PAID",
  "estadoEntrega": "READY",
  "estadoReservaStock": "CONSUMED",
  "vencimientoReserva": "2026-10-26T03:59:59.999Z",
  "subtotal": 140.00,
  "costoEnvio": 0.00,
  "total": 140.00,
  "items": [
    {
      "nombre": "Chompa Cuello V",
      "color": "Azul Marino",
      "talla": "M",
      "cantidad": 1,
      "precioUnitario": 140.00,
      "totalLinea": 140.00
    }
  ],
  "entrega": {
    "metodo": "PICKUP_POINT",
    "nombreDestinatario": "Carlos Mendoza",
    "telefono": "59167113105",
    "puntoRecojo": "Estación Teleférico Central",
    "programadoPara": "2026-10-25T16:00:00-04:00"
  }
}
```

---

### 3.6 Puntos de Recojo y Opciones de Entrega (`GET /api/delivery-options`)
Endpoint público que informa al agente sobre los lugares de entrega física y empresas de encomienda disponibles.

* **Método:** `GET`
* **Ruta:** `/api/delivery-options`
* **Auth:** No requerida (Público).

#### Respuesta Exitosa (`HTTP 200`):
```json
{
  "pickupPoints": [
    { "id": "teleferico-central", "name": "Estación Teleférico Central (Línea Roja)" },
    { "id": "sucursal-san-miguel", "name": "Sucursal San Miguel (Calle 21)" }
  ],
  "pickupSchedules": [
    { "id": "sab-10-14", "day": "Sábado", "start": "10:00", "end": "14:00" },
    { "id": "mie-14-18", "day": "Miércoles", "start": "14:00", "end": "18:00" }
  ],
  "shippingCompanies": [
    { "id": "trans-bolivar", "name": "Flota Bolívar" },
    { "id": "expreso-el-dorado", "name": "Expreso El Dorado" }
  ]
}
```

---

## 4. Especificación de Tools para el LLM (JSON Schema)

Copia este bloque en tu motor de agente (OpenAI Function Calling, Gemini Tool Calling, LangChain o Vercel AI SDK):

```json
[
  {
    "name": "buscarPrendas",
    "description": "Busca prendas y chompas en Fit Andes filtrando por color, talla, modelo o rango de precio. Retorna únicamente prendas con stock real disponible y sus fotos.",
    "parameters": {
      "type": "object",
      "properties": {
        "q": { "type": "string", "description": "Término o modelo (ej. 'cuello V', 'alpaca clásica')" },
        "color": { "type": "string", "description": "Color solicitado (ej. 'azul', 'marino', 'negro')" },
        "talla": { "type": "string", "description": "Talla buscada (ej. 'S', 'M', 'L', 'XL')" },
        "minPrecio": { "type": "number", "description": "Precio mínimo en Bs" },
        "maxPrecio": { "type": "number", "description": "Precio máximo en Bs" },
        "limit": { "type": "number", "description": "Límite de resultados (default: 5)" }
      }
    }
  },
  {
    "name": "consultarMedidas",
    "description": "Obtiene las medidas exactas en centímetros (ancho de pecho, hombros, largo total) de un modelo para asesorar al cliente sobre qué talla elegir según su contextura o estatura.",
    "parameters": {
      "type": "object",
      "properties": {
        "productoId": { "type": "string", "description": "ID del producto retornado en buscarPrendas" }
      },
      "required": ["productoId"]
    }
  },
  {
    "name": "crearPedidoWhatsApp",
    "description": "Crea la orden formal de compra, aparta el stock del cliente y retorna el código QR de BancoSol con las instrucciones de pago.",
    "parameters": {
      "type": "object",
      "properties": {
        "idempotencyKey": { "type": "string", "description": "Identificador único del mensaje de compra" },
        "customer": {
          "type": "object",
          "properties": {
            "phone": { "type": "string" },
            "name": { "type": "string" }
          },
          "required": ["phone"]
        },
        "items": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "productoId": { "type": "string" },
              "varianteId": { "type": "string" },
              "cantidad": { "type": "number" }
            },
            "required": ["productoId", "varianteId", "cantidad"]
          }
        },
        "paymentMethod": { "type": "string", "enum": ["QR"] },
        "delivery": { "type": "object" },
        "notes": { "type": "string" }
      },
      "required": ["idempotencyKey", "customer", "items", "paymentMethod", "delivery"]
    }
  },
  {
    "name": "rastrearPedido",
    "description": "Consulta el estado actual de preparación, pago o entrega de un pedido existente.",
    "parameters": {
      "type": "object",
      "properties": {
        "numeroPedido": { "type": "string", "description": "Código del pedido (ej. 'P-261020-001')" },
        "phone": { "type": "string", "description": "Número de teléfono del cliente (obligatorio)" }
      },
      "required": ["numeroPedido", "phone"]
    }
  },
  {
    "name": "consultarOpcionesEntrega",
    "description": "Consulta los puntos de recojo habilitados en La Paz (estaciones de teleférico, tiendas) con sus días y horarios, y las empresas de envío interdepartamental disponibles.",
    "parameters": {
      "type": "object",
      "properties": {}
    }
  }
]
```

---

## 5. Estrategia para Fotos Enviadas por Clientes

Cuando el cliente envíe una imagen por WhatsApp:
1. **Paso 1 (Visión):** El Agente envía la imagen a un modelo con visión (**GPT-4o-mini** o **Gemini 1.5 Flash**) con este System Prompt:
   > *"Eres un estilista experto de Fit Andes. Analiza esta imagen de ropa y extrae un JSON con las siguientes claves: `color` (color principal), `tipoPrenda` (ej. chompa, chaleco), `tipoCuello` (ej. redondo, V, tortuga) y `patron` (liso, trenzado, rayas)."*
2. **Paso 2 (Invocación):** Con la respuesta (ej. `{ color: "azul", tipoCuello: "cuello V" }`), el agente invoca automáticamente la Tool:
   ```typescript
   await buscarPrendas({
     color: "azul",
     q: "cuello V"
   });
   ```
3. **Paso 3 (Respuesta con Foto Oficial):** La API de `control-ventas` responderá con los modelos que sí tienen stock y sus fotos de Cloudinary. El bot responde:
   > *"¡Excelente elección! 🧥 Tenemos este modelo muy similar en azul:*  
   > ***Chompa Alpaca Clásica Cuello V (Bs 140)***  
   > *(Envía la foto oficial recibida de la API)*  
   > *Nos quedan 4 unidades en talla M. ¿Te gustaría apartarla?"*

---

## 6. Manejo de Errores y Códigos HTTP

| Código HTTP | Causa | Formato de Respuesta |
| :--- | :--- | :--- |
| **`400 Bad Request`** | Parámetros inválidos o error de validación Zod. | `{ "message": "Datos invalidos", "errors": [...] }` |
| **`401 Unauthorized`** | Token Bearer faltante o inválido. | `{ "message": "No autorizado" }` |
| **`404 Not Found`** | Producto o Pedido no encontrado. | `{ "message": "Producto no encontrado" }` |
| **`409 Conflict`** | Stock insuficiente al intentar reservar. | `{ "message": "Stock insuficiente...", "code": "INSUFFICIENT_STOCK" }` |
| **`429 Too Many Requests`** | Límite de peticiones excedido (Rate Limit). | `{ "message": "Demasiadas solicitudes. Inténtalo más tarde." }` |
