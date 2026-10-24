# Documentación API - Control Ventas (Fit Andes)

**Estado del documento:** Actualizado a Octubre de 2026.  
**Referencia de implementación:** `src/app/api/**/route.ts`  
**Validaciones de entrada:** Esquemas Zod en `src/schemas/*.ts`  
**Capa de datos y persistencia:** Modelos Mongoose en `src/models/*.ts` y módulos de dominio en `src/modules/*`

---

## Índice General

1. [Propósito y Audiencia](#1-propósito-y-audiencia)
2. [Arquitectura y Entornos](#2-arquitectura-y-entornos)
3. [Autenticación, Roles y Seguridad](#3-autenticación-roles-y-seguridad)
4. [Rate Limiting y Convenciones de Error](#4-rate-limiting-y-convenciones-de-error)
5. [Modelos Principales en Respuestas de API](#5-modelos-principales-en-respuestas-de-api)
   - [5.1 Producto Público Sanitizado](#51-producto-público-sanitizado)
   - [5.2 Producto Interno Enriquecido con Stock Multisucursal](#52-producto-interno-enriquecido-con-stock-multisucursal)
   - [5.3 Pedido Unificado](#53-pedido-unificado)
   - [5.4 Sucursal y Configuración de Caja](#54-sucursal-y-configuración-de-caja)
   - [5.5 Compra a Proveedor y Costo Promedio Ponderado (CPP)](#55-compra-a-proveedor-y-costo-promedio-ponderado-cpp)
6. [Catálogo de Endpoints por Dominio](#6-catálogo-de-endpoints-por-dominio)
   - [6.1 Salud y Estado Técnico](#61-salud-y-estado-técnico)
   - [6.2 Catálogo Público y Opciones de Entrega](#62-catálogo-público-y-opciones-de-entrega)
   - [6.3 Políticas Públicas y Legales](#63-políticas-públicas-y-legales)
   - [6.4 Autenticación](#64-autenticación)
   - [6.5 Perfil y Clientes](#65-perfil-y-clientes)
   - [6.6 Carrito de Compras](#66-carrito-de-compras)
   - [6.7 Pedidos y Checkout](#67-pedidos-y-checkout)
   - [6.8 Pagos y Comprobantes](#68-pagos-y-comprobantes)
   - [6.9 Verificación Segura de Pagos (Telegram 1-Click)](#69-verificación-segura-de-pagos-telegram-1-click)
   - [6.10 Fulfillment y Entregas](#610-fulfillment-y-entregas)
   - [6.11 Punto de Venta (POS) y Turnos de Caja](#611-punto-de-venta-pos-y-turnos-de-caja)
   - [6.12 Integración Especializada WhatsApp](#612-integración-especializada-whatsapp)
   - [6.13 Catálogo Interno de Productos](#613-catálogo-interno-de-productos)
   - [6.14 Inventario y Kárdex](#614-inventario-y-kárdex)
   - [6.15 Sucursales y Stock Multitienda](#615-sucursales-y-stock-multitienda)
   - [6.16 Traspasos entre Sucursales](#616-traspasos-entre-sucursales)
   - [6.17 Compras de Proveedores (CPP) y Reemplazo Atómico](#617-compras-de-proveedores-cpp-y-reemplazo-atómico)
   - [6.18 Tesorería y Cuentas de Dinero](#618-tesorería-y-cuentas-de-dinero)
   - [6.19 Gastos Operativos](#619-gastos-operativos)
   - [6.20 Devoluciones y Cambios](#620-devoluciones-y-cambios)
   - [6.21 Cierres de Periodo Contable](#621-cierres-de-periodo-contable)
   - [6.22 Reportes Financieros y de Ventas](#622-reportes-financieros-y-de-ventas)
   - [6.23 Notificaciones y Alertas](#623-notificaciones-y-alertas)
   - [6.24 Gestión de Usuarios Administrativos](#624-gestión-de-usuarios-administrativos)
   - [6.25 Uploads Multimedia](#625-uploads-multimedia)
   - [6.26 Operaciones, Mantenimiento y Cron](#626-operaciones-mantenimiento-y-cron)
7. [Variables de Entorno](#7-variables-de-entorno)

---

## 1. Propósito y Audiencia

Este documento describe la totalidad de las APIs REST implementadas en el backend de **Fit Andes (`control-ventas`)**.

Está orientado a:
- Desarrolladores y agentes de la **Tienda Web (Storefront)**.
- Desarrolladores y agentes del **Dashboard Interno (`ADMIN` y `VENDEDOR`)**.
- Desarrolladores y agentes de la **App Móvil (POS / Venta en Calle / Clientes)**.
- Integradores del **Bot de WhatsApp y Servicios Satélites**.

---

## 2. Arquitectura y Entornos

- **Framework:** Next.js 15 (App Router, runtime Node.js).
- **Base de Datos:** MongoDB Replicaset con transacciones ACID (`runInTransaction`).
- **Almacenamiento de Archivos:** Cloudinary (`next-cloudinary`).
- **Notificaciones Inmediatas:** Bot de Telegram con enlaces seguros de revisión.

### URLs Base
- **Desarrollo:** `http://localhost:3000/api`
- **Producción:** `https://control-ventas-azure.vercel.app/api`

---

## 3. Autenticación, Roles y Seguridad

### 3.1 Mecanismos de Autenticación
El helper [`resolveApiAuth`](file:///e:/proyectos/control-ropa/control-ventas/src/libs/resolveApiAuth.ts) aplica una estrategia desacoplada:

1. **JWT Bearer Token:**
   Utilizado por la App Móvil, scripts y clientes desacoplados:
   ```http
   Authorization: Bearer <accessToken>
   ```
2. **Sesión Web (NextAuth):**
   Utilizada por el Dashboard Web. Las cookies `httpOnly` son procesadas por el middleware, el cual inyecta de forma segura los encabezados `x-user-id` y `x-user-role`. El middleware elimina cualquier intento de inyección externa de estos headers para evitar spoofing.
3. **API Key de Integración WhatsApp:**
   Utilizada en `/api/integrations/whatsapp/*`. Requiere:
   ```http
   Authorization: Bearer <WHATSAPP_INTEGRATION_API_KEY>
   ```
   Valida el secreto en tiempo constante con `crypto.timingSafeEqual`.
4. **Token de Cron:**
   Utilizado en `/api/admin/cron/*`:
   ```http
   Authorization: Bearer <CRON_SECRET>
   ```

### 3.2 Matriz de Acceso por Rol
| Dominio | CLIENTE | VENDEDOR | ADMIN |
|---|---|---|---|
| Catálogo público / Políticas / Delivery Options | Sí | Sí | Sí |
| Búsqueda por código/SKU (`/api/productos/by-code/:code`) | Sí (sanitizado) | Sí | Sí |
| Catálogo interno (`/api/productos`) | No | Sí | Sí |
| Carrito y Checkout de cliente | Sí | No | No |
| Mis Pedidos (propios) | Sí | No | No |
| Pedidos operativos maestros | No | Sí | Sí |
| Pagos (confirmación, fallo, comprobante) | Sí (sus pagos) | Sí (staff) | Sí |
| Reembolsos (Refund) | No | Sí | Sí |
| Entregas / Fulfillment (`/api/entregas/:id`) | Sí (propio, 403 si ajeno) | Sí | Sí |
| POS (Venta mostrador, escáner, cajas) | No | Sí | Sí |
| Sucursales y Traspasos | No | Sí (operativo) | Sí (total) |
| Inventario / Kárdex | No | Sí (lectura) | Sí (ajustes) |
| Compras a Proveedores | No | Sí (lectura) | Sí (creación/anulación) |
| Finanzas (Cuentas, Gastos, Periodos, P&L) | No | No | Sí |
| Notificaciones / Alertas | No | Sí | Sí |
| Reportes gerenciales | No | No | Sí |
| Usuarios / Ops / Auditoría / Cron | No | No | Sí |

---

## 4. CORS, Rate Limiting y Convenciones de Error

### 4.1 Soporte de CORS (Cross-Origin Resource Sharing)
Para facilitar la integración desde aplicaciones web externas (como el Storefront FitAndes) y clientes móviles, el servidor incluye cabeceras CORS automáticas y soporte nativo para preflight (`OPTIONS`):
- **Encabezados Emitidos:**
  - `Access-Control-Allow-Origin: *`
  - `Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS`
  - `Access-Control-Allow-Headers: Content-Type, Authorization, x-user-id, x-user-role, x-request-id`
  - `Access-Control-Max-Age: 86400`
- **Preflight `OPTIONS`:** Interceptado a nivel de middleware retornando `HTTP 204 No Content` con cabeceras CORS inmediatas sin requerir autenticación.
- **Rutas Públicas Habilitadas:** `/api/public/*`, `/api/productos/publicos*`, `/api/productos/by-code/*`, `/api/delivery-options*`, `/api/estado*`, `/api/auth/signup`.

### 4.2 Rate Limiting (en Memoria)
- **Login / Signup / Auth:** 5 peticiones/min por IP.
- **Catálogo Público (`/api/productos/publicos`, `/api/productos/by-code`, `/api/delivery-options`):** 100 peticiones/min por IP.
- **Lectura protegida (`GET`):** 60 peticiones/min por usuario.
- **Escritura protegida (`POST`, `PUT`, `PATCH`, `DELETE`):** 30 peticiones/min por usuario.
- **Respuesta 429:** `{ "message": "Demasiadas solicitudes. Inténtalo más tarde." }` con cabecera `Retry-After: 60`.

### 4.3 Respuestas de Error
- **Error de validación Zod (HTTP 400):**
  ```json
  {
    "message": "Datos invalidos",
    "errors": [
      { "field": "email", "message": "Email no válido" }
    ]
  }
  ```
- **Error de negocio / AppError (HTTP 400, 404, 409):**
  ```json
  {
    "message": "Stock insuficiente en la sucursal seleccionada",
    "code": "INSUFFICIENT_STOCK"
  }
  ```

---

## 5. Modelos Principales en Respuestas de API

### 5.1 Producto Público Sanitizado
Los clientes no reciben `precioCosto`, `variantes.codigoBarra` ni `variantes.qrCode`:
```json
{
  "_id": "670e10a2f1b4c90012345678",
  "nombre": "Chompa Alpaca Andina",
  "modelo": "Invierno 2026",
  "sku": "CH-ALP-001",
  "categoria": "Chompas",
  "precioVenta": 135.00,
  "precioMinimo": 135.00,
  "precioMaximo": 150.00,
  "tieneRangoPrecios": true,
  "precioDisplay": "Bs 135.00 - Bs 150.00",
  "descuento": 0,
  "stockTotal": 14,
  "stockReservadoTotal": 1,
  "stockDisponible": 13,
  "estado": "ACTIVO",
  "variantes": [
    {
      "varianteId": "var-alp-neg-m",
      "color": "Negro",
      "colorSecundario": "Gris",
      "talla": "M",
      "precioVenta": 135.00,
      "stock": 8,
      "stockReservado": 1,
      "stockDisponible": 7,
      "imagenes": ["https://res.cloudinary.com/..."],
      "medidas": {
        "anchoPecho": 52,
        "anchoHombros": 44,
        "largoTotal": 68
      }
    }
  ]
}
```

### 5.2 Producto Interno Enriquecido con Stock Multisucursal
En endpoints administrativos (`/api/productos` y `/api/productos/:id`), cada variante incluye costos (`precioCosto`, `costoOrigen`, `monedaOrigen`) y el desglose en tiempo real por cada sucursal (`sucursalesStock`):
```json
{
  "_id": "670e10a2f1b4c90012345678",
  "nombre": "Chompa Alpaca Andina",
  "sku": "CH-ALP-001",
  "precioVenta": 135.00,
  "precioCosto": 70.00,
  "stockTotal": 14,
  "variantes": [
    {
      "varianteId": "var-alp-neg-m",
      "color": "Negro",
      "talla": "M",
      "codigoBarra": "7771234567890",
      "qrCode": "QR-CH-ALP-NEG-M",
      "precioCosto": 70.00,
      "stock": 8,
      "stockReservado": 1,
      "stockDisponible": 7,
      "sucursalesStock": [
        {
          "sucursalId": "670e1000f1b4c90011000001",
          "nombre": "Almacén Central",
          "codigo": "ALM-CENTRAL",
          "stockFisico": 6,
          "stockReservado": 1,
          "stockDisponible": 5
        },
        {
          "sucursalId": "670e1000f1b4c90011000002",
          "nombre": "Tienda 1 - San Miguel",
          "codigo": "TDA-SM",
          "stockFisico": 2,
          "stockReservado": 0,
          "stockDisponible": 2
        }
      ]
    }
  ]
}
```

### 5.3 Pedido Unificado
```json
{
  "_id": "670e3001f1b4c90011223344",
  "numeroPedido": "P-261014-089",
  "canal": "WEB",
  "estadoPedido": "PENDING_PAYMENT",
  "estadoPago": "PENDING",
  "estadoEntrega": "PENDING",
  "estadoReservaStock": "RESERVED",
  "metodoPago": "QR",
  "subtotal": 135.00,
  "costoEnvio": 0.00,
  "descuento": 0.00,
  "total": 135.00,
  "reservaExpiraEn": "2026-10-14T06:50:00.000Z",
  "snapshotCliente": {
    "nombreCompleto": "Carlos Mendoza",
    "telefono": "59178965412"
  },
  "snapshotEntrega": {
    "metodo": "PICKUP_POINT",
    "puntoRecojo": "Estación Teleférico Central"
  },
  "items": [
    {
      "productoId": "670e10a2f1b4c90012345678",
      "varianteId": "var-alp-neg-m",
      "cantidad": 1,
      "precioUnitario": 135.00,
      "totalLinea": 135.00
    }
  ]
}
```

### 5.4 Sucursal y Configuración de Caja
Define las propiedades operativas de cada local o almacén, controlando si el personal de caja debe abrir turno formalmente o puede operar con caja libre:
```json
{
  "_id": "670e1000f1b4c90011000001",
  "nombre": "Tienda 1 - San Miguel",
  "codigo": "TDA-SM",
  "tipo": "TIENDA_FISICA",
  "direccion": "Av. Montenegro #1234",
  "ciudad": "La Paz",
  "telefono": "59170123456",
  "permiteVentaPOS": true,
  "permiteDespachoWeb": false,
  "permiteRetiroCliente": true,
  "requiereAperturaCaja": true,
  "activa": true,
  "esAlmacenPrincipal": false
}
```

### 5.5 Compra a Proveedor y Costo Promedio Ponderado (CPP)
Documento de adquisición que incrementa inventario y recalcula atómicamente el CPP por cada variante, guardando snapshots inmutables para posibilitar reversiones y reemplazos exactos:
```json
{
  "_id": "670e5000f1b4c90011990011",
  "numeroCompra": "COM-261020-001",
  "fecha": "2026-10-20T10:00:00.000Z",
  "proveedor": "Textiles del Valle S.R.L.",
  "comprobanteReferencia": "FAC-9842",
  "monedaOrigen": "PEN",
  "tipoCambio": 1.95,
  "totalMonedaOrigen": 1000.00,
  "totalBOB": 1950.00,
  "sucursalDestinoId": "670e1000f1b4c90011000001",
  "cuentaDineroId": "670e2000f1b4c90011440022",
  "estado": "COMPLETADA",
  "reemplazaACompraId": null,
  "reemplazadaPorCompraId": null,
  "items": [
    {
      "productoId": "670e10a2f1b4c90012345678",
      "varianteId": "var-alp-neg-m",
      "productoSnapshot": {
        "nombre": "Chompa Alpaca Andina",
        "modelo": "Invierno 2026",
        "sku": "CH-ALP-001"
      },
      "varianteSnapshot": {
        "color": "Negro",
        "talla": "M",
        "codigoBarra": "7771234567890"
      },
      "cantidad": 20,
      "costoUnitarioOrigen": 50.00,
      "costoUnitarioBOB": 97.50,
      "totalLineaBOB": 1950.00,
      "stockAnterior": 8,
      "costoAnteriorBOB": 70.00,
      "nuevoStock": 28,
      "nuevoCostoPromedioBOB": 89.64
    }
  ]
}
```

---

## 6. Catálogo de Endpoints por Dominio

### 6.1 Salud y Estado Técnico
| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/api/estado` | Pública | Healthcheck técnico de MongoDB y soporte de transacciones |

---

### 6.2 Catálogo Público y Opciones de Entrega
| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/api/productos/publicos` | Pública | Listado de catálogo con búsqueda (`q`), filtros (`categoria`, `color`, `talla`, `soloDisponible`) y paginación (`page`, `limit`). Respuesta siempre estandarizada en formato envoltorio `{ data: [...], total, page, limit, totalPages }` |
| `GET` | `/api/productos/publicos/:id` | Pública | Detalle de producto con variantes, stock vendible y medidas |
| `GET` | `/api/productos/by-code/:code` | Pública | Búsqueda directa por código de prenda (código de barra, QR o SKU). Sanitizada para clientes públicos (oculta costos y existencias internas) |
| `GET` | `/api/delivery-options` | Pública | Lista de puntos de recojo, horarios y empresas de envío por departamento |

---

### 6.3 Políticas Públicas y Legales
| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/api/public/politicas` | Pública | Políticas legales (devoluciones, privacidad, términos, cookies) |
| `GET` | `/api/admin/ajustes` | `ADMIN` | Consulta configuración del sistema (tipo de cambio PEN/BOB, políticas) |
| `PUT / PATCH` | `/api/admin/ajustes` | `ADMIN` | Modifica tipo de cambio o texto de políticas legales |

---

### 6.4 Autenticación
| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `POST` | `/api/auth/signup` | Pública | Registro de nuevos clientes con rol `CLIENTE` |
| `POST` | `/api/auth/login` | Pública | Inicio de sesión (devuelve `accessToken` JWT y objeto `user`) |
| `POST` | `/api/auth/google` | Pública | Autenticación con token de Google OAuth |
| `GET/POST`| `/api/auth/[...nextauth]`| Web | Endpoint del manejador de sesión NextAuth para la web |

---

### 6.5 Perfil y Clientes
| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/api/perfil` | Autenticado | Obtiene datos básicos del usuario autenticado |
| `PUT / PATCH` | `/api/perfil` | Autenticado | Actualiza nombre, email o contraseña del usuario |
| `GET` | `/api/clientes/me` | `CLIENTE` | Perfil del cliente, documento y dirección predeterminada |
| `PUT / PATCH` | `/api/clientes/me` | `CLIENTE` | Actualiza teléfono, tipo de documento o notas de cliente |
| `GET` | `/api/clientes/me/direcciones` | `CLIENTE` | Lista libreta de direcciones guardadas del cliente |
| `POST` | `/api/clientes/me/direcciones` | `CLIENTE` | Registra una nueva dirección guardada |
| `PUT / PATCH` | `/api/clientes/me/direcciones/:id` | `CLIENTE` | Modifica una dirección guardada existente |
| `DELETE`| `/api/clientes/me/direcciones/:id` | `CLIENTE` | Elimina una dirección guardada |

---

### 6.6 Carrito de Compras
| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/api/carrito` | `CLIENTE` | Obtiene el carrito sincronizado en base de datos con stock validado |
| `DELETE` | `/api/carrito` | `CLIENTE` | Vacía todos los ítems del carrito |
| `POST` | `/api/carrito/items` | `CLIENTE` | Agrega un producto y variante con validación atómica de existencias |
| `PUT / PATCH` | `/api/carrito/items/:itemId` | `CLIENTE` | Actualiza la cantidad solicitada de un ítem |
| `DELETE` | `/api/carrito/items/:itemId` | `CLIENTE` | Elimina un ítem específico del carrito |

---

### 6.7 Pedidos y Checkout
| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `POST` | `/api/pedidos/checkout` | `CLIENTE` | Convierte el carrito en pedido, reserva stock y genera orden de pago |
| `GET` | `/api/mis-pedidos` | `CLIENTE` | Historial de pedidos del cliente autenticado |
| `GET` | `/api/mis-pedidos/:id` | `CLIENTE` | Detalle de un pedido perteneciente al cliente |
| `GET` | `/api/pedidos` | `ADMIN`, `VENDEDOR` | Listado maestro de pedidos (soporta `?scope=sales`) |
| `GET` | `/api/pedidos/:id` | Staff o dueño | Detalle completo de orden |
| `PATCH` | `/api/pedidos/:id` | Staff o cliente | Staff: actualiza estados. Cliente: cancela orden pendiente |
| `POST` | `/api/pedidos/:id/confirm-cash` | `ADMIN`, `VENDEDOR` | Confirma pago en efectivo y consume stock |
| `POST` | `/api/pedidos/:id/confirm-for-delivery` | `ADMIN`, `VENDEDOR` | Aprueba pedido para pase a despacho |
| `GET` | `/api/pedidos/:id/devoluciones` | `ADMIN`, `VENDEDOR` | Consulta el historial de devoluciones y cambios del pedido |
| `POST` | `/api/pedidos/:id/devoluciones` | `ADMIN`, `VENDEDOR` | Registra devolución o cambio de prenda |

---

### 6.8 Pagos y Comprobantes
| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `POST` | `/api/pagos` | Autenticado | Crea transacción de pago vinculada a un pedido |
| `POST` | `/api/pagos/:id/confirm` | Staff | Confirma pago manualmente, consume stock e ingresa dinero a tesorería |
| `POST` | `/api/pagos/:id/fail` | Staff o dueño | Marca pago como fallido y libera el stock reservado |
| `POST` | `/api/pagos/:id/refund` | `ADMIN`, `VENDEDOR` | Reembolsa pago, repone stock vendible y registra egreso contable |
| `POST` | `/api/pagos/:id/upload-comprobante` | `CLIENTE`, Staff | Sube comprobante a Cloudinary y dispara alerta interactiva en Telegram |

---

### 6.9 Verificación Segura de Pagos (Telegram 1-Click)
| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/api/verificar/pago/:token` | Staff | Vista web segura para revisar la captura del comprobante |
| `POST` | `/api/verificar/pago/:token/confirm` | Staff | Aprobación en 1 clic del pago, consumiendo stock de forma atómica |
| `POST` | `/api/verificar/pago/:token/reject` | Staff | Rechazo de comprobante inválido/borroso |

---

### 6.10 Fulfillment y Entregas
| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `POST` | `/api/entregas` | `ADMIN`, `VENDEDOR` | Crea o sincroniza la entidad logística de un pedido |
| `GET` | `/api/entregas/:id` | Staff o dueño | Consulta el estado logístico, guía de transporte y repartidor |
| `PATCH` | `/api/entregas/:id/status` | `ADMIN`, `VENDEDOR` | Avanza estado (`READY`, `IN_TRANSIT`, `DELIVERED`, `CANCELLED`) y registra marcas de tiempo |

---

### 6.11 Punto de Venta (POS) y Turnos de Caja
| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/api/pos/scan/:code` | `ADMIN`, `VENDEDOR` | Escaneo rápido por código de barras o QR de etiqueta de prenda. Acepta query opcional `?sucursalId=` para consultar stock físico local |
| `POST` | `/api/pos/sales` | `ADMIN`, `VENDEDOR` | Venta directa en mostrador. Requiere `sucursalId`. Valida y descuenta existencias físicas en la sucursal (`NivelStock`), asienta Kárdex `SALIDA` y suma a la sesión de caja si está abierta |
| `GET` | `/api/pos/my-sales` | `ADMIN`, `VENDEDOR` | Lista las ventas directas registradas por el vendedor autenticado en el día |
| `GET` | `/api/pos/summary` | `ADMIN`, `VENDEDOR` | Resumen de ventas, ingresos, ganancias y desglose de cobros en efectivo vs QR |
| `GET` | `/api/pos/caja/activa` | `ADMIN`, `VENDEDOR` | Consulta el turno de caja de la sucursal (`?sucursalId=`). Devuelve `{ sesion, sucursal: { _id, nombre, requiereAperturaCaja, permiteVentaPOS } }`. Si `sesion` es null pero `requiereAperturaCaja` es false, la venta libre está permitida |
| `POST` | `/api/pos/caja/apertura` | `ADMIN`, `VENDEDOR` | Abre turno de caja. Body: `{ sucursalId, montoApertura, notasApertura? }` |
| `POST` | `/api/pos/caja/cierre` | `ADMIN`, `VENDEDOR` | Cierra turno y arquea efectivo. Body: `{ sesionId, montoDeclaradoEfectivo, notasCierre? }`. Calcula descuadre de efectivo (`diferenciaEfectivo`) |
| `POST` | `/api/pos/caja/movimiento-manual` | `ADMIN`, `VENDEDOR` | Registra movimientos no comerciales. Body: `{ sesionId, tipo: "INGRESO_MANUAL" \| "EGRESO_MANUAL", monto, motivo }` |
| `GET` | `/api/admin/pos/cajas` | `ADMIN` | Historial administrativo de turnos de caja de todas las sucursales |

---

### 6.12 Integración Especializada WhatsApp
| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/api/integrations/whatsapp/products/search` | API Key Bot | Búsqueda ultra-rápida y compacta para IA (`?q=`, `?color=`, `?talla=`, `?minPrecio=`, `?maxPrecio=`, `?limit=`). Filtra prendas activas con variantes con stock vendible en sucursales de despacho web y aplica optimización Cloudinary (`f_auto,q_auto,w_800`) |
| `GET` | `/api/integrations/whatsapp/products/:id/measurements` | API Key Bot | Consulta de medidas anatómicas por talla y colores disponibles para asesoría de clientes |
| `POST` | `/api/integrations/whatsapp/orders` | API Key Bot | Creación de pedido con idempotencia, reserva hasta fin de día (La Paz UTC-4) e instrucciones de BancoSol |
| `POST` | `/api/integrations/whatsapp/payments/:id/proof`| API Key Bot | Subida de captura de comprobante enviada por el cliente, prórroga de reserva 48h y notificación a Telegram |
| `GET` | `/api/integrations/whatsapp/orders/:nro` | API Key Bot | Consulta de estado de orden filtrada por número de teléfono del cliente (`?phone=`) |

---

### 6.13 Catálogo Interno de Productos
| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/api/productos` | `ADMIN`, `VENDEDOR` | Listado completo de prendas. Soporta `?withStock=true` y `?sucursalId=` para consultar existencias locales. Cada variante incluye costos internos y desglose multisucursal en `sucursalesStock` |
| `POST` | `/api/productos` | `ADMIN` | Alta de nueva prenda con sus variantes, medidas y precios base |
| `GET` | `/api/productos/:id` | `ADMIN`, `VENDEDOR` | Ficha técnica interna de producto con histórico y variantes enriquecidas con `sucursalesStock` |
| `PUT` | `/api/productos/:id` | `ADMIN` | Edición integral de producto, variantes, precios y categorías |
| `DELETE` | `/api/productos/:id` | `ADMIN` | Baja lógica de producto |
| `GET` | `/api/productos/by-code/:code` | Pública, Staff | Búsqueda por código de barras, QR o SKU. Público/CLIENTE: respuesta sanitizada. Staff: incluye costos y existencias operativas |

---

### 6.14 Inventario y Kárdex
| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/api/inventario` | `ADMIN`, `VENDEDOR` | Historial de movimientos de inventario con filtros por fecha, tipo de movimiento y producto |
| `POST` | `/api/inventario` | `ADMIN` | Registro manual de ajuste de inventario (`AJUSTE_POSITIVO` o `AJUSTE_NEGATIVO`) con afectación a Kárdex |
| `GET` | `/api/inventario/:productoId` | `ADMIN`, `VENDEDOR` | Kárdex cronológico específico de un producto (entradas, salidas, traspasos, ajustes) |
| `GET` | `/api/inventario/kardex/consolidado` | `ADMIN` | Kárdex físico y valorado consolidado del negocio con cálculo de stock actual y costo total valorado |

---

### 6.15 Sucursales y Stock Multitienda
| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/api/admin/sucursales` | `ADMIN`, `VENDEDOR` | Listado de sucursales (tiendas físicas, almacenes y puntos de retiro) con flags de venta POS, despacho web y requerimiento de caja |
| `POST` | `/api/admin/sucursales` | `ADMIN` | Alta de nueva sucursal (`nombre`, `codigo`, `tipo`, `permiteVentaPOS`, `permiteDespachoWeb`, `permiteRetiroCliente`, `requiereAperturaCaja`) |
| `GET` | `/api/admin/sucursales/:id` | `ADMIN` | Detalle de sucursal y configuración operativa |
| `PUT` | `/api/admin/sucursales/:id` | `ADMIN` | Modificación de datos y políticas de la sucursal (ej. activar o desactivar `requiereAperturaCaja`) |
| `PATCH` | `/api/admin/sucursales/:id` | `ADMIN` | Activa o desactiva lógicamente la sucursal (`{ activa: boolean }`, impidiendo desactivar el almacén principal) |
| `GET` | `/api/admin/productos/:id/stock-sucursales` | `ADMIN`, `VENDEDOR` | Desglose pormenorizado de niveles de stock (`stockFisico`, `stockReservado`, `stockDisponible`) por cada sucursal para el producto |

---

### 6.16 Traspasos entre Sucursales
| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/api/admin/traspasos` | `ADMIN`, `VENDEDOR` | Listado de traspasos con filtros por `estado` (`SOLICITADA`, `DESPACHADA`, `RECIBIDA`, `RECHAZADA`, `CANCELADA`) y `sucursalId` |
| `POST` | `/api/admin/traspasos` | `ADMIN`, `VENDEDOR` | Crea solicitud de traspaso. Body: `{ sucursalOrigenId, sucursalDestinoId, items: [{ productoId, varianteId, cantidad }], notas? }`. Valida existencias en origen |
| `GET` | `/api/admin/traspasos/:id` | `ADMIN`, `VENDEDOR` | Detalle completo de una solicitud de traspaso y sus líneas de mercadería |
| `DELETE`| `/api/admin/traspasos/:id` | `ADMIN`, `VENDEDOR` | Cancela una solicitud en estado `SOLICITADA` sin afectar inventario |
| `POST` | `/api/admin/traspasos/:id/despachar` | `ADMIN`, `VENDEDOR` | Despacho: descuenta stock físico de la sucursal origen y asienta `TRASPASO_SALIDA` en Kárdex |
| `POST` | `/api/admin/traspasos/:id/recibir` | `ADMIN`, `VENDEDOR` | Recepción: ingresa stock a la sucursal destino y asienta `TRASPASO_ENTRADA` en Kárdex |

---

### 6.17 Compras de Proveedores (CPP) y Reemplazo Atómico
| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/api/compras` | `ADMIN`, `VENDEDOR` | Historial paginado de compras (`?page=&limit=`). Incluye snapshots de productos, proveedores y totales en BOB y moneda origen |
| `POST` | `/api/compras` | `ADMIN` | Registra compra: incrementa existencias en la sucursal destino, recalcula el Costo Promedio Ponderado (CPP) por variante, asienta `ENTRADA` en Kárdex y descuenta fondos de la cuenta de tesorería |
| `GET` | `/api/compras/:id` | `ADMIN`, `VENDEDOR` | Detalle completo de una compra con snapshots inmutables de costos anteriores vs nuevos y stock resultante |
| `PUT` | `/api/compras/:id` | `ADMIN`, `VENDEDOR` | Reemplazo atómico / Corrección de compra. Revierte atómicamente la compra anterior en memoria y aplica la nueva versión corregida en una sola transacción ACID, vinculando `reemplazaACompraId` y `reemplazadaPorCompraId` |
| `PATCH` | `/api/compras/:id` | `ADMIN`, `VENDEDOR` | Actualización de metadatos informativos (`notas`, `comprobanteReferencia`, `proveedor`, `fecha`) sin alterar inventario ni contabilidad |
| `DELETE`| `/api/compras/:id` | `ADMIN`, `VENDEDOR` | Anulación de compra. Body opcional: `{ motivo?: string }`. Revierte el stock en la sucursal destino y en catálogo global, restituye el dinero a la cuenta de tesorería y marca la compra como `ANULADA` |

---

### 6.18 Tesorería y Cuentas de Dinero
| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/api/admin/finanzas/cuentas` | `ADMIN` | Listado de cuentas (cajas físicas, bancos, QR) y saldos vigentes |
| `POST` | `/api/admin/finanzas/cuentas` | `ADMIN` | Alta de cuenta bancaria o caja física |
| `GET` | `/api/admin/finanzas/cuentas/:id` | `ADMIN` | Detalle de cuenta |
| `PUT` | `/api/admin/finanzas/cuentas/:id` | `ADMIN` | Actualiza datos de cuenta |
| `PATCH` | `/api/admin/finanzas/cuentas/:id` | `ADMIN` | Modifica el estado activo/inactivo de la cuenta (`{ activa: boolean }`) |
| `GET` | `/api/admin/finanzas/cuentas/:id/movimientos` | `ADMIN` | Historial contable de movimientos con saldos anteriores y posteriores |
| `POST` | `/api/admin/finanzas/cuentas/transferencia` | `ADMIN` | Traspaso de fondos entre cuentas (ej. depósito de caja física a banco) |

---

### 6.19 Gastos Operativos
| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/api/admin/finanzas/gastos` | `ADMIN` | Listado de gastos clasificados por categoría y sucursal |
| `POST` | `/api/admin/finanzas/gastos` | `ADMIN` | Registra egreso operativo descontando saldo de la cuenta de dinero |
| `DELETE`| `/api/admin/finanzas/gastos/:id` | `ADMIN` | Anula gasto y reintegra el dinero a la cuenta |

---

### 6.20 Devoluciones y Cambios
| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/api/admin/finanzas/devoluciones` | `ADMIN` | Listado y resumen financiero de devoluciones y cambios procesados |

---

### 6.21 Cierres de Periodo Contable
| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/api/admin/finanzas/periodos` | `ADMIN` | Listado de cierres mensuales o periódicos |
| `POST` | `/api/admin/finanzas/periodos` | `ADMIN` | Congela las métricas del periodo (ingresos, costos, utilidad neta) |
| `POST` | `/api/admin/finanzas/periodos/:id/reabrir` | `ADMIN` | Reabre un periodo cerrado |

---

### 6.22 Reportes Financieros y de Ventas
Todos los endpoints requieren rol `ADMIN`:
| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/admin/finanzas/reportes/estado-resultados` | Estado de Resultados / P&L (Ventas, COGS, Margen Bruto, Gastos, Utilidad Neta) |
| `GET` | `/api/admin/finanzas/reportes/flujo-caja` | Flujo de Caja (entradas, salidas y saldos netos por periodo) |
| `GET` | `/api/reportes` | Resumen ejecutivo de ventas |
| `GET` | `/api/reportes/ventas-diarias` | Serie cronológica de ventas por día |
| `GET` | `/api/reportes/ventas-mensuales` | Comparativa mensual |
| `GET` | `/api/reportes/productos-top` | Ranking de productos más vendidos |
| `GET` | `/api/reportes/variantes-top` | Ranking de tallas y colores más vendidos |
| `GET` | `/api/reportes/canales` | Desglose omnicanal (`WEB`, `WHATSAPP`, `TIENDA`, `APP_QR`) |
| `GET` | `/api/reportes/vendedores` | Desempeño y volumen por vendedor |
| `GET` | `/api/reportes/cancelaciones` | Auditoría de pedidos cancelados, fallidos y reembolsados |
| `GET` | `/api/reportes/inventario-rotacion` | Rotación de stock y días de inventario |

---

### 6.23 Notificaciones y Alertas
| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/api/notificaciones/resumen` | `ADMIN`, `VENDEDOR` | KPIs de stock crítico, pedidos pendientes de pago, comprobantes por verificar y cajas abiertas |

---

### 6.24 Gestión de Usuarios Administrativos
| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `GET` | `/api/usuarios` | `ADMIN` | Listado maestro de usuarios |
| `POST` | `/api/usuarios` | `ADMIN` | Creación de empleado (`VENDEDOR` o `ADMIN`) con asignación de sucursal |
| `PUT` | `/api/usuarios/:id` | `ADMIN` | Actualización de rol, estado activo o sucursal de un empleado |

---

### 6.25 Uploads Multimedia
| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `POST` | `/api/uploads/variantes` | `ADMIN` | Sube fotografía de prenda a Cloudinary (multipart/form-data, max 5 MB) |

---

### 6.26 Operaciones, Mantenimiento y Cron
| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `PATCH` | `/api/admin/delivery-options` | `ADMIN` | Reemplaza atómicamente en MongoDB las opciones de recojo y couriers |
| `GET` | `/api/admin/ops/overview` | `ADMIN` | Panel de observabilidad técnica y alertas de consistencia |
| `POST` | `/api/admin/ops/verify-core` | `ADMIN` | Test E2E de verificación del núcleo transaccional |
| `GET` | `/api/admin/audit-events` | `ADMIN` | Consulta de la pista de auditoría inmutable de eventos de dominio |
| `GET/POST`| `/api/admin/cron/reservas-expiradas`| Cron Secret | Proceso desatendido que libera stock de pedidos vencidos con candado distribuido `CronLock` |

---

## 7. Variables de Entorno

| Variable | Uso |
|---|---|
| `MONGODB_URL` | Cadena de conexión principal a MongoDB |
| `JWT_SECRET` | Clave simétrica para firmar y validar tokens JWT Bearer |
| `JWT_EXPIRES_IN` | Tiempo de vida del token de sesión móvil (ej. `1d`) |
| `NEXTAUTH_SECRET` | Secreto para encriptar sesiones web de NextAuth |
| `NEXTAUTH_URL` | URL base de la web para callbacks de NextAuth |
| `WHATSAPP_INTEGRATION_API_KEY` | Clave estática para autenticar llamadas del Agente WhatsApp |
| `CRON_SECRET` | Secreto Bearer para autorizar ejecuciones del cron de reservas |
| `CLOUDINARY_CLOUD_NAME` | Identificador de Cloudinary |
| `CLOUDINARY_API_KEY` | Llave pública de Cloudinary |
| `CLOUDINARY_API_SECRET` | Llave privada de Cloudinary |
| `TELEGRAM_BOT_TOKEN` | Token del bot de Telegram para notificaciones y links de 1 clic |
| `TELEGRAM_CHAT_ID` | Identificador del chat o canal administrativo de Telegram |
| `NEXT_PUBLIC_APP_URL` | URL base pública para generar enlaces de verificación |
| `BACKUP_ENABLED` | Activa o desactiva la política de copias de seguridad de ops |
