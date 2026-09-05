# Agente WhatsApp

Dashboard Next.js para WhatsApp Cloud API oficial de Meta, con SQLite local, respuestas mediante OpenRouter y modos IA/HUMANO por conversación.

## Desarrollo

Requiere Node.js 20+. Copia `.env.example` a `.env.local` y completa las credenciales. `META_ACCESS_TOKEN` debe ser un System User Token permanente; los tokens de prueba duran 24 horas. `META_VERIFY_TOKEN` es un texto elegido por ti y debe coincidir con el configurado en Meta. `META_APP_SECRET` aparece en App Dashboard → Settings → Basic.

```bash
npm install
npm run dev
```

Para probar webhooks localmente:

```bash
ngrok http 3000
```

Configura en Meta la URL `https://TU_URL/api/webhook`, el mismo `META_VERIFY_TOKEN` y suscribe el campo `messages`. No hay QR ni sesión de WhatsApp Web.

## Meta

1. Crea una app en [Meta for Developers](https://developers.facebook.com/) y agrega WhatsApp.
2. Copia Phone Number ID, WABA ID y App Secret.
3. Genera un System User Token permanente con permisos de WhatsApp.
4. Configura el webhook HTTPS y suscríbelo a `messages`.

El endpoint GET devuelve `hub.challenge` como texto plano. El POST valida `X-Hub-Signature-256` sobre el body raw, responde 200 inmediatamente y deduplica por `message.id`.

## Personalización y límites

Edita `src/lib/system-prompt.ts` para adaptar el asistente al negocio. WhatsApp solo permite texto libre durante la ventana de 24 horas desde el último mensaje del cliente; fuera de ella Graph devuelve normalmente el error `131047`. Las plantillas quedan fuera del alcance de v1.

El dashboard no tiene autenticación: protégelo con Basic Auth o Cloudflare Access antes de publicarlo. SQLite vive en `data/messages.db`; en producción monta un volumen persistente en `/app/data`.

## Mejoras pendientes

- Plantillas de re-engagement y soporte de mensajes multimedia.
- Autenticación del dashboard y cola persistente para procesamiento.
