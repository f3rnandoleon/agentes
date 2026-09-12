import OpenAI from "openai";
import { createCatalogImage } from "./catalog-image";
import { createWhatsAppOrder, deliveryOptions, orderStatus, productDetail, searchCatalog, uploadPaymentProof } from "./fit-andes-api";
import { getSalesContext, latestPendingWhatsAppOrder, saveSalesContext, saveWhatsAppOrder, setMode, setWhatsAppOrderStatus, type SalesContext } from "./db";
import { downloadWhatsAppMedia, sendImageBuffer, sendImageMessage, sendTextMessage } from "./meta/client";
import { SYSTEM_PROMPT } from "./system-prompt";

type Context = { phone:string; name:string|null; conversationId:number; messageId:string };
type Variant = { varianteId:string; color?:string; colorSecundario?:string; talla?:string; stock?:number; stockReservado?:number; stockDisponible?:number; descripcion?:string; imagen?:string; imagenes?:string[] };
type Product = { _id:string; nombre:string; modelo?:string; categoria?:string; precioVenta?:number; variantes?:Variant[] };
type ModelOption = { numero:number; productoId:string; nombre:string; modelo:string; categoria?:string; precioVenta?:number; varianteRepresentativa:Variant };
type VariantOption = { numero:number; productoId:string; nombre:string; modelo:string; precioVenta?:number; variante:Variant };

const ownerPhone="59167113105";
const tools:any[]=[
  {type:"function",function:{name:"buscar_modelos",description:"Busca modelos compatibles en la base real. Requiere categoría y talla; muestra un collage con una sola imagen por modelo y solo variantes disponibles.",parameters:{type:"object",properties:{categoria:{type:"string"},talla:{type:"string"},color:{type:"string"},q:{type:"string",description:"Estilo, material, modelo u otro filtro textual del cliente."}},required:["categoria","talla"],additionalProperties:false}}},
  {type:"function",function:{name:"obtener_variantes_modelo",description:"Después de que el cliente elija un modelo, obtiene y muestra únicamente sus variantes disponibles para la talla elegida.",parameters:{type:"object",properties:{productoId:{type:"string"},talla:{type:"string"}},required:["productoId","talla"],additionalProperties:false}}},
  {type:"function",function:{name:"seleccionar_variante",description:"Valida la variante elegida contra los datos actuales y guarda la selección exacta antes de preguntar cantidad.",parameters:{type:"object",properties:{productoId:{type:"string"},varianteId:{type:"string"},talla:{type:"string"}},required:["productoId","varianteId","talla"],additionalProperties:false}}},
  {type:"function",function:{name:"verificar_stock",description:"Consulta nuevamente el producto en la base real y verifica el stock disponible para la variante exacta y cantidad solicitada. Úsala siempre antes de confirmar cantidad o continuar la compra.",parameters:{type:"object",properties:{productoId:{type:"string"},varianteId:{type:"string"},talla:{type:"string"},cantidad:{type:"integer",minimum:1}},required:["productoId","varianteId","talla","cantidad"],additionalProperties:false}}},
  {type:"function",function:{name:"ver_opciones_entrega",description:"Obtiene puntos, horarios y agencias válidas para ofrecer una entrega.",parameters:{type:"object",properties:{},additionalProperties:false}}},
  {type:"function",function:{name:"enviar_foto_producto",description:"Envía al cliente la segunda foto disponible de una variante ya consultada.",parameters:{type:"object",properties:{productoId:{type:"string"},varianteId:{type:"string"}},required:["productoId","varianteId"],additionalProperties:false}}},
  {type:"function",function:{name:"crear_pedido",description:"Crea el pedido y reserva stock atómicamente en el sistema central, solo después de confirmar producto, variante, cantidad, entrega y pago. En envío nacional paymentMethod debe ser QR; en punto de encuentro admite EFECTIVO o QR.",parameters:{type:"object",properties:{customerName:{type:"string"},paymentMethod:{type:"string",enum:["QR","EFECTIVO"]},items:{type:"array",items:{type:"object",properties:{productoId:{type:"string"},varianteId:{type:"string"},cantidad:{type:"integer",minimum:1}},required:["productoId","varianteId","cantidad"],additionalProperties:false}},delivery:{type:"object",properties:{method:{type:"string",enum:["PICKUP_POINT","SHIPPING_NATIONAL"]},scheduledFor:{type:"string"},pickupPointId:{type:"string"},pickupScheduleId:{type:"string"},department:{type:"string"},city:{type:"string"},shippingCompanyId:{type:"string"},branch:{type:"string"},recipientName:{type:"string"},recipientCi:{type:"string"},phone:{type:"string"}},required:["method","scheduledFor","recipientName","phone"],additionalProperties:false},notes:{type:"string"}},required:["items","delivery","paymentMethod"],additionalProperties:false}}},
  {type:"function",function:{name:"consultar_pedido",description:"Consulta el estado de un pedido Fit Andes del cliente actual.",parameters:{type:"object",properties:{numeroPedido:{type:"string"}},required:["numeroPedido"],additionalProperties:false}}},
  {type:"function",function:{name:"cancelar_compra",description:"Limpia la selección y carrito temporal de la conversación cuando el cliente cancela o decide empezar otra compra.",parameters:{type:"object",properties:{},additionalProperties:false}}},
  {type:"function",function:{name:"derivar_humano",description:"Deriva la conversación a un asesor humano si el cliente lo solicita o hay una excepción.",parameters:{type:"object",properties:{motivo:{type:"string"}},required:["motivo"],additionalProperties:false}}}
];

function client() { const key=process.env.OPENROUTER_API_KEY; if(!key) throw new Error("OPENROUTER_API_KEY no configurada"); return new OpenAI({apiKey:key,baseURL:"https://openrouter.ai/api/v1"}); }
function parse(value:string|undefined) { try { return value?JSON.parse(value):{}; } catch { return {}; } }
function unwrapProduct(result:any):Product { return (result?.data??result) as Product; }
function availableStock(variant:Variant) { return variant.stockDisponible??((variant.stock??0)-(variant.stockReservado??0)); }
function isAvailable(variant:Variant) { return availableStock(variant)>0; }
function sameSize(variant:Variant,size:string) { return String(variant.talla??"").trim().toLowerCase()===size.trim().toLowerCase(); }
function secondVariantImage(variant:Variant) { return variant.imagenes?.[1]??variant.imagen??variant.imagenes?.[0]; }
function modelName(product:Product) { return product.modelo?.trim()||product.nombre; }
function variantLabel(variant:Variant) { return [variant.color,variant.colorSecundario,variant.talla&&`Talla ${variant.talla}`].filter(Boolean).join(" · "); }
function contextForPrompt(state:SalesContext) {
  const safe={...state};
  return Object.keys(safe).length?`\n\nContexto comercial persistente (interno): ${JSON.stringify(safe)}. Usa sus IDs únicamente para llamar herramientas; jamás los muestres al cliente.`:"";
}
async function notifyOwner(text:string) { try { await sendTextMessage(ownerPhone,text); } catch(error) { console.error("[fit-andes] no se pudo notificar al asesor:",error); } }
async function sendCollage(phone:string, options:{number:number;imageUrl:string;label:string}[], caption:string) { if(!options.length) return false; await sendImageBuffer(phone,await createCatalogImage(options),caption); return true; }

async function buscarModelos(args:any,ctx:Context) {
  const products=await searchCatalog({categoria:args.categoria,talla:args.talla,color:args.color,q:args.q});
  const models:ModelOption[]=(products as Product[]).flatMap((product)=>{
    const representative=product.variantes?.find((variant)=>sameSize(variant,args.talla)&&isAvailable(variant));
    return representative?[{numero:0,productoId:product._id,nombre:product.nombre,modelo:modelName(product),categoria:product.categoria,precioVenta:product.precioVenta,varianteRepresentativa:representative}]:[];
  }).slice(0,10).map((model,index)=>({...model,numero:index+1}));
  const sent=await sendCollage(ctx.phone,models.flatMap((model)=>{ const imageUrl=secondVariantImage(model.varianteRepresentativa); return imageUrl?[{number:model.numero,imageUrl,label:`${model.modelo}${model.precioVenta!==undefined?` · Bs ${model.precioVenta}`:""}`}]:[]; }),"Modelos disponibles: responde con el número o nombre del modelo que prefieras.");
  const state:SalesContext={category:args.categoria,size:args.talla,filters:Object.fromEntries(Object.entries({color:args.color,q:args.q}).filter(([,value])=>typeof value==="string"&&value.trim())),models,variants:[],selectedModel:undefined,selectedVariant:undefined,quantity:undefined,stage:"AWAIT_MODEL"};
  await saveSalesContext(ctx.conversationId,state);
  return {catalogoEnviado:sent,modelos:models.map(({varianteRepresentativa,...model})=>({...model,varianteRepresentativa:{color:varianteRepresentativa.color,talla:varianteRepresentativa.talla,stockDisponible:availableStock(varianteRepresentativa)}}))};
}

async function obtenerVariantesModelo(args:any,ctx:Context) {
  const state=await getSalesContext(ctx.conversationId); const product=unwrapProduct(await productDetail(args.productoId));
  const variants:VariantOption[]=(product.variantes??[]).filter((variant)=>sameSize(variant,args.talla)&&isAvailable(variant)).map((variant,index)=>({numero:index+1,productoId:product._id,nombre:product.nombre,modelo:modelName(product),precioVenta:product.precioVenta,variante:variant}));
  const sent=await sendCollage(ctx.phone,variants.flatMap((option)=>{ const imageUrl=secondVariantImage(option.variante); return imageUrl?[{number:option.numero,imageUrl,label:variantLabel(option.variante)}]:[]; }),`Variantes disponibles de ${modelName(product)}: responde con el número o color que prefieras.`);
  await saveSalesContext(ctx.conversationId,{...state,size:args.talla,selectedModel:{productoId:product._id,nombre:product.nombre,modelo:modelName(product),precioVenta:product.precioVenta},variants,selectedVariant:undefined,quantity:undefined,stage:"AWAIT_VARIANT"});
  return {catalogoEnviado:sent,modelo:{productoId:product._id,nombre:product.nombre,modelo:modelName(product),precioVenta:product.precioVenta},variantes:variants.map(({variante,...option})=>({...option,variante:{color:variante.color,colorSecundario:variante.colorSecundario,talla:variante.talla,descripcion:variante.descripcion,stockDisponible:availableStock(variante)}}))};
}

async function seleccionarVariante(args:any,ctx:Context) {
  const state=await getSalesContext(ctx.conversationId); const product=unwrapProduct(await productDetail(args.productoId)); const variant=product.variantes?.find((item)=>item.varianteId===args.varianteId&&sameSize(item,args.talla));
  if(!variant) return {ok:false,message:"La variante elegida ya no existe para esa talla. Muestra nuevamente las variantes."};
  if(!isAvailable(variant)) return {ok:false,message:"La variante elegida se agotó. Muestra las otras variantes disponibles del mismo modelo."};
  const selected={productoId:product._id,varianteId:variant.varianteId,nombre:product.nombre,modelo:modelName(product),precioVenta:product.precioVenta,color:variant.color,colorSecundario:variant.colorSecundario,talla:variant.talla,descripcion:variant.descripcion,stockDisponible:availableStock(variant)};
  await saveSalesContext(ctx.conversationId,{...state,selectedVariant:selected,quantity:undefined,stage:"AWAIT_QUANTITY"});
  return {ok:true,variante:selected};
}

async function verificarStock(args:any,ctx:Context) {
  const state=await getSalesContext(ctx.conversationId); const product=unwrapProduct(await productDetail(args.productoId)); const variant=product.variantes?.find((item)=>item.varianteId===args.varianteId&&sameSize(item,args.talla));
  if(!variant) return {ok:false,message:"La variante ya no existe para esa talla.",disponible:0};
  const disponible=availableStock(variant); const suficiente=disponible>=args.cantidad;
  const selected={productoId:product._id,varianteId:variant.varianteId,nombre:product.nombre,modelo:modelName(product),precioVenta:product.precioVenta,color:variant.color,colorSecundario:variant.colorSecundario,talla:variant.talla,descripcion:variant.descripcion,stockDisponible:disponible};
  await saveSalesContext(ctx.conversationId,{...state,selectedVariant:selected,quantity:args.cantidad,stage:suficiente?"AWAIT_DELIVERY":"AWAIT_QUANTITY"});
  return {ok:true,suficiente,solicitada:args.cantidad,disponible,producto:selected,precioUnitario:product.precioVenta,total:(product.precioVenta??0)*args.cantidad};
}

async function runTool(name:string,args:any,ctx:Context) {
  if(name==="buscar_modelos") return buscarModelos(args,ctx);
  if(name==="obtener_variantes_modelo") return obtenerVariantesModelo(args,ctx);
  if(name==="seleccionar_variante") return seleccionarVariante(args,ctx);
  if(name==="verificar_stock") return verificarStock(args,ctx);
  if(name==="ver_opciones_entrega") return deliveryOptions();
  if(name==="enviar_foto_producto") { const product=unwrapProduct(await productDetail(args.productoId)); const variant=product.variantes?.find((item)=>item.varianteId===args.varianteId); const image=variant&&secondVariantImage(variant); if(!image) return {ok:false,message:"No hay imagen disponible para esa variante."}; await sendImageMessage(ctx.phone,image,`${product.nombre} · ${variantLabel(variant)}`); return {ok:true,message:"Foto enviada al cliente."}; }
  if(name==="crear_pedido") { const paymentMethod=args.delivery.method==="SHIPPING_NATIONAL"?"QR":args.paymentMethod; if(paymentMethod!=="QR"&&paymentMethod!=="EFECTIVO") return {ok:false,message:"Método de pago no válido."}; const body={idempotencyKey:ctx.messageId,customer:{phone:ctx.phone,name:args.customerName??ctx.name??undefined},items:args.items,paymentMethod,delivery:{...args.delivery,phone:args.delivery.phone||ctx.phone,recipientName:args.delivery.recipientName||args.customerName||ctx.name||"Cliente"},notes:args.notes}; const order=await createWhatsAppOrder(body); if(paymentMethod==="QR"&&order.pagoId) await saveWhatsAppOrder(ctx.conversationId,{numeroPedido:order.numeroPedido,pagoId:order.pagoId,estado:order.estado}); if(paymentMethod==="QR"&&order.paymentInstructions?.qrImageUrl) await sendImageMessage(ctx.phone,order.paymentInstructions.qrImageUrl,`QR BancoSol · Pedido ${order.numeroPedido} · Total Bs ${order.total}`); if(order.notification?.text) await notifyOwner(order.notification.text); const state=await getSalesContext(ctx.conversationId); await saveSalesContext(ctx.conversationId,{...state,stage:"ORDER_CREATED"}); return {numeroPedido:order.numeroPedido,total:order.total,costoEnvio:order.costoEnvio,estado:order.estado,vencimientoReserva:order.vencimientoReserva,metodoPago:paymentMethod,qrEnviado:paymentMethod==="QR"&&Boolean(order.paymentInstructions?.qrImageUrl)}; }
  if(name==="consultar_pedido") return orderStatus(args.numeroPedido,ctx.phone);
  if(name==="cancelar_compra") { await saveSalesContext(ctx.conversationId,{}); return {ok:true,message:"Compra temporal cancelada."}; }
  if(name==="derivar_humano") { await setMode(ctx.conversationId,"HUMAN"); await notifyOwner(`Atención humana solicitada por ${ctx.name??ctx.phone} (${ctx.phone}). Motivo: ${args.motivo}`); return {ok:true,message:"Conversación derivada al asesor humano."}; }
  return {ok:false,message:"Herramienta desconocida"};
}

export async function respondToFitAndes(history:{role:string;content:string}[],ctx:Context) {
  const state=await getSalesContext(ctx.conversationId);
  const messages:any[]=[{role:"system",content:`${SYSTEM_PROMPT}${contextForPrompt(state)}`},...history.map((message)=>({role:message.role==="user"?"user":"assistant",content:message.content}))];
  for(let round=0;round<6;round++) { const completion=await client().chat.completions.create({model:process.env.OPENROUTER_MODEL??"openai/gpt-4o-mini",messages,tools,tool_choice:"auto"}); const message:any=completion.choices[0]?.message; if(!message) throw new Error("OpenRouter no devolvió una respuesta"); messages.push(message); if(!message.tool_calls?.length) return message.content?.trim()||"Déjame derivarte con un asesor humano."; for(const call of message.tool_calls) { let result:unknown; try { result=await runTool(call.function.name,parse(call.function.arguments),ctx); } catch(error) { result={ok:false,message:error instanceof Error?error.message:"No se pudo consultar el sistema"}; } messages.push({role:"tool",tool_call_id:call.id,content:JSON.stringify(result)}); } }
  return "Estoy verificando los detalles con el sistema. Un asesor te ayudará enseguida.";
}

export async function registerPaymentProof(ctx:Context,mediaId:string) { const order=await latestPendingWhatsAppOrder(ctx.conversationId); if(!order) return "No encuentro un pedido pendiente de pago en este chat. Envíame primero el número de pedido o pide ayuda a un asesor."; const media=await downloadWhatsAppMedia(mediaId); const result=await uploadPaymentProof(order.pago_id,media.bytes,media.mimeType); await setWhatsAppOrderStatus(order.numero_pedido,"PROOF_UPLOADED"); if(result.notification?.text) await notifyOwner(result.notification.text); return `Listo, registramos tu comprobante del pedido ${order.numero_pedido}. Un asesor validará el pago y te confirmará por este medio.`; }
