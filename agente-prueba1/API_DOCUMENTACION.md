# Documentacion API - Control Ventas

**Estado del documento:** actualizado al 20 de julio de 2026.

La referencia primaria para el inventario de rutas es `src/app/api/**/route.ts`. Los contratos de datos se validan con los esquemas de `src/schemas` y la persistencia se implementa con los modelos de `src/models`.

## Proposito

Este documento describe la API actual del proyecto `control-ventas` tal como esta implementada hoy en el repositorio.

Esta guia esta pensada para tres consumidores:

- Web publica de clientes
- Dashboard web interno (`ADMIN` y `VENDEDOR`)
- App movil o cliente externo que consuma la API via JWT Bearer

Objetivos del documento:

- dar un mapa confiable de endpoints y permisos
- documentar payloads y respuestas principales
- alinear integraciones web y movil con el backend real
- dejar claro que contratos son publicos y cuales son internos

## Arquitectura general

La API esta construida sobre Next.js App Router, con endpoints en `src/app/api/**`, y organizada por dominios:

- `auth`
- `catalog`
- `cart`
- `clientes`
- `orders/pedidos`
- `payments/pagos`
- `fulfillment/entregas`
- `delivery-options`
- `inventory/inventario`
- `pos`
- `reports`
- `ops`
- `audit`

Modelo central de negocio actual:

- `Pedido` es la entidad unificada para venta y order legacy
- `TransaccionPago` representa el estado financiero
- `Entrega` representa el estado logistico
- `DeliveryOptions` representa la configuracion editable de puntos de encuentro, horarios y envios nacionales

## Base URL

Entornos tipicos:

- Desarrollo: `http://localhost:3000/api`
- Produccion: `https://control-ventas-azure.vercel.app/api`

La API actualmente es **unversionada**.

Recomendacion de evolucion:

1. Mantener esta guia como fuente de verdad operativa.
2. Introducir `v1` antes de abrir la API a integradores externos de largo plazo.
3. Publicar luego una especificacion OpenAPI formal.

## Acceso desde web vs movil

### Web interna

El dashboard interno usa `NextAuth` con sesion web.

Caracteristicas:

- cookies `httpOnly`
- proteccion de rutas en `middleware`
- no hace falta mandar manualmente `Authorization` desde el mismo dominio
- el middleware inyecta `x-user-id` y `x-user-role` de forma segura para las APIs

### Web cliente o app movil

La app movil y cualquier cliente desacoplado deben usar JWT Bearer.

Header requerido:

```http
Authorization: Bearer <accessToken>
```

El helper `resolveApiAuth()` sigue esta estrategia:

1. Intenta Bearer token
2. Si no existe, cae al contexto seguro de NextAuth agregado por middleware

Conclusiones practicas:

- Dashboard interno: usar sesion NextAuth
- App movil: usar Bearer token
- Evitar mezclar ambos modos en un mismo cliente salvo necesidad muy clara

## Autenticacion y autorizacion

## Roles

Roles soportados:

- `ADMIN`
- `VENDEDOR`
- `CLIENTE`

## Rutas de autenticacion

| Metodo | Ruta | Uso |
|---|---|---|
| `POST` | `/api/auth/login` | Login JWT por email/password |
| `POST` | `/api/auth/signup` | Registro de clientes |
| `POST` | `/api/auth/google` | Login/registro con Google y JWT |
| `GET/POST` | `/api/auth/[...nextauth]` | Flujo de sesion NextAuth para web |

## Tokens

`/api/auth/login` y `/api/auth/google` devuelven:

- `accessToken`
- `refreshToken`
- `user`

Importante:

- hoy **no existe endpoint de refresh**
- el `refreshToken` no tiene flujo publico de renovacion todavia
- para la app movil, la estrategia actual debe considerar re-login o futura ampliacion del backend

## Matriz de acceso por dominio

| Dominio | CLIENTE | VENDEDOR | ADMIN |
|---|---|---|---|
| Catalogo publico | Si | Si | Si |
| Catalogo interno | No | Si | Si |
| Carrito | Si | No | No |
| Checkout y pedidos propios | Si | No | No |
| Pedidos operativos | No | Si | Si |
| Pagos propios | Si | Si, si le pertenece o lo opera | Si |
| Refund | No | Si | Si |
| Entregas propias (lectura) | Si | Si | Si |
| Entregas operativas | No | Si | Si |
| POS | No | Si | Si |
| Inventario | No | Si | Si |
| Reportes | No | No | Si |
| Usuarios | No | No | Si |
| Ops y auditoria | No | No | Si |

## Rate limiting

El middleware aplica rate limiting en memoria:

| Segmento | Limite |
|---|---:|
| Login / signup / paginas auth | 5 req/min por IP |
| `/api/productos/publicos` | 100 req/min por IP |
| APIs protegidas GET | 60 req/min por usuario |
| APIs protegidas de escritura | 30 req/min por usuario |

Si se supera el limite:

- status `429`
- body: `{ "message": "Demasiadas solicitudes. Intentalo mas tarde." }`
- header: `Retry-After: 60`

## Convenciones transversales

### Formato de datos

- `application/json` para la mayoria de endpoints
- `multipart/form-data` para imagenes y comprobantes
- fechas en ISO 8601
- IDs MongoDB en formato ObjectId cuando aplica

### Error general

```json
{
  "message": "Error al crear pedido desde el carrito"
}
```

Si el error viene de dominio (`AppError`), puede incluir `code`:

```json
{
  "message": "Pedido no encontrado",
  "code": "ALGO_OPCIONAL"
}
```

### Error de validacion (Zod)

Status: `400`

```json
{
  "message": "Datos invalidos",
  "errors": [
    { "field": "email", "message": "Email invalido" },
    { "field": "items.0.cantidad", "message": "La cantidad no puede exceder 1000" }
  ]
}
```

### Request ID

Los endpoints administrativos de ops y auditoria pueden devolver `x-request-id` y/o `requestId`.

Recomendacion:

- si el cliente movil tiene capa propia de networking, mandar `x-request-id` en requests criticas
- usarlo para correlacion con logs

## Variables de entorno relevantes

| Variable | Uso |
|---|---|
| `MONGODB_URL` | Conexion a MongoDB |
| `MONGODB_DNS_SERVERS` | Lista opcional de DNS separados por coma para el script de migracion de opciones de entrega; por defecto `1.1.1.1,8.8.8.8` |
| `JWT_SECRET` | Firma de JWT Bearer |
| `JWT_EXPIRES_IN` | Duracion del access token |
| `NEXTAUTH_SECRET` | Sesiones NextAuth |
| `NEXTAUTH_URL` | URL base web |
| `GOOGLE_CLIENT_ID` | Google OAuth |
| `GOOGLE_CLIENT_SECRET` | Google OAuth |
| `NEXT_PUBLIC_APP_URL` | Base publica para links de verificacion |
| `CLOUDINARY_CLOUD_NAME` | Uploads Cloudinary |
| `CLOUDINARY_API_KEY` | Uploads Cloudinary |
| `CLOUDINARY_API_SECRET` | Uploads Cloudinary |
| `TELEGRAM_BOT_TOKEN` | Notificaciones admin |
| `TELEGRAM_CHAT_ID` | Destino Telegram |
| `CRON_SECRET` | Proteccion del cron de reservas |
| `BACKUP_ENABLED` | Estado de backup en ops |
| `BACKUP_PROVIDER` | Fuente de backup |
| `BACKUP_TARGET` | Destino del backup |
| `BACKUP_RETENTION_DAYS` | Retencion |
| `BACKUP_MAX_AGE_HOURS` | Umbral de alerta |
| `LAST_BACKUP_AT` | Ultimo backup reportado |

## Modelos principales visibles desde API

## Usuario autenticado

```json
{
  "id": "665f...",
  "email": "cliente@correo.com",
  "nombreCompleto": "Cliente Demo",
  "rol": "CLIENTE"
}
```

## Producto

```json
{
  "_id": "665f...",
  "nombre": "Chompa Alpaca",
  "modelo": "Invierno 2026",
  "sku": "CH-001",
  "precioVenta": 120,
  "precioCosto": 70,
  "categoria": "Chompas",
  "descripcion": "Chompa de lana de alpaca premium",
  "marca": "Antigravity",
  "descuento": 0,
  "stockTotal": 10,
  "stockMinimo": 5,
  "totalVendidos": 0,
  "estado": "ACTIVO",
  "variantes": [
    {
      "varianteId": "665f...",
      "color": "Azul",
      "colorSecundario": "Gris",
      "talla": "M",
      "stock": 10,
      "stockReservado": 2,
      "codigoBarra": "123456",
      "qrCode": "QR-123456",
      "descripcion": "Detalles grises en cuello",
      "imagenes": [
        "https://res.cloudinary.com/..."
      ],
      "imagen": "https://res.cloudinary.com/..."
    }
  ]
}
```

## Carrito

```json
{
  "_id": "665f...",
  "cliente": "665f...",
  "items": [
    {
      "_id": "665f...",
      "productoId": "665f...",
      "variante": {
        "varianteId": "665f...",
        "color": "Azul",
        "colorSecundario": "Gris",
        "talla": "M"
      },
      "productoSnapshot": {
        "nombre": "Chompa Alpaca",
        "sku": "CH-001"
      },
      "precioUnitario": 120,
      "cantidad": 2,
      "subtotal": 240
    }
  ],
  "totalArticulos": 2,
  "subtotal": 240
}
```

## Pedido

```json
{
  "_id": "665f...",
  "numeroPedido": "P-20260424-0001",
  "canal": "WEB",
  "estadoPedido": "PENDING_PAYMENT",
  "estadoPago": "PENDING",
  "estadoEntrega": "PENDING",
  "estadoReservaStock": "RESERVED",
  "metodoPago": "QR",
  "subtotal": 240,
  "descuento": 0,
  "total": 240,
  "gananciaTotal": 100,
  "snapshotCliente": {
    "usuarioId": "665f...",
    "nombreCompleto": "Cliente Demo",
    "email": "cliente@correo.com"
  },
  "snapshotEntrega": {
    "metodo": "PICKUP_POINT",
    "puntoRecojo": "Plaza del Estudiante",
    "telefono": "76543210"
  },
  "items": []
}
```

Notas:

- Para `CLIENTE` (catálogo público), la API sanea algunos campos de seguridad: se oculta `precioCosto` del producto, y `codigoBarra` junto con `qrCode` de las variantes.
- Para `CLIENTE`, la API sanea algunos pedidos y oculta costos/ganancias internas.
- Para `ADMIN` y `VENDEDOR`, puede devolver informacion financiera y códigos internos completos.

## TransaccionPago

```json
{
  "_id": "665f...",
  "numeroPago": "P-1713960000000",
  "pedidoId": "665f...",
  "metodoPago": "QR",
  "monto": 240,
  "estado": "PENDING",
  "referenciaExterna": null,
  "urlComprobante": null
}
```

## Entrega

```json
{
  "_id": "665f...",
  "pedidoId": "665f...",
  "numeroPedido": "P-20260424-0001",
  "canal": "WEB",
  "metodo": "PICKUP_POINT",
  "estado": "PENDING",
  "puntoRecojo": "Plaza del Estudiante",
  "telefono": "76543210",
  "codigoSeguimiento": null,
  "nombreTransportista": null
}
```

## Opciones de entrega

Las opciones disponibles durante checkout se almacenan en MongoDB, en la coleccion `deliveryoptions`, como un documento singleton identificado por `key: "default"`.

```json
{
  "key": "default",
  "pickupPoints": [
    {
      "id": "plaza-del-estudiante",
      "name": "Plaza Del Estudiante"
    }
  ],
  "pickupSchedules": [
    {
      "id": "lunes-1200-1800",
      "day": "Lunes",
      "start": "12:00",
      "end": "18:00",
      "label": "Lunes: 12:00-18:00"
    }
  ],
  "shippingCompanies": [
    {
      "id": "bolivar-cargo",
      "name": "BolivarCargo",
      "departments": [
        {
          "name": "Cochabamba",
          "branches": ["Av Melchor"]
        }
      ]
    }
  ],
  "createdAt": "2026-07-20T05:00:00.000Z",
  "updatedAt": "2026-07-20T05:00:00.000Z"
}
```

Notas de persistencia:

- `key` tiene indice unico y evita configuraciones principales duplicadas.
- La API publica no expone `key`, `_id`, `createdAt`, `updatedAt` ni `__v`.
- Los pedidos guardan su seleccion en `Pedido.snapshotEntrega`; cambiar la configuracion no modifica pedidos historicos.
- `data/delivery-options.json` se conserva solamente como fuente para la migracion inicial y no se usa durante las peticiones HTTP.

## Endpoints

## 1. Publicos y de salud

| Metodo | Ruta | Auth | Descripcion |
|---|---|---|---|
| `GET` | `/api/estado` | Publica | Estado del sistema y de MongoDB |
| `GET` | `/api/productos/publicos` | Publica | Catalogo publico |
| `GET` | `/api/productos/publicos/:id` | Publica | Detalle de producto publico |
| `GET` | `/api/delivery-options` | Publica | Puntos, horarios y empresas de entrega |
| `GET` | `/api/verificar/pago/:token` | Token de un solo uso | Vista de verificacion de comprobante |
| `POST` | `/api/verificar/pago/:token/confirm` | Token de un solo uso | Confirma pago QR |
| `POST` | `/api/verificar/pago/:token/reject` | Token de un solo uso | Rechaza pago QR |

> [!IMPORTANT]
> Los endpoints públicos de catálogo (`/api/productos/publicos` y `/api/productos/publicos/:id`) devuelven el listado/detalle de productos sanitizado para el cliente final (`CLIENTE`). Se omiten los campos sensibles `precioCosto`, `variantes.codigoBarra` y `variantes.qrCode`.

### Ejemplo `GET /api/estado`

```json
{
  "estado": "ok",
  "timestamp": "2026-04-24T20:00:00.000Z",
  "services": {
    "mongodb": {
      "connected": true,
      "transactionsSupported": true,
      "topology": "REPLICA_SET",
      "dbName": "test",
      "serverStatus": "connected"
    }
  }
}
```

### Ejemplo `GET /api/delivery-options`

```json
{
  "pickupPoints": [
    { "id": "plaza-del-estudiante", "name": "Plaza Del Estudiante" }
  ],
  "pickupSchedules": [
    {
      "id": "lunes-1200-1800",
      "day": "Lunes",
      "start": "12:00",
      "end": "18:00",
      "label": "Lunes: 12:00-18:00"
    }
  ],
  "shippingCompanies": [
    {
      "id": "bolivar-cargo",
      "name": "BolivarCargo",
      "departments": [
        {
          "name": "Cochabamba",
          "branches": ["Av Melchor"]
        }
      ]
    }
  ]
}
```

Comportamiento:

- Lee exclusivamente el documento `key: "default"` de MongoDB.
- No usa cache HTTP en el servicio cliente actual (`cache: "no-store"`).
- Si la configuracion no fue migrada, responde `503`:

```json
{
  "message": "Las opciones de entrega aun no fueron migradas a MongoDB",
  "code": "DELIVERY_OPTIONS_NOT_CONFIGURED"
}
```

- Un error inesperado de conexion o lectura responde `500`.

## 2. Autenticacion

| Metodo | Ruta | Auth | Descripcion |
|---|---|---|---|
| `POST` | `/api/auth/login` | Publica | Login con email/password |
| `POST` | `/api/auth/signup` | Publica | Registro de cliente |
| `POST` | `/api/auth/google` | Publica | Login/registro con Google |
| `GET/POST` | `/api/auth/[...nextauth]` | Web | Sesion NextAuth |

### `POST /api/auth/login`

Request:

```json
{
  "email": "cliente@correo.com",
  "password": "secret123"
}
```

Response:

```json
{
  "message": "Login exitoso",
  "accessToken": "<jwt>",
  "refreshToken": "<jwt>",
  "user": {
    "id": "665f...",
    "email": "cliente@correo.com",
    "nombreCompleto": "Cliente Demo",
    "rol": "CLIENTE"
  }
}
```

### `POST /api/auth/signup`

Request:

```json
{
  "email": "cliente@correo.com",
  "password": "secret123",
  "nombreCompleto": "Cliente Demo"
}
```

Response:

```json
{
  "message": "Usuario creado correctamente. Por favor inicia sesion.",
  "user": {
    "id": "665f...",
    "email": "cliente@correo.com",
    "nombreCompleto": "Cliente Demo",
    "rol": "CLIENTE"
  }
}
```

### `POST /api/auth/google`

Request:

```json
{
  "idToken": "<google-id-token>"
}
```

Response:

```json
{
  "message": "Autenticado correctamente",
  "accessToken": "<jwt>",
  "refreshToken": "<jwt>",
  "user": {},
  "created": false,
  "linkedExistingAccount": false
}
```

## 3. Perfil y cliente autenticado

### Perfil general

| Metodo | Ruta | Auth | Descripcion |
|---|---|---|---|
| `GET` | `/api/perfil` | Cualquier autenticado | Perfil unificado del usuario |
| `PUT` | `/api/perfil` | Cualquier autenticado | Actualiza nombre, email y password |

Body `PUT /api/perfil`:

```json
{
  "nombreCompleto": "Nuevo Nombre",
  "email": "nuevo@correo.com",
  "password": "opcional"
}
```

### Cliente

| Metodo | Ruta | Auth | Descripcion |
|---|---|---|---|
| `GET` | `/api/clientes/me` | `CLIENTE` | Contexto de cliente, perfil y direccion por defecto |
| `PUT` | `/api/clientes/me` | `CLIENTE` | Actualiza perfil de cliente |
| `GET` | `/api/clientes/me/direcciones` | `CLIENTE` | Lista direcciones |
| `POST` | `/api/clientes/me/direcciones` | `CLIENTE` | Crea direccion |
| `PUT` | `/api/clientes/me/direcciones/:direccionId` | `CLIENTE` | Actualiza direccion |
| `DELETE` | `/api/clientes/me/direcciones/:direccionId` | `CLIENTE` | Elimina direccion |

Body ejemplo `PUT /api/clientes/me`:

```json
{
  "telefono": "76543210",
  "tipoDocumento": "CI",
  "numeroDocumento": "1234567",
  "metodoEntregaPredeterminado": "PICKUP_POINT",
  "notas": "Entregar por la tarde"
}
```

Body ejemplo `POST /api/clientes/me/direcciones`:

```json
{
  "etiqueta": "Casa",
  "nombreDestinatario": "Cliente Demo",
  "telefono": "76543210",
  "departamento": "La Paz",
  "ciudad": "La Paz",
  "direccion": "Zona Centro, calle ejemplo 123",
  "pais": "Bolivia",
  "esPredeterminada": true
}
```

## 4. Catalogo e inventario

### Catalogo publico

Ya documentado en el bloque de endpoints publicos.

### Catalogo interno

| Metodo | Ruta | Auth | Descripcion |
|---|---|---|---|
| `GET` | `/api/productos` | `ADMIN`, `VENDEDOR` | Lista catalogo interno |
| `POST` | `/api/productos` | `ADMIN` | Crea producto |
| `GET` | `/api/productos/:id` | `ADMIN`, `VENDEDOR` | Obtiene producto interno |
| `PUT` | `/api/productos/:id` | `ADMIN` | Actualiza producto |
| `DELETE` | `/api/productos/:id` | `ADMIN` | Elimina producto |
| `GET` | `/api/productos/by-code/:code` | `ADMIN`, `VENDEDOR` | Busca por QR o codigo de barras |

Query params:

- `GET /api/productos?withStock=true`

Body ejemplo `POST /api/productos`:

```json
{
  "nombre": "Chompa Alpaca",
  "modelo": "Invierno 2026",
  "precioVenta": 120,
  "precioCosto": 70,
  "categoria": "Chompas",
  "variantes": [
    {
      "color": "Azul",
      "colorSecundario": "Gris",
      "talla": "M",
      "stock": 10,
      "stockReservado": 0,
      "codigoBarra": "123456",
      "qrCode": "QR-123456",
      "descripcion": "Detalles grises en cuello",
      "imagenes": [
        "https://res.cloudinary.com/..."
      ],
      "imagen": "https://res.cloudinary.com/..."
    }
  ]
}
```

### Inventario

| Metodo | Ruta | Auth | Descripcion |
|---|---|---|---|
| `GET` | `/api/inventario` | `ADMIN`, `VENDEDOR` | Lista movimientos de inventario |
| `POST` | `/api/inventario` | `ADMIN` | Ajuste de stock |
| `GET` | `/api/inventario/:productoId` | `ADMIN`, `VENDEDOR` | Kardex por producto |

Body ejemplo `POST /api/inventario`:

```json
{
  "productoId": "665f...",
  "varianteId": "665f...",
  "color": "Azul",
  "colorSecundario": "Gris",
  "talla": "M",
  "tipo": "ENTRADA",
  "cantidad": 5,
  "motivo": "Reposicion",
  "referencia": "COMPRA-2026-001"
}
```

## 5. Uploads

| Metodo | Ruta | Auth | Descripcion |
|---|---|---|---|
| `POST` | `/api/uploads/variantes` | `ADMIN` | Sube imagen de variante a Cloudinary |

Request:

- `multipart/form-data`
- campo requerido: `file`
- solo imagenes
- maximo `5 MB`

Response:

```json
{
  "url": "https://res.cloudinary.com/..."
}
```

## 6. Carrito y checkout

| Metodo | Ruta | Auth | Descripcion |
|---|---|---|---|
| `GET` | `/api/carrito` | `CLIENTE` | Obtiene carrito actual |
| `DELETE` | `/api/carrito` | `CLIENTE` | Vacia carrito |
| `POST` | `/api/carrito/items` | `CLIENTE` | Agrega item |
| `PUT` | `/api/carrito/items/:itemId` | `CLIENTE` | Actualiza cantidad |
| `DELETE` | `/api/carrito/items/:itemId` | `CLIENTE` | Elimina item |
| `POST` | `/api/pedidos/checkout` | `CLIENTE` | Convierte carrito en pedido |

Body ejemplo `POST /api/carrito/items`:

```json
{
  "productoId": "665f...",
  "varianteId": "665f...",
  "color": "Azul",
  "colorSecundario": "Gris",
  "talla": "M",
  "cantidad": 2
}
```

Body ejemplo `POST /api/pedidos/checkout`:

```json
{
  "metodoPago": "QR",
  "direccionId": "665f...",
  "notas": "Entregar con anticipacion",
  "entrega": {
    "metodo": "PICKUP_POINT",
    "direccion": "Plaza Del Estudiante",
    "telefono": "76543210",
    "nombreDestinatario": "Cliente Demo",
    "programadoPara": "Viernes 17:00-19:00"
  }
}
```

Para envío nacional (`SHIPPING_NATIONAL`), la entrega requiere:
```json
{
  "metodoPago": "QR",
  "entrega": {
    "metodo": "SHIPPING_NATIONAL",
    "departamento": "Cochabamba",
    "ciudad": "Cochabamba",
    "empresaEnvio": "BolivarCargo",
    "sucursal": "Av Melchor",
    "nombreRemitente": "Juan Perez",
    "ciRemitente": "1234567",
    "telefonoRemitente": "71234567"
  }
}
```

Reglas de negocio importantes:

- `SHIPPING_NATIONAL` exige `metodoPago = QR`
- el checkout reserva stock
- pedidos QR quedan tipicamente en `PENDING_PAYMENT`
- pedidos efectivo quedan pendientes de confirmacion operativa

## 7. Pedidos

| Metodo | Ruta | Auth | Descripcion |
|---|---|---|---|
| `GET` | `/api/pedidos` | `ADMIN`, `VENDEDOR`, `CLIENTE` | Lista pedidos visibles para el actor |
| `GET` | `/api/pedidos/:id` | `ADMIN`, `VENDEDOR`, `CLIENTE` | Detalle de pedido |

Query params:

- `GET /api/pedidos?scope=sales` (Opcional, lista ventas directas/POS registradas en canal `APP_QR` o `TIENDA` por el actor autenticado)
| `PATCH` | `/api/pedidos/:id` | `ADMIN`, `VENDEDOR`, `CLIENTE` | Actualiza estado o entrega segun rol |
| `POST` | `/api/pedidos/:id/confirm-for-delivery` | `ADMIN`, `VENDEDOR` | Confirma pedido pendiente para entrega |
| `POST` | `/api/pedidos/:id/confirm-cash` | `ADMIN`, `VENDEDOR` | Confirma pedido en efectivo |
| `GET` | `/api/mis-pedidos` | `CLIENTE` | Alias orientado a cliente |
| `GET` | `/api/mis-pedidos/:id` | `CLIENTE` | Alias orientado a cliente |

### `PATCH /api/pedidos/:id` para staff

Body:

```json
{
  "estadoPedido": "READY",
  "estadoPago": "PAID",
  "estadoEntrega": "READY"
}
```

### `PATCH /api/pedidos/:id` para cliente

Cancelar:

```json
{
  "estadoPedido": "CANCELLED"
}
```

Editar entrega:

```json
{
  "entrega": {
    "telefono": "76543210",
    "nombreDestinatario": "Nuevo nombre"
  }
}
```

Reglas:

- el cliente solo puede operar sobre pedidos propios
- la cancelacion aplica sobre `PENDING_PAYMENT`
- la edicion de entrega es limitada y con ventana corta

## 8. Pagos

| Metodo | Ruta | Auth | Descripcion |
|---|---|---|---|
| `POST` | `/api/pagos` | Autenticado | Crea transaccion de pago |
| `POST` | `/api/pagos/:id/confirm` | Dueño o staff | Confirma pago |
| `POST` | `/api/pagos/:id/fail` | Dueño o staff | Marca pago fallido y libera stock |
| `POST` | `/api/pagos/:id/refund` | `ADMIN`, `VENDEDOR` | Reembolsa pago y repone stock |
| `POST` | `/api/pagos/:id/upload-comprobante` | `CLIENTE` | Sube comprobante QR |

### `POST /api/pagos`

Body:

```json
{
  "pedidoId": "665f...",
  "metodoPago": "QR",
  "idempotencyKey": "app-ios-order-665f-v1",
  "referenciaExterna": "checkout-mobile-001"
}
```

Recomendacion:

- para movil usar siempre `idempotencyKey`

### `POST /api/pagos/:id/confirm`

Body (opcional):

```json
{
  "referenciaExterna": "REF-EXTERNA-123"
}
```

### `POST /api/pagos/:id/fail`

Body (opcional):

```json
{
  "motivo": "Comprobante inválido o borroso"
}
```

### `POST /api/pagos/:id/refund`

Body (opcional):

```json
{
  "motivo": "Cliente canceló el pedido"
}
```

### `POST /api/pagos/:id/upload-comprobante`

Request:

- `multipart/form-data`
- campo requerido: `file`
- solo imagenes
- maximo `5 MB`

Response:

```json
{
  "message": "Comprobante subido correctamente. El administrador fue notificado.",
  "urlComprobante": "https://res.cloudinary.com/..."
}
```

### Flujo recomendado QR

1. crear pedido
2. crear pago
3. subir comprobante
4. revisar con link tokenizado
5. confirmar o rechazar con sesion `ADMIN` o `VENDEDOR`; el token solo localiza el recurso

## 9. Entregas

| Metodo | Ruta | Auth | Descripcion |
|---|---|---|---|
| `POST` | `/api/entregas` | `ADMIN`, `VENDEDOR` | Crea o sincroniza entrega de un pedido |
| `GET` | `/api/entregas/:id` | Staff o cliente dueño | Obtiene entrega por pedido |
| `PATCH` | `/api/entregas/:id/status` | `ADMIN`, `VENDEDOR` | Actualiza estado y metadata logistico |

Body ejemplo `POST /api/entregas`:

```json
{
  "pedidoId": "665f...",
  "codigoSeguimiento": "TRK-001",
  "nombreTransportista": "Trans Copacabana",
  "asignadoA": "665f...",
  "notas": "Recojo en terminal"
}
```

Body ejemplo `PATCH /api/entregas/:id/status`:

```json
{
  "estado": "IN_TRANSIT",
  "codigoSeguimiento": "TRK-001",
  "nombreTransportista": "Trans Copacabana",
  "asignadoA": "665f...",
  "notas": "Despachado a las 18:30"
}
```

## 10. POS

| Metodo | Ruta | Auth | Descripcion |
|---|---|---|---|
| `POST` | `/api/pos/sales` | `ADMIN`, `VENDEDOR` | Registra venta POS como `Pedido` en canal `APP_QR` o `TIENDA` |
| `GET` | `/api/pos/my-sales` | `ADMIN`, `VENDEDOR` | Lista ventas POS del actor |
| `GET` | `/api/pos/summary` | `ADMIN`, `VENDEDOR` | Resumen agregado del actor |
| `GET` | `/api/pos/scan/:code` | `ADMIN`, `VENDEDOR` | Busca producto por QR o codigo de barras |

Body ejemplo `POST /api/pos/sales` con entrega/recojo:

```json
{
  "items": [
    {
      "productoId": "665f...",
      "varianteId": "665f...",
      "color": "Azul",
      "colorSecundario": "Gris",
      "talla": "M",
      "cantidad": 1
    }
  ],
  "metodoPago": "EFECTIVO",
  "descuento": 0,
  "delivery": {
    "metodo": "PICKUP_POINT",
    "puntoRecojo": "Plaza del Estudiante",
    "telefono": "76543210",
    "nombreDestinatario": "Cliente Demo"
  }
}
```

Body ejemplo `POST /api/pos/sales` para venta presencial en tienda:

```json
{
  "items": [
    {
      "productoId": "665f...",
      "varianteId": "665f...",
      "color": "Azul",
      "colorSecundario": "Gris",
      "talla": "M",
      "cantidad": 1
    }
  ],
  "metodoPago": "EFECTIVO",
  "descuento": 0
}
```

Notas de comportamiento:

- `delivery` es opcional unicamente en `POST /api/pos/sales`.
- Si `delivery` se omite, la venta se registra como presencial en canal `TIENDA`.
- Si `delivery` se incluye, debe enviarse completo segun el metodo seleccionado.
- Omitir `delivery` no crea una entidad `Entrega`.
- Este cambio no modifica el contrato de los endpoints web de checkout o pedidos.

Ejemplo de `GET /api/pos/summary`:

```json
{
  "totalVentas": 0,
  "totalIngresos": 0,
  "totalGanancia": 0,
  "totalDescuentos": 0,
  "efectivoVentas": 0,
  "qrVentas": 0
}
```

## 11. Reportes

Todos los endpoints de reportes requieren `ADMIN`.

Filtros comunes:

- `from=YYYY-MM-DD`
- `to=YYYY-MM-DD`
- `limit=1..100` para rankings

| Metodo | Ruta | Descripcion |
|---|---|---|
| `GET` | `/api/reportes` | Resumen general |
| `GET` | `/api/reportes/ventas-diarias` | Serie diaria |
| `GET` | `/api/reportes/ventas-mensuales` | Serie mensual |
| `GET` | `/api/reportes/productos-top` | Top productos |
| `GET` | `/api/reportes/variantes-top` | Top variantes |
| `GET` | `/api/reportes/canales` | Ventas por canal |
| `GET` | `/api/reportes/vendedores` | Ventas por vendedor |
| `GET` | `/api/reportes/cancelaciones` | Cancelaciones, failed y refunded |
| `GET` | `/api/reportes/inventario-rotacion` | Rotacion de inventario |

Ejemplo:

```http
GET /api/reportes/productos-top?from=2026-04-01&to=2026-04-30&limit=20
```

## 12. Usuarios administrativos

Todos requieren `ADMIN`.

| Metodo | Ruta | Descripcion |
|---|---|---|
| `GET` | `/api/usuarios` | Lista usuarios |
| `POST` | `/api/usuarios` | Crea usuario |
| `PUT` | `/api/usuarios/:id` | Actualiza usuario |

Body ejemplo `POST /api/usuarios`:

```json
{
  "nombreCompleto": "Vendedor Demo",
  "email": "vendedor@correo.com",
  "password": "secret123",
  "rol": "VENDEDOR",
  "estaActivo": true
}
```

## 13. Ops, auditoria y mantenimiento

| Metodo | Ruta | Auth | Descripcion |
|---|---|---|---|
| `GET` | `/api/admin/audit-events?limit=50` | `ADMIN` | Lista eventos de auditoria |
| `PATCH` | `/api/admin/delivery-options` | `ADMIN` | Reemplaza atomicamente la configuracion singleton en MongoDB |
| `GET` | `/api/admin/ops/overview` | `ADMIN` | Overview operativo |
| `POST` | `/api/admin/ops/verify-core` | `ADMIN` | Verificacion E2E del core |
| `GET` | `/api/admin/cron/reservas-expiradas` | `Authorization: Bearer <CRON_SECRET>` | Libera reservas expiradas |

Body `POST /api/admin/ops/verify-core`:

```json
{
  "cleanup": true,
  "runLegacyMigration": true,
  "legacyMigrationLimit": 500
}
```

Body `PATCH /api/admin/delivery-options`:

```json
{
  "pickupPoints": [
    {
      "id": "plaza-del-estudiante",
      "name": "Plaza Del Estudiante"
    }
  ],
  "pickupSchedules": [
    {
      "id": "lunes-1200-1800",
      "day": "Lunes",
      "start": "12:00",
      "end": "18:00",
      "label": "Lunes: 12:00-18:00"
    }
  ],
  "shippingCompanies": [
    {
      "id": "bolivar-cargo",
      "name": "BolivarCargo",
      "departments": [
        {
          "name": "Cochabamba",
          "branches": ["Av Melchor"]
        }
      ]
    }
  ]
}
```

Respuesta exitosa:

```json
{
  "message": "Opciones de entrega actualizadas correctamente",
  "data": {
    "pickupPoints": [],
    "pickupSchedules": [],
    "shippingCompanies": []
  }
}
```

Reglas de validacion de opciones de entrega:

- Las tres colecciones (`pickupPoints`, `pickupSchedules`, `shippingCompanies`) son obligatorias, aunque pueden estar vacias.
- Los IDs usan minusculas, numeros y guiones, con un maximo de 120 caracteres.
- Los IDs deben ser unicos dentro de cada coleccion.
- Las horas usan formato `HH:mm` de 24 horas y `end` debe ser posterior a `start`.
- No se permiten departamentos duplicados dentro de una empresa.
- No se permiten sucursales duplicadas dentro de un departamento.
- Limites actuales: 200 puntos, 200 horarios, 100 empresas, 50 departamentos por empresa y 200 sucursales por departamento.
- Solo `ADMIN` puede modificar esta configuracion; un actor no autorizado recibe `403`.
- Cada actualizacion exitosa registra `DELIVERY_OPTIONS_UPDATED` en `EventoAuditoria`, incluyendo conteos anteriores y nuevos.

Error de validacion:

```json
{
  "message": "Datos de entrega invalidos",
  "errors": {
    "formErrors": [],
    "fieldErrors": {
      "pickupSchedules": ["Los identificadores no pueden estar duplicados"]
    }
  }
}
```

Header del cron:

```http
Authorization: Bearer <CRON_SECRET>
```

### Migracion inicial de opciones de entrega

La migracion carga `data/delivery-options.json` en la coleccion `deliveryoptions`.

```bash
npm run migrate:delivery-options
```

Caracteristicas del comando:

- Usa `MONGODB_URL` del entorno o de `.env.local`.
- Valida la estructura y detecta IDs, departamentos y sucursales duplicados.
- Es idempotente: si ya existe `key: "default"`, termina sin modificarlo.
- Crea un indice unico sobre `key`.
- Usa los DNS configurados en `MONGODB_DNS_SERVERS`; si no se define, usa `1.1.1.1,8.8.8.8` para resolver conexiones `mongodb+srv`.

Para reemplazar deliberadamente una configuracion existente con el JSON local:

```bash
npm run migrate:delivery-options:force
```

`migrate:delivery-options:force` es una operacion destructiva sobre la configuracion vigente y no debe ejecutarse como parte habitual del arranque o despliegue.

Orden recomendado para un entorno nuevo:

1. Configurar `MONGODB_URL` con la misma base utilizada por la aplicacion.
2. Autorizar temporalmente la IP desde la que se ejecuta la migracion en MongoDB Atlas.
3. Ejecutar `npm run migrate:delivery-options`.
4. Confirmar la existencia de `deliveryoptions` con `key: "default"`.
5. Probar `GET /api/delivery-options` y esperar status `200`.
6. Retirar reglas de red amplias o temporales en Atlas.

## Garantias de consistencia

Hoy los flujos criticos relevantes trabajan con transacciones o secuencias controladas sobre:

- checkout de pedidos
- confirmacion/fallo/reembolso de pagos
- confirmacion por token
- ajustes de inventario
- sincronizacion de entregas
- reemplazo atomico de opciones de entrega mediante un unico `findOneAndUpdate` con `upsert`

Ademas:

- las reservas expiradas se liberan por cron
- ops overview detecta estados anomalos
- auditoria registra eventos de dominio cuando corresponde
- los pedidos conservan snapshots de entrega independientes de los cambios posteriores en configuracion

## Flujos recomendados

### Flujo cliente QR

1. `POST /api/auth/login`
2. `GET /api/productos/publicos`
3. `POST /api/carrito/items`
4. `POST /api/pedidos/checkout`
5. `POST /api/pagos`
6. `POST /api/pagos/:id/upload-comprobante`
7. Operacion revisa `/api/verificar/pago/:token`

### Flujo cliente efectivo

1. `POST /api/pedidos/checkout` con `metodoPago=EFECTIVO`
2. Staff confirma con `POST /api/pedidos/:id/confirm-cash`

### Flujo POS

1. `GET /api/pos/scan/:code`
2. `POST /api/pos/sales`
3. `GET /api/pos/summary`

## Guia para desarrolladores moviles

### Recomendaciones de integracion

1. Crear un `ApiClient` central que agregue `Authorization`, `x-request-id` y manejo uniforme de errores.
2. Separar modulos de consumo:
   - `AuthApi`
   - `CatalogApi`
   - `CartApi`
   - `OrdersApi`
   - `PaymentsApi`
   - `ProfileApi`
3. Usar `idempotencyKey` en la creacion de pagos QR.
4. Tratar pagos QR como flujo asincrono.
5. Cachear `delivery-options` y catalogo publico cuando tenga sentido.

Al cachear `delivery-options`, invalidar o revalidar el cache despues de un `PATCH /api/admin/delivery-options`; el cliente web incluido actualmente solicita los datos con `cache: "no-store"`.

### Lo que la app no debe asumir

- que existe endpoint de refresh token
- que todos los endpoints devuelven exactamente el mismo envelope
- que los endpoints administrativos son publicos para la app

### Contratos mas estables hoy para movil

- `/api/auth/login`
- `/api/auth/google`
- `/api/productos/publicos`
- `/api/clientes/me`
- `/api/clientes/me/direcciones`
- `/api/carrito`
- `/api/pedidos/checkout`
- `/api/pedidos`
- `/api/pagos`
- `/api/pagos/:id/upload-comprobante`
- `/api/entregas/:id`

## Resumen ejecutivo

La API actual ya soporta correctamente:

- web publica
- dashboard interno
- app movil autenticada por JWT

Los contratos publicos mas importantes hoy son:

- autenticacion
- catalogo publico
- clientes
- carrito
- pedidos
- pagos
- entregas
- opciones de entrega persistidas en MongoDB

Los dominios de `reportes`, `ops`, `auditoria`, `usuarios` y `admin/**` deben tratarse como contratos internos de negocio y operacion.

---

## Variables de Entorno

Variables requeridas en el archivo `.env.local` / servidor de producción:

- `MONGODB_URL`: Cadena de conexión a MongoDB.
- `JWT_SECRET`: Secreto para firma de tokens JWT.
- `NEXTAUTH_SECRET`: Secreto para sesiones de NextAuth.
- `NEXT_PUBLIC_APP_URL`: URL pública del backend/frontend.
- `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`: Credenciales de Cloudinary para imágenes y comprobantes.
- `WHATSAPP_INTEGRATION_API_KEY`: Clave de API privada de integración para el agente WhatsApp (usada en cabecera `Authorization: Bearer <WHATSAPP_INTEGRATION_API_KEY>`).

---

## Integración WhatsApp (`/api/integrations/whatsapp/*`)

Familia de endpoints aislada para el bot/agente de ventas WhatsApp de la tienda Fit Andes.

### Autenticación Requerida

Todas las rutas bajo `/api/integrations/whatsapp/*` están protegidas por la cabecera:

```http
Authorization: Bearer <WHATSAPP_INTEGRATION_API_KEY>
```

---

### 1. Mejoras en Catálogo Público (`GET /api/productos/publicos`)

Soporta parámetros de consulta opcionales:
- `q`: Búsqueda por texto (nombre, modelo, SKU, descripción, color, talla).
- `categoria`: Nombre de la categoría.
- `color`: Nombre del color.
- `talla`: Código de talla.
- `soloDisponible=true`: Filtra solo variantes con stock disponible (`stock - stockReservado > 0`).
- `page`: Número de página (activa respuesta paginada `{ data, total, page, limit, totalPages }`).
- `limit`: Cantidad por página (default 20, max 100).

---

### 2. Crear Pedido WhatsApp (`POST /api/integrations/whatsapp/orders`)

**Body esperado:**

```json
{
  "idempotencyKey": "wamid-del-mensaje-o-id-unico",
  "customer": {
    "phone": "59167113105",
    "name": "Fernando Leon"
  },
  "items": [
    {
      "productoId": "650000000000000000000001",
      "varianteId": "650000000000000000000002",
      "cantidad": 1
    }
  ],
  "paymentMethod": "QR",
  "delivery": {
    "method": "SHIPPING_NATIONAL",
    "scheduledFor": "2026-09-10T17:00:00-04:00",
    "department": "La Paz",
    "city": "El Alto",
    "shippingCompanyId": "empresa-1",
    "branch": "Sucursal Central",
    "recipientName": "Fernando Leon",
    "recipientCi": "1234567 LP",
    "phone": "59167113105"
  },
  "notes": "Entregar en la tarde"
}
```

**Respuesta (201 Created):**

```json
{
  "numeroPedido": "P-LP3K8F2A-3F9B",
  "pedidoId": "650000000000000000000010",
  "pagoId": "650000000000000000000011",
  "subtotal": 120,
  "costoEnvio": 10,
  "descuento": 0,
  "total": 130,
  "estado": "PENDING_PAYMENT",
  "vencimientoReserva": "2026-09-11T03:59:59.999Z",
  "paymentInstructions": {
    "method": "QR",
    "bank": "BancoSol",
    "accountHolder": "Fernando Leon Andrade Gutierrez",
    "qrImageUrl": "https://res.cloudinary.com/dq1jeikev/image/upload/v1777964054/comprobante_xvdhuf.jpg",
    "amount": 130,
    "message": "Realiza el pago por QR y envía aquí la captura de tu comprobante."
  },
  "notification": {
    "to": "59167113105",
    "type": "NEW_ORDER",
    "text": "Resumen del pedido para atención humana..."
  }
}
```

---

### 3. Subir Comprobante de Pago (`POST /api/integrations/whatsapp/payments/:paymentId/proof`)

Acepta `multipart/form-data` con el campo `file` (imagen de comprobante).

**Respuesta (200 OK):**

```json
{
  "message": "Comprobante registrado exitosamente.",
  "paymentId": "650000000000000000000011",
  "urlComprobante": "https://res.cloudinary.com/dq1jeikev/image/upload/v123456/comprobante.jpg",
  "notification": {
    "to": "59167113105",
    "type": "PAYMENT_PROOF_UPLOADED",
    "text": "Nuevo comprobante de pago recibido..."
  }
}
```

---

### 4. Consultar Estado de Pedido (`GET /api/integrations/whatsapp/orders/:numeroPedido?phone=591XXXXXXXX`)

**Respuesta (200 OK):**

```json
{
  "numeroPedido": "P-LP3K8F2A-3F9B",
  "createdAt": "2026-09-08T17:00:00.000Z",
  "estadoPedido": "PENDING_PAYMENT",
  "estadoPago": "PENDING",
  "estadoEntrega": "PENDING",
  "estadoReservaStock": "RESERVED",
  "vencimientoReserva": "2026-09-11T03:59:59.999Z",
  "subtotal": 120,
  "costoEnvio": 10,
  "descuento": 0,
  "total": 130,
  "items": [
    {
      "nombre": "Polera Fit Andes",
      "color": "Negro",
      "talla": "M",
      "cantidad": 1,
      "precioUnitario": 120,
      "totalLinea": 120
    }
  ],
  "entrega": {
    "metodo": "SHIPPING_NATIONAL",
    "nombreDestinatario": "Fernando Leon",
    "telefono": "59167113105",
    "departamento": "La Paz",
    "ciudad": "El Alto",
    "empresaEnvio": "Empresa Express",
    "sucursal": "Sucursal Central",
    "programadoPara": "2026-09-10T17:00:00-04:00"
  }
}
```

