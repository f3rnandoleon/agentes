"use client";

import React, { useEffect, useState, useRef } from "react";

interface SystemPromptEditorProps {
  onUnsavedChange?: (hasChanges: boolean) => void;
}

const AVAILABLE_TOOLS = [
  {
    name: "buscar_modelos",
    category: "Catálogo",
    badgeColor: "bg-blue-50 text-blue-700 border-blue-200",
    desc: "Busca en el catálogo y envía automáticamente el collage inicial de modelos disponibles.",
    params: "categoria (Chompas|Poleras|Ruanas), talla?, color?, q?",
    ruleSnippet: "1. buscar_modelos: Usa únicamente cuando el cliente pida ver modelos o catálogo. Requiere categoría."
  },
  {
    name: "obtener_variantes_modelo",
    category: "Catálogo",
    badgeColor: "bg-blue-50 text-blue-700 border-blue-200",
    desc: "Envía el collage de variantes (colores/tallas) disponibles de un modelo seleccionado.",
    params: "productoId, talla?",
    ruleSnippet: "2. obtener_variantes_modelo: Muestra el collage de variantes del modelo elegido. Conserva la talla si ya la indicó."
  },
  {
    name: "consultar_detalles_modelo",
    category: "Catálogo",
    badgeColor: "bg-blue-50 text-blue-700 border-blue-200",
    desc: "Consulta tallas, colores en stock y precios de un modelo SIN enviar imágenes (solo texto).",
    params: "productoId",
    ruleSnippet: "3. consultar_detalles_modelo: Para dudas de tallas o características sin enviar collages redundantes."
  },
  {
    name: "seleccionar_variante",
    category: "Venta",
    badgeColor: "bg-emerald-50 text-emerald-700 border-emerald-200",
    desc: "Valida y guarda la variante elegida en el contexto antes de pedir cantidad.",
    params: "productoId, varianteId, talla?",
    ruleSnippet: "4. seleccionar_variante: Registra la variante elegida cuando se conozcan modelo, color y talla antes de pedir la cantidad."
  },
  {
    name: "verificar_stock",
    category: "Venta",
    badgeColor: "bg-emerald-50 text-emerald-700 border-emerald-200",
    desc: "Verifica stock en tiempo real para la variante y cantidad solicitada.",
    params: "productoId, varianteId, cantidad, talla?",
    ruleSnippet: "5. verificar_stock: Comprueba disponibilidad real para la cantidad solicitada antes de continuar."
  },
  {
    name: "ver_opciones_entrega",
    category: "Venta",
    badgeColor: "bg-emerald-50 text-emerald-700 border-emerald-200",
    desc: "Obtiene puntos de encuentro, horarios y agencias de envío.",
    params: "Ninguno",
    ruleSnippet: "6. ver_opciones_entrega: Consulta puntos, horarios y modalidades de entrega válidas en el sistema."
  },
  {
    name: "enviar_foto_producto",
    category: "Venta",
    badgeColor: "bg-emerald-50 text-emerald-700 border-emerald-200",
    desc: "Envía una segunda foto individual de detalle de una variante consultada.",
    params: "productoId, varianteId",
    ruleSnippet: "7. enviar_foto_producto: Envía una foto adicional cuando el cliente lo pida o necesite más detalle."
  },
  {
    name: "crear_pedido",
    category: "Pedidos",
    badgeColor: "bg-purple-50 text-purple-700 border-purple-200",
    desc: "Crea el pedido y reserva stock. Genera y envía QR de BancoSol automáticamente si el pago es QR.",
    params: "customerName?, paymentMethod (QR|EFECTIVO), items, delivery, notes?",
    ruleSnippet: "8. crear_pedido: Registra y reserva el pedido solo tras confirmar producto, cantidad, entrega y pago."
  },
  {
    name: "consultar_pedido",
    category: "Pedidos",
    badgeColor: "bg-purple-50 text-purple-700 border-purple-200",
    desc: "Consulta el estado actual de un pedido mediante su número de pedido.",
    params: "numeroPedido",
    ruleSnippet: "9. consultar_pedido: Consulta el estado de un pedido existente con su código o número."
  },
  {
    name: "cancelar_compra",
    category: "Pedidos",
    badgeColor: "bg-purple-50 text-purple-700 border-purple-200",
    desc: "Limpia la selección temporal y carrito cuando el cliente cancela o reinicia.",
    params: "Ninguno",
    ruleSnippet: "10. cancelar_compra: Limpia la selección temporal cuando el cliente cancela o desea reiniciar la compra."
  },
  {
    name: "derivar_humano",
    category: "Soporte",
    badgeColor: "bg-amber-50 text-amber-700 border-amber-200",
    desc: "Transfiere la conversación a un asesor humano y notifica al dueño por WhatsApp (+591 67113105).",
    params: "motivo",
    ruleSnippet: "11. derivar_humano: Transfiere la conversación al asesor humano ante casos especiales, reclamos o peticiones expresas."
  }
];

export default function SystemPromptEditor({ onUnsavedChange }: SystemPromptEditorProps) {
  const [prompt, setPrompt] = useState("");
  const [initialPrompt, setInitialPrompt] = useState("");
  const [defaultPrompt, setDefaultPrompt] = useState("");
  const [isCustom, setIsCustom] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [activeSideTab, setActiveSideTab] = useState<"tools" | "preview" | "tips">("tools");
  const [searchQuery, setSearchQuery] = useState("");
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);

  const isDirty = prompt !== initialPrompt;

  useEffect(() => {
    onUnsavedChange?.(isDirty);
  }, [isDirty, onUnsavedChange]);

  const fetchPrompt = async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/prompt");
      if (!res.ok) throw new Error("No se pudo cargar el System Prompt");
      const data = await res.json();
      setPrompt(data.prompt || "");
      setInitialPrompt(data.prompt || "");
      setDefaultPrompt(data.defaultPrompt || "");
      setIsCustom(Boolean(data.isCustom));
      setUpdatedAt(data.updatedAt ? Number(data.updatedAt) : null);
    } catch (err: any) {
      setFeedback({ type: "error", message: err?.message || "Error al conectar con la API" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPrompt();
  }, []);

  const handleSave = async () => {
    if (!prompt.trim()) {
      setFeedback({ type: "error", message: "El prompt no puede estar vacío." });
      return;
    }
    try {
      setSaving(true);
      setFeedback(null);
      const res = await fetch("/api/prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al guardar");

      setInitialPrompt(prompt);
      setIsCustom(data.isCustom);
      setUpdatedAt(data.updatedAt);
      setFeedback({
        type: "success",
        message: "¡System Prompt guardado exitosamente! Las próximas respuestas del agente aplicarán estas instrucciones."
      });
      setTimeout(() => setFeedback(null), 5000);
    } catch (err: any) {
      setFeedback({ type: "error", message: err?.message || "Error al guardar el prompt" });
    } finally {
      setSaving(false);
    }
  };

  const handleResetToDefault = async () => {
    try {
      setSaving(true);
      setFeedback(null);
      const res = await fetch("/api/prompt", { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Error al restablecer");

      setPrompt(data.prompt);
      setInitialPrompt(data.prompt);
      setIsCustom(false);
      setUpdatedAt(data.updatedAt);
      setConfirmResetOpen(false);
      setFeedback({
        type: "success",
        message: "Se ha restaurado el System Prompt original de FitAndes."
      });
      setTimeout(() => setFeedback(null), 5000);
    } catch (err: any) {
      setFeedback({ type: "error", message: err?.message || "Error al restablecer" });
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => {
    setPrompt(initialPrompt);
    setFeedback({ type: "success", message: "Cambios descartados." });
    setTimeout(() => setFeedback(null), 3000);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Keyboard shortcut Ctrl+S / Cmd+S
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      handleSave();
    }
    // Handle tab key
    if (e.key === "Tab") {
      e.preventDefault();
      const target = e.currentTarget;
      const start = target.selectionStart;
      const end = target.selectionEnd;
      const newPrompt = prompt.substring(0, start) + "  " + prompt.substring(end);
      setPrompt(newPrompt);
      setTimeout(() => {
        target.selectionStart = target.selectionEnd = start + 2;
      }, 0);
    }
  };

  // Sync scroll between line numbers and textarea
  const handleScroll = () => {
    if (lineNumbersRef.current && textareaRef.current) {
      lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  const insertSnippetAtCursor = (snippet: string) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      setPrompt((prev) => prev + "\n" + snippet);
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const newText = prompt.substring(0, start) + snippet + prompt.substring(end);
    setPrompt(newText);
    setTimeout(() => {
      textarea.focus();
      textarea.selectionStart = textarea.selectionEnd = start + snippet.length;
    }, 0);
  };

  const lines = prompt.split("\n");
  const charCount = prompt.length;
  const wordCount = prompt.trim() ? prompt.trim().split(/\s+/).length : 0;
  const tokenEstimate = Math.ceil(charCount / 4);

  const filteredTools = AVAILABLE_TOOLS.filter((t) =>
    searchQuery
      ? t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.desc.toLowerCase().includes(searchQuery.toLowerCase()) ||
        t.category.toLowerCase().includes(searchQuery.toLowerCase())
      : true
  );

  if (loading) {
    return (
      <main className="flex flex-1 items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-300 border-t-ocean" />
          <p className="text-sm font-medium text-slate-500">Cargando System Prompt...</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-w-0 flex-1 flex-col overflow-hidden bg-slate-50">
      {/* Top Banner / Actions Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 bg-white px-6 py-4 shadow-xs">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-cyan-100 text-sm text-ocean">🤖</span>
            <h2 className="text-base font-bold text-ink">Editor de System Prompt</h2>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                isCustom
                  ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                  : "bg-slate-100 text-slate-600 border border-slate-200"
              }`}
            >
              {isCustom ? "Personalizado" : "Por defecto"}
            </span>
            {isDirty && (
              <span className="flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700 border border-amber-200 animate-pulse">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                Sin guardar
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted-ink">
            Instrucciones base del agente en WhatsApp. Controla su comportamiento, tono y uso de herramientas.
          </p>
        </div>

        {/* Toolbar Buttons */}
        <div className="flex items-center gap-2">
          {/* Stats pills */}
          <div className="hidden sm:flex items-center gap-3 rounded-xl bg-slate-100 px-3 py-1.5 text-xs text-slate-600">
            <span><strong>{lines.length}</strong> líneas</span>
            <span>•</span>
            <span><strong>{charCount.toLocaleString()}</strong> caracteres</span>
            <span>•</span>
            <span>~<strong>{tokenEstimate.toLocaleString()}</strong> tokens</span>
          </div>

          <button
            onClick={handleCopy}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 transition"
            title="Copiar texto al portapapeles"
          >
            {copied ? "✓ Copiado" : "Copiar"}
          </button>

          <button
            onClick={() => setConfirmResetOpen(true)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50 hover:text-red-600 transition"
            title="Restablecer al prompt original de fábrica"
          >
            Restaurar original
          </button>

          {isDirty && (
            <button
              onClick={handleDiscard}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition"
            >
              Descartar
            </button>
          )}

          <button
            onClick={handleSave}
            disabled={saving || !isDirty}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold shadow-sm transition ${
              isDirty
                ? "bg-ocean text-white hover:opacity-90 hover:shadow"
                : "bg-slate-200 text-slate-400 cursor-not-allowed"
            }`}
          >
            {saving ? (
              <>
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                <span>Guardando...</span>
              </>
            ) : (
              <>
                <span>Guardar cambios</span>
                <kbd className="hidden md:inline rounded bg-white/20 px-1 py-0.5 text-[10px] font-mono">Ctrl+S</kbd>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Floating feedback alert */}
      {feedback && (
        <div
          className={`mx-6 mt-3 flex items-center justify-between rounded-xl p-3 text-xs font-medium shadow-sm transition-all ${
            feedback.type === "success"
              ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
              : "bg-red-50 text-red-800 border border-red-200"
          }`}
        >
          <span>{feedback.message}</span>
          <button
            onClick={() => setFeedback(null)}
            className="ml-3 font-bold text-slate-500 hover:text-slate-800"
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Workspace (Editor + Side Helper) */}
      <div className="flex min-h-0 flex-1 overflow-hidden p-6 gap-6">
        {/* Left: Code/Text Editor */}
        <section className="flex flex-1 flex-col rounded-2xl border border-slate-200/90 bg-white shadow-xs overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-4 py-2.5">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="font-semibold text-slate-700">system-prompt.md</span>
              <span>•</span>
              <span>UTF-8</span>
              <span>•</span>
              <span>Markdown</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => insertSnippetAtCursor("\n## NUEVA REGLA\n- ")}
                className="rounded-lg bg-white px-2 py-1 text-[11px] font-medium text-slate-600 border border-slate-200 hover:bg-slate-50"
              >
                + Regla
              </button>
              <button
                onClick={() =>
                  insertSnippetAtCursor("\n- Si el cliente solicita catálogo, responde amablemente y usa `buscar_modelos`.")
                }
                className="rounded-lg bg-white px-2 py-1 text-[11px] font-medium text-slate-600 border border-slate-200 hover:bg-slate-50"
              >
                + Ejemplo
              </button>
            </div>
          </div>

          <div className="relative flex flex-1 overflow-hidden bg-slate-900 text-slate-100 font-mono text-xs md:text-sm">
            {/* Line numbers column */}
            <div
              ref={lineNumbersRef}
              className="w-12 select-none overflow-hidden bg-slate-950/60 py-4 text-right pr-3 font-mono text-xs text-slate-600 border-r border-slate-800/80 leading-6"
            >
              {lines.map((_, i) => (
                <div key={i}>{i + 1}</div>
              ))}
            </div>

            {/* Editable Textarea */}
            <textarea
              ref={textareaRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              onScroll={handleScroll}
              spellCheck={false}
              className="scrollbar flex-1 resize-none bg-transparent p-4 font-mono leading-6 text-slate-100 outline-none selection:bg-cyan-500/30 overflow-y-auto"
              placeholder="Escribe el System Prompt del agente aquí..."
            />
          </div>

          <div className="flex items-center justify-between border-t border-slate-100 bg-white px-4 py-2 text-[11px] text-muted-ink">
            <span>Presiona <kbd className="font-mono rounded bg-slate-100 px-1 border border-slate-200">Tab</kbd> para indentar o <kbd className="font-mono rounded bg-slate-100 px-1 border border-slate-200">Ctrl+S</kbd> para guardar al instante.</span>
            {updatedAt && (
              <span>Última modificación: {new Date(updatedAt).toLocaleString()}</span>
            )}
          </div>
        </section>

        {/* Right: Helper Panel / Reference */}
        <aside className="hidden lg:flex w-96 flex-col rounded-2xl border border-slate-200/90 bg-white shadow-xs overflow-hidden">
          {/* Tabs header */}
          <div className="flex border-b border-slate-200 bg-slate-50/70 p-1">
            <button
              onClick={() => setActiveSideTab("tools")}
              className={`flex-1 rounded-xl py-2 text-xs font-bold transition ${
                activeSideTab === "tools"
                  ? "bg-white text-ink shadow-xs"
                  : "text-muted-ink hover:text-ink"
              }`}
            >
              🛠 Tools ({AVAILABLE_TOOLS.length})
            </button>
            <button
              onClick={() => setActiveSideTab("preview")}
              className={`flex-1 rounded-xl py-2 text-xs font-bold transition ${
                activeSideTab === "preview"
                  ? "bg-white text-ink shadow-xs"
                  : "text-muted-ink hover:text-ink"
              }`}
            >
              👁 Vista previa
            </button>
            <button
              onClick={() => setActiveSideTab("tips")}
              className={`flex-1 rounded-xl py-2 text-xs font-bold transition ${
                activeSideTab === "tips"
                  ? "bg-white text-ink shadow-xs"
                  : "text-muted-ink hover:text-ink"
              }`}
            >
              💡 Consejos
            </button>
          </div>

          {/* Tab 1: Tools Catalog */}
          {activeSideTab === "tools" && (
            <div className="flex flex-1 flex-col min-h-0">
              <div className="p-3 border-b border-slate-100">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filtrar herramientas..."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-ink outline-none focus:border-ocean focus:bg-white"
                />
              </div>

              <div className="scrollbar flex-1 overflow-y-auto p-3 space-y-2.5">
                {filteredTools.map((t) => (
                  <div
                    key={t.name}
                    className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-3 hover:bg-slate-50 transition"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <code className="text-xs font-bold text-ocean">{t.name}</code>
                      <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-semibold border ${t.badgeColor}`}>
                        {t.category}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-600 leading-snug">{t.desc}</p>
                    <div className="mt-2 text-[11px] text-muted-ink font-mono truncate">
                      params: {t.params}
                    </div>
                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={() => insertSnippetAtCursor(`\n- ${t.name}: `)}
                        className="rounded-md bg-white border border-slate-200 px-2 py-1 text-[10px] font-medium text-slate-700 hover:border-ocean hover:text-ocean transition"
                      >
                        + Insertar mención
                      </button>
                      <button
                        onClick={() => insertSnippetAtCursor(`\n${t.ruleSnippet}`)}
                        className="rounded-md bg-white border border-slate-200 px-2 py-1 text-[10px] font-medium text-slate-700 hover:border-ocean hover:text-ocean transition"
                      >
                        + Insertar regla
                      </button>
                    </div>
                  </div>
                ))}
                {filteredTools.length === 0 && (
                  <p className="py-8 text-center text-xs text-muted-ink">No se encontraron herramientas con ese nombre.</p>
                )}
              </div>
            </div>
          )}

          {/* Tab 2: Rendered Markdown Preview */}
          {activeSideTab === "preview" && (
            <div className="scrollbar flex-1 overflow-y-auto p-4 text-xs text-ink space-y-3 leading-relaxed">
              <div className="rounded-xl bg-cyan-50/70 p-2.5 text-[11px] text-ocean border border-cyan-100">
                Esta es la visualización estructurada de cómo el modelo lee las secciones del prompt.
              </div>
              <div className="prose prose-xs max-w-none text-slate-700 whitespace-pre-wrap font-sans">
                {prompt}
              </div>
            </div>
          )}

          {/* Tab 3: Tips & Best Practices */}
          {activeSideTab === "tips" && (
            <div className="scrollbar flex-1 overflow-y-auto p-4 space-y-4 text-xs">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <h4 className="font-bold text-ink">📱 Formato WhatsApp</h4>
                <ul className="mt-1.5 list-disc pl-4 space-y-1 text-slate-600 text-[11px]">
                  <li>Mantén respuestas de 1 a 3 oraciones.</li>
                  <li>No satures de emojis; úsalos con moderación.</li>
                  <li>Haz máximo una pregunta a la vez.</li>
                </ul>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <h4 className="font-bold text-ink">🖼 Regla de Oro de Collages</h4>
                <ul className="mt-1.5 list-disc pl-4 space-y-1 text-slate-600 text-[11px]">
                  <li>Solo enviar collages al mostrar catálogo o variantes de color.</li>
                  <li>Nunca enviar imágenes si el cliente solo hace preguntas de tallas o tela.</li>
                  <li>Usa <code>consultar_detalles_modelo</code> para responder dudas por texto.</li>
                </ul>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <h4 className="font-bold text-ink">💳 Pagos y Cierre</h4>
                <ul className="mt-1.5 list-disc pl-4 space-y-1 text-slate-600 text-[11px]">
                  <li>Envío nacional requiere obligatoriamente QR BancoSol.</li>
                  <li>Punto de encuentro admite Efectivo o QR.</li>
                  <li>Al derivar a humano, enviar el WhatsApp: <strong>+591 67113105</strong>.</li>
                </ul>
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* Confirmation Modal for Reset */}
      {confirmResetOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-base font-bold text-ink">¿Restablecer al System Prompt original?</h3>
            <p className="mt-2 text-xs text-slate-600 leading-relaxed">
              Esta acción reemplazará las instrucciones actuales con la versión oficial inicial de FitAndes. Se perderán las modificaciones no guardadas.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setConfirmResetOpen(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleResetToDefault}
                className="rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-red-700"
              >
                Sí, restablecer
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
