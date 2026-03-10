"use client";

import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export default function Toasts() {
  const { toasts, removeToast } = useAppStore();

  if (!toasts || toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 flex flex-col gap-2 z-50">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            "animate-slide-up px-4 py-3 rounded-lg shadow-elevated text-sm font-medium flex items-center gap-3 min-w-[280px]",
            toast.type === "success" && "bg-emerald-600 text-white",
            toast.type === "error" && "bg-red-600 text-white",
            toast.type === "info" && "bg-surface-800 text-white"
          )}
        >
          <span className="flex-1">{toast.message}</span>
          <button
            onClick={() => removeToast(toast.id)}
            className="opacity-70 hover:opacity-100"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}