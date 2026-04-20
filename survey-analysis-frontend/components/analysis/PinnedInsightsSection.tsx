"use client";

import React, { useState } from "react";
import { Bookmark, X, Edit, Check } from "lucide-react";
import type { PinnedInsight } from "@/types";
import { cn } from "@/lib/utils";
import DynamicChart from "../tabs/DynamicChart";

export interface PinnedInsightsSectionProps {
  pins: PinnedInsight[];
  onUnpin: (pinId: string) => void;
  onUpdateNote?: (pinId: string, note: string | null) => Promise<void>;
}

function getRelativeTime(dateString: string) {
  const d = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - d.getTime()) / 1000);
  
  if (diffInSeconds < 60) return "Just now";
  if (diffInSeconds < 3600) {
    const mins = Math.floor(diffInSeconds / 60);
    return `${mins} minute${mins !== 1 ? 's' : ''} ago`;
  }
  if (diffInSeconds < 86400) {
    const hours = Math.floor(diffInSeconds / 3600);
    return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  }
  const days = Math.floor(diffInSeconds / 86400);
  return `${days} day${days !== 1 ? 's' : ''} ago`;
}

export function PinnedInsightsSection({ pins, onUnpin, onUpdateNote }: PinnedInsightsSectionProps) {
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  if (!pins || pins.length === 0) {
    return null;
  }

  const handleStartEdit = (pin: PinnedInsight) => {
    setEditingNoteId(pin.id);
    setNoteDraft(pin.user_note || "");
  };

  const handleSaveNote = async (pinId: string) => {
    if (onUpdateNote) {
      setUpdatingId(pinId);
      try {
        await onUpdateNote(pinId, noteDraft.trim() || null);
        setEditingNoteId(null);
      } finally {
        setUpdatingId(null);
      }
    } else {
      setEditingNoteId(null);
    }
  };

  return (
    <div className="bg-white border border-surface-200 rounded-xl shadow-sm mb-6 overflow-hidden">
      <div className="px-6 py-5 border-b border-surface-200 bg-surface-50 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="bg-brand-100 p-2 rounded-lg text-brand-600">
            <Bookmark size={20} className="fill-brand-600 text-brand-600" />
          </div>
          <div>
            <h3 className="font-display font-semibold text-lg text-surface-900">Pinned Insights</h3>
            <p className="text-sm text-surface-500">
              {pins.length} item{pins.length === 1 ? '' : 's'} pinned from chat
            </p>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-4 shadow-inner bg-surface-50/30">
        {pins.map((pin) => (
          <div key={pin.id} className="border border-surface-200 rounded-xl p-4 bg-white hover:border-surface-300 transition-colors relative group shadow-sm">
            {/* Header info */}
            <div className="flex justify-between items-start mb-3">
              <p className="text-sm italic text-surface-500 line-clamp-2 pr-8 font-serif">
                Q: {pin.source_question}
              </p>
              <button
                onClick={() => {
                  if (window.confirm("Unpin this insight?")) {
                    onUnpin(pin.id);
                  }
                }}
                className="absolute top-4 right-4 text-surface-400 hover:text-red-600 hover:bg-red-50 p-1.5 rounded-md transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                title="Unpin"
              >
                <X size={16} />
              </button>
            </div>

            {/* Content text */}
            <div className="text-sm text-surface-800 leading-relaxed mb-4 whitespace-pre-wrap">
              {pin.content}
            </div>

            {/* Chart */}
            {pin.chart_code && pin.chart_data && (
              <div className="mb-4 bg-white border border-surface-200 rounded-lg overflow-hidden shadow-sm">
                <DynamicChart
                  code={pin.chart_code}
                  data={pin.chart_data as Record<string, unknown>[]}
                  chartType={pin.chart_type || undefined}
                />
              </div>
            )}

            {/* User Note */}
            <div className="border-t border-surface-100 pt-3 mt-3">
              {editingNoteId === pin.id ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={noteDraft}
                    onChange={(e) => setNoteDraft(e.target.value)}
                    placeholder="Add a note..."
                    className="flex-1 text-sm bg-white border border-surface-300 rounded-md py-1.5 px-3 focus:outline-none focus:ring-1 focus:ring-brand-500 focus:border-brand-500"
                    autoFocus
                    onKeyDown={(e) => e.key === "Enter" && handleSaveNote(pin.id)}
                    disabled={updatingId === pin.id}
                  />
                  <button
                    onClick={() => handleSaveNote(pin.id)}
                    disabled={updatingId === pin.id}
                    className="p-1.5 bg-brand-600 text-white hover:bg-brand-700 rounded-md disabled:opacity-50 transition-colors"
                    title="Save Note"
                  >
                    <Check size={14} />
                  </button>
                  <button
                    onClick={() => setEditingNoteId(null)}
                    disabled={updatingId === pin.id}
                    className="p-1.5 bg-surface-200 text-surface-600 hover:bg-surface-300 rounded-md disabled:opacity-50 transition-colors"
                    title="Cancel"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between group/note">
                  <div className="text-sm text-surface-500 italic max-w-[85%]">
                    {pin.user_note ? (
                      <div>
                        <span className="text-surface-700 font-medium not-italic block mb-0.5 text-xs">Note</span>
                        <span className="text-surface-600">{pin.user_note}</span>
                      </div>
                    ) : (
                      <span className="opacity-50 px-1">No note added.</span>
                    )}
                  </div>
                  <button
                    onClick={() => handleStartEdit(pin)}
                    className={cn(
                      "text-xs flex items-center gap-1.5 py-1.5 px-2.5 rounded-md transition-colors",
                      pin.user_note 
                        ? "text-surface-400 hover:text-brand-600 hover:bg-brand-50 opacity-0 group-hover/note:opacity-100 focus:opacity-100" 
                        : "text-brand-600 bg-brand-50 hover:bg-brand-100"
                    )}
                  >
                    <Edit size={12} />
                    <span className="font-medium">{pin.user_note ? "Edit note" : "Add note"}</span>
                  </button>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="mt-4 pt-3 border-t border-surface-100 text-[11px] text-surface-400 flex justify-end items-center gap-1">
              Pinned {getRelativeTime(pin.pinned_at)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
