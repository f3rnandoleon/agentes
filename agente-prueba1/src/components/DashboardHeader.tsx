export default function DashboardHeader({
  phone,
  onRefresh,
  activeTab = "conversations",
  onTabChange,
  hasUnsavedChanges = false
}: {
  phone: string;
  onRefresh: () => void;
  activeTab?: "conversations" | "prompt";
  onTabChange?: (tab: "conversations" | "prompt") => void;
  hasUnsavedChanges?: boolean;
}) {
  return (
    <header className="flex min-h-20 flex-wrap items-center justify-between gap-4 border-b border-slate-200/80 bg-white px-5 py-3 shadow-xs sm:px-8">
      {/* Brand & Phone */}
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-navy text-lg text-white shadow-lg shadow-slate-300">
          ✦
        </div>
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-ocean">Centro de control</p>
          <h1 className="text-lg font-bold tracking-tight text-ink">Agente WhatsApp</h1>
          <p className="text-xs text-muted-ink">{phone}</p>
        </div>
      </div>

      {/* Navigation Tabs */}
      {onTabChange && (
        <nav className="flex items-center gap-1 rounded-2xl bg-slate-100 p-1">
          <button
            onClick={() => onTabChange("conversations")}
            className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs sm:text-sm font-semibold transition ${
              activeTab === "conversations"
                ? "bg-navy text-white shadow-sm"
                : "text-slate-600 hover:text-ink hover:bg-white/60"
            }`}
          >
            <span>💬</span>
            <span>Conversaciones</span>
          </button>

          <button
            onClick={() => onTabChange("prompt")}
            className={`relative flex items-center gap-2 rounded-xl px-4 py-2 text-xs sm:text-sm font-semibold transition ${
              activeTab === "prompt"
                ? "bg-navy text-white shadow-sm"
                : "text-slate-600 hover:text-ink hover:bg-white/60"
            }`}
          >
            <span>🤖</span>
            <span>System Prompt</span>
            {hasUnsavedChanges && (
              <span
                className="h-2 w-2 rounded-full bg-amber-500 animate-pulse"
                title="Cambios sin guardar"
              />
            )}
          </button>
        </nav>
      )}

      {/* Action button */}
      <div className="flex items-center gap-3">
        <button
          onClick={onRefresh}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-2xs transition hover:-translate-y-0.5 hover:border-ocean hover:text-ocean hover:shadow-xs"
        >
          Actualizar
        </button>
      </div>
    </header>
  );
}
