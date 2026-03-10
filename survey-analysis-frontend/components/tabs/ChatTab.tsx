"use client";

import { useEffect, useRef, useState } from "react";
import { useAppStore } from "@/lib/store";
import { chat, simulation, analytics } from "@/lib/api";
import type { ChatMessage, ChatSession, Persona } from "@/types";
import { cn } from "@/lib/utils";
import DynamicChart from "./DynamicChart";

interface ChatTabProps {
  compact?: boolean;
  onPin?: (item: any) => void;
}

export default function ChatTab({ compact, onPin }: ChatTabProps) {
  const { activeSurvey, addToast, personas, setPersonas } = useAppStore();
  const [session, setSession] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [mode, setMode] = useState<"DATA_QUERY" | "PERSONA_INTERVIEW">("DATA_QUERY");
  const [selectedPersona, setSelectedPersona] = useState<string>("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (personas.length === 0) {
      simulation.listPersonas().then(setPersonas).catch(() => { });
    }
  }, [setPersonas, personas.length]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const startSession = async () => {
    if (!activeSurvey) {
      addToast("Select a survey first", "error");
      return;
    }
    try {
      const s = await chat.startSession({
        survey_schema_id: activeSurvey.id,
        session_type: mode,
        persona_id: mode === "PERSONA_INTERVIEW" ? selectedPersona || null : null,
      });
      setSession(s);
      setMessages([]);
      addToast("Chat session started", "success");
    } catch {
      addToast("Failed to start session", "error");
    }
  };

  const sendMessage = async () => {
    if (!session || !input.trim()) return;
    const userMsg: ChatMessage = { role: "USER", content: input };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setSending(true);

    try {
      const response = await chat.sendMessage({
        session_id: session.session_id,
        content: input,
      });
      setMessages((prev) => [...prev, response]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "ASSISTANT",
          content: "Sorry, I encountered an error. Make sure an LLM API key is configured.",
        },
      ]);
    }
    setSending(false);
  };

  const handlePinToDashboard = async (msg: ChatMessage) => {
    if (!activeSurvey || !msg.chart_code) return;
    try {
      const pinned = await analytics.pinItem({
        survey_schema_id: activeSurvey.id,
        item_type: "CHART",
        content_json: {
          chart_code: msg.chart_code,
          chart_data: msg.chart_data,
          chart_type: msg.chart_type
        }
      });
      addToast("Pinned to analysis dashboard!", "success");
      if (onPin) onPin(pinned);
    } catch (err) {
      addToast("Failed to pin item", "error");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className={cn("animate-fade-in flex flex-col min-h-0", compact ? "h-full" : "h-[calc(100vh-7rem)]")}>
      {/* Header */}
      {!compact && (
        <div className="flex items-center justify-between pb-4">
          <div>
            <h1 className="text-2xl font-display font-bold">Chat Assistant</h1>
            <p className="text-surface-500 text-sm mt-1">
              Ask questions about your survey data — get answers with interactive charts
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-1 gap-5 min-h-0">
        {/* Sidebar — Session Controls */}
        <div className={cn("flex-shrink-0 space-y-4", compact ? "w-[120px]" : "w-[260px]")}>
          <div className="card-padded space-y-4">
            {!compact && (
              <h3 className="text-sm font-display font-semibold text-surface-700">
                Session
              </h3>
            )}

            {/* Mode Selection */}
            <div>
              <label className="text-[10px] uppercase tracking-wider font-semibold text-surface-400 mb-1.5 block">
                Mode
              </label>
              <div className={cn("grid gap-1.5", compact ? "grid-cols-1" : "grid-cols-2")}>
                <button
                  onClick={() => setMode("DATA_QUERY")}
                  className={cn(
                    "px-3 py-2 rounded-lg text-[10px] font-bold transition-colors",
                    mode === "DATA_QUERY"
                      ? "bg-brand-50 text-brand-700 border border-brand-200"
                      : "bg-surface-50 text-surface-600 border border-surface-200 hover:bg-surface-100"
                  )}
                >
                  Query
                </button>
                <button
                  onClick={() => setMode("PERSONA_INTERVIEW")}
                  className={cn(
                    "px-3 py-2 rounded-lg text-[10px] font-bold transition-colors",
                    mode === "PERSONA_INTERVIEW"
                      ? "bg-purple-50 text-purple-700 border border-purple-200"
                      : "bg-surface-50 text-surface-600 border border-surface-200 hover:bg-surface-100"
                  )}
                >
                  Persona
                </button>
              </div>
            </div>

            {/* Persona Selector */}
            {mode === "PERSONA_INTERVIEW" && (
              <div>
                <select
                  className="input px-2 py-1.5 text-[10px]"
                  value={selectedPersona}
                  onChange={(e) => setSelectedPersona(e.target.value)}
                >
                  <option value="">Persona...</option>
                  {personas.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.type})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <button
              onClick={startSession}
              disabled={!activeSurvey}
              className="btn-primary w-full text-[10px] py-2"
            >
              {session ? "Reset" : "Chat"}
            </button>
          </div>

          {!compact && (
            <div className="card-padded">
              <h4 className="text-xs font-display font-semibold text-surface-500 mb-3 uppercase tracking-wide">
                Try asking
              </h4>
              <div className="space-y-1.5">
                {[
                  "Show a pie chart of device distribution",
                  "Create a scatter plot of age vs satisfaction",
                  "What's the average satisfaction by region?",
                ].map((q) => (
                  <button
                    key={q}
                    onClick={() => setInput(q)}
                    className="block w-full text-left px-3 py-2 rounded-lg text-[11px] text-surface-600 hover:bg-surface-50 hover:text-surface-900 transition-colors"
                  >
                    &ldquo;{q}&rdquo;
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Chat Area */}
        <div className="flex-1 card flex flex-col min-h-0 bg-white">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {!session ? (
              <div className="flex items-center justify-center h-full text-surface-400 text-xs">
                Start a session to begin
              </div>
            ) : messages.length === 0 ? (
              <div className="flex items-center justify-center h-full text-surface-400 text-xs px-8 text-center">
                Ask about your survey data — charts will be generated automatically
              </div>
            ) : (
              messages.map((msg, i) => (
                <div
                  key={i}
                  className={cn(
                    "flex animate-slide-up",
                    msg.role === "USER" ? "justify-end" : "justify-start"
                  )}
                >
                  <div
                    className={cn(
                      "rounded-2xl px-4 py-3 text-xs shadow-sm",
                      msg.role === "USER"
                        ? "max-w-[85%] bg-brand-600 text-white rounded-br-none"
                        : "max-w-[95%] bg-surface-50 text-surface-800 border border-surface-100 rounded-bl-none"
                    )}
                  >
                    {/* Text content */}
                    <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>

                    {/* Dynamic Chart (assistant messages only) */}
                    {msg.role === "ASSISTANT" && msg.chart_code && !!msg.chart_data && (
                      <div className="mt-4 relative group/chart">
                        <DynamicChart
                          code={msg.chart_code}
                          data={msg.chart_data as Record<string, unknown>[]}
                          chartType={msg.chart_type || undefined}
                        />
                        <button
                          onClick={() => handlePinToDashboard(msg)}
                          className="absolute top-2 right-2 px-2 py-1 bg-white/90 backdrop-blur border border-surface-200 rounded-md text-[9px] font-bold text-brand-600 shadow-sm opacity-0 group-hover/chart:opacity-100 transition-opacity"
                        >
                          PIN TO DASHBOARD
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
            {sending && (
              <div className="flex justify-start">
                <div className="bg-surface-50 border border-surface-100 rounded-2xl rounded-bl-none px-4 py-3">
                  <div className="flex gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-bounce" />
                    <div className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-bounce delay-150" />
                    <div className="w-1.5 h-1.5 rounded-full bg-brand-400 animate-bounce delay-300" />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-3 border-t border-surface-100">
            <div className="flex gap-2">
              <input
                className="input text-xs py-2"
                placeholder={session ? "Ask a question..." : "Start session..."}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={!session || sending}
              />
              <button
                onClick={sendMessage}
                disabled={!session || !input.trim() || sending}
                className="btn-primary px-4"
              >
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}