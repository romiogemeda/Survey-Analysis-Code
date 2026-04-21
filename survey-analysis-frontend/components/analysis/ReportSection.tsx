"use client";

import React, { useState, useRef, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import { RefreshCw, Pencil, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SectionKey } from "@/types";
import { SECTION_TITLES } from "@/types";

interface ReportSectionProps {
  sectionKey: SectionKey;
  content: string;
  chartImage?: string | null;
  onSave: (sectionKey: SectionKey, content: string) => Promise<void>;
  onRegenerate: (sectionKey: SectionKey) => Promise<void>;
}

export default function ReportSection({
  sectionKey,
  content,
  chartImage,
  onSave,
  onRegenerate,
}: ReportSectionProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(content);
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const title = SECTION_TITLES[sectionKey] || sectionKey;

  const handleStartEdit = useCallback(() => {
    setDraft(content);
    setEditing(true);
    setTimeout(() => textareaRef.current?.focus(), 50);
  }, [content]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      await onSave(sectionKey, draft);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }, [sectionKey, draft, onSave]);

  const handleCancel = useCallback(() => {
    setDraft(content);
    setEditing(false);
  }, [content]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        handleSave();
      }
      if (e.key === "Escape") {
        handleCancel();
      }
    },
    [handleSave, handleCancel]
  );

  const handleRegenerate = useCallback(async () => {
    setRegenerating(true);
    try {
      await onRegenerate(sectionKey);
    } finally {
      setRegenerating(false);
    }
  }, [sectionKey, onRegenerate]);

  return (
    <div className="bg-white border border-surface-200 rounded-xl overflow-hidden shadow-sm group/section">
      {/* Section Header */}
      <div className="px-6 py-4 border-b border-surface-100 bg-surface-50/60 flex items-center justify-between">
        <h2 className="font-display font-semibold text-surface-800 text-base">
          {title}
        </h2>
        <div
          className={cn(
            "flex items-center gap-1.5 transition-opacity",
            !editing && "opacity-0 group-hover/section:opacity-100 focus-within:opacity-100"
          )}
        >
          {!editing && (
            <>
              <button
                onClick={handleStartEdit}
                className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md text-surface-500 hover:text-brand-600 hover:bg-brand-50 transition-colors"
                title="Edit section"
              >
                <Pencil size={13} />
                <span>Edit</span>
              </button>
              <button
                onClick={handleRegenerate}
                disabled={regenerating}
                className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md text-surface-500 hover:text-amber-600 hover:bg-amber-50 transition-colors disabled:opacity-50"
                title="Regenerate this section"
              >
                <RefreshCw
                  size={13}
                  className={cn(regenerating && "animate-spin")}
                />
                <span>{regenerating ? "Regenerating…" : "Regenerate"}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Section Body */}
      <div className="px-6 py-5">
        {editing ? (
          <div className="space-y-3">
            <textarea
              ref={textareaRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full min-h-[200px] text-sm font-mono bg-surface-50 border border-surface-200 rounded-lg p-4 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 resize-y leading-relaxed"
              disabled={saving}
            />
            <div className="flex items-center justify-between">
              <p className="text-[11px] text-surface-400">
                Supports Markdown • Ctrl+Enter to save • Esc to cancel
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCancel}
                  disabled={saving}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-surface-100 text-surface-600 hover:bg-surface-200 transition-colors disabled:opacity-50"
                >
                  <X size={13} />
                  Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-brand-600 text-white hover:bg-brand-700 transition-colors disabled:opacity-50"
                >
                  <Check size={13} />
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="prose prose-sm prose-surface max-w-none text-surface-700 leading-relaxed">
            <ReactMarkdown>{content}</ReactMarkdown>
          </div>
        )}

        {/* Inline chart image */}
        {chartImage && (
          <div className="mt-4 border border-surface-200 rounded-lg overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={chartImage}
              alt="Chart visualization"
              className="w-full max-w-2xl mx-auto"
            />
          </div>
        )}
      </div>

      {/* Regenerating overlay */}
      {regenerating && (
        <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center rounded-xl z-10">
          <div className="flex items-center gap-2 text-sm text-surface-600">
            <RefreshCw size={16} className="animate-spin text-brand-500" />
            Regenerating section…
          </div>
        </div>
      )}
    </div>
  );
}
