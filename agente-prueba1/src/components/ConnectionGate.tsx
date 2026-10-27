"use client";

import { useEffect, useState } from "react";
import ConfigScreen from "./ConfigScreen";
import DashboardHeader from "./DashboardHeader";
import ConversationList from "./ConversationList";
import ConversationPanel from "./ConversationPanel";
import SystemPromptEditor from "./SystemPromptEditor";

export default function ConnectionGate() {
  const [status, setStatus] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"conversations" | "prompt">("conversations");
  const [hasUnsavedPromptChanges, setHasUnsavedPromptChanges] = useState<boolean>(false);

  async function check() {
    try {
      const r = await fetch("/api/connection/status");
      setStatus(await r.json());
    } catch {
      setStatus({ status: "error", message: "Error al comprobar estado de conexión" });
    }
  }

  async function load() {
    try {
      const r = await fetch("/api/conversations");
      const x = await r.json();
      setItems(Array.isArray(x) ? x : []);
      if (selected && !x.some((c: any) => c.id === selected)) {
        setSelected(null);
      }
    } catch (e) {
      console.error("Error loading conversations:", e);
    }
  }

  useEffect(() => {
    check();
  }, []);

  useEffect(() => {
    if (status?.status !== "connected") return;
    load();
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, [status?.status, selected]);

  if (!status) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm font-medium text-slate-600">
        Comprobando conexión con WhatsApp...
      </div>
    );
  }

  if (status.status !== "connected") {
    return <ConfigScreen status={status} onRetry={check} />;
  }

  const current = items.find((c) => c.id === selected) || null;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-slate-50">
      <DashboardHeader
        phone={status.phone}
        onRefresh={check}
        activeTab={activeTab}
        onTabChange={(tab) => {
          if (
            hasUnsavedPromptChanges &&
            tab !== "prompt" &&
            !confirm("Tienes cambios sin guardar en el System Prompt. ¿Seguro que deseas salir?")
          ) {
            return;
          }
          setActiveTab(tab);
        }}
        hasUnsavedChanges={hasUnsavedPromptChanges}
      />

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {activeTab === "conversations" ? (
          <>
            <ConversationList items={items} selected={selected} onSelect={setSelected} />
            <ConversationPanel conversation={current} onChanged={load} />
          </>
        ) : (
          <SystemPromptEditor onUnsavedChange={setHasUnsavedPromptChanges} />
        )}
      </div>
    </div>
  );
}
