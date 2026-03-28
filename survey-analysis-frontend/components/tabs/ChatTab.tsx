"use client";

import { useEffect, useRef, useState } from "react";
import { useAppStore } from "@/lib/store";
import { chat, simulation } from "@/lib/api";
import type { ChatMessage, ChatSession, Persona } from "@/types";
import { cn } from "@/lib/utils";
import DynamicChart from "./DynamicChart";

export default function ChatTab() {
  const { activeSurvey, addToast } = useAppStore();
  const [session, setSession] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [mode, setMode] = useState<"DATA_QUERY" | "PERSONA_INTERVIEW">("DATA_QUERY");
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [selectedPersona, setSelectedPersona] = useState<string>("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    simulation.listPersonas().then(setPersonas).catch(() => {});
  }, []);

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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="animate-fade-in flex flex-col h-[calc(100vh-7rem)]">
      {/* Header */}
      <div className="flex items-center justify-between pb-4">
        <div>
          <h1 className="text-2xl font-display font-bold">Chat Assistant</h1>
          <p className="text-surface-500 text-sm mt-1">
            Ask questions about your survey data — get answers with interactive charts
          </p>
        </div>
      </div>

      <div className="flex flex-1 gap-5 min-h-0">
        {/* Sidebar — Session Controls */}
        <div className="w-[260px] flex-shrink-0 space-y-4">
          <div className="card-padded space-y-4">
            <h3 className="text-sm font-display font-semibold text-surface-700">
              Session
            </h3>

            {/* Mode Selection */}
            <div>
              <label className="text-xs font-medium text-surface-500 mb-1.5 block">
                Mode
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  onClick={() => setMode("DATA_QUERY")}
                  className={cn(
                    "px-3 py-2 rounded-lg text-xs font-medium transition-colors",
                    mode === "DATA_QUERY"
                      ? "bg-brand-50 text-brand-700 border border-brand-200"
                      : "bg-surface-50 text-surface-600 border border-surface-200 hover:bg-surface-100"
                  )}
                >
                  Data Query
                </button>
                <button
                  onClick={() => setMode("PERSONA_INTERVIEW")}
                  className={cn(
                    "px-3 py-2 rounded-lg text-xs font-medium transition-colors",
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
                <label className="text-xs font-medium text-surface-500 mb-1.5 block">
                  Select Persona
                </label>
                <select
                  className="input text-xs"
                  value={selectedPersona}
                  onChange={(e) => setSelectedPersona(e.target.value)}
                >
                  <option value="">Choose a persona...</option>
                  {personas.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <button
              onClick={startSession}
              disabled={!activeSurvey}
              className="btn-primary w-full text-sm"
            >
              {session ? "New Session" : "Start Session"}
            </button>

            {session && (
              <div className="pt-3 border-t border-surface-100">
                <p className="text-[10px] font-mono text-surface-400">
                  Session: {session.session_id.slice(0, 12)}...
                </p>
                <p className="text-[10px] text-surface-400 mt-0.5">
                  Type: {session.session_type}
                </p>
              </div>
            )}
          </div>

          {/* Suggestions */}
          <div className="card-padded">
            <h4 className="text-xs font-display font-semibold text-surface-500 mb-3 uppercase tracking-wide">
              Try asking
            </h4>
            <div className="space-y-1.5">
              {[
                "How many responses do we have?",
                "Show a pie chart of device distribution",
                "How many people have salary below 30000?",
                "Create a scatter plot of age vs satisfaction",
                "Show a radar chart comparing metrics",
                "What's the average satisfaction by region?",
              ].map((q) => (
                <button
                  key={q}
                  onClick={() => setInput(q)}
                  className="block w-full text-left px-3 py-2 rounded-lg text-xs text-surface-600 hover:bg-surface-50 hover:text-surface-900 transition-colors"
                >
                  &ldquo;{q}&rdquo;
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Chat Area */}
        <div className="flex-1 card flex flex-col min-h-0">
          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {!session ? (
              <div className="flex items-center justify-center h-full text-surface-400 text-sm">
                Start a session to begin chatting
              </div>
            ) : messages.length === 0 ? (
              <div className="flex items-center justify-center h-full text-surface-400 text-sm">
                Ask about your survey data — text answers and charts available
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
                      "rounded-2xl px-4 py-3 text-sm",
                      msg.role === "USER"
                        ? "max-w-[75%] bg-brand-600 text-white rounded-br-md"
                        : "max-w-[85%] bg-surface-100 text-surface-800 rounded-bl-md"
                    )}
                  >
                    {/* Text content */}
                    <p className="whitespace-pre-wrap">{msg.content}</p>

                    {/* Dynamic Chart (assistant messages only) */}
                    {msg.role === "ASSISTANT" && msg.chart_code && !!msg.chart_data && (
                      <DynamicChart
                        code={msg.chart_code}
                        data={msg.chart_data as Record<string, unknown>[]}
                        chartType={msg.chart_type || undefined}
                      />
                    )}

                    {/* Query details (collapsible) */}
                    {!!msg.executed_query && (
                      <details className="mt-2 text-xs opacity-70">
                        <summary className="cursor-pointer">Query details</summary>
                        <pre className="mt-1 font-mono text-[10px] overflow-x-auto">
                          {JSON.stringify(msg.executed_query, null, 2)}
                        </pre>
                      </details>
                    )}
                    {!!msg.result_snapshot?.data && (
                      <details className="mt-1 text-xs opacity-70">
                        <summary className="cursor-pointer">Result data</summary>
                        <pre className="mt-1 font-mono text-[10px] overflow-x-auto">
                          {JSON.stringify(
                            (msg.result_snapshot as Record<string, unknown>).data,
                            null,
                            2
                          )}
                        </pre>
                      </details>
                    )}
                  </div>
                </div>
              ))
            )}
            {sending && (
              <div className="flex justify-start">
                <div className="bg-surface-100 rounded-2xl rounded-bl-md px-4 py-3">
                  <div className="flex gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-surface-400 animate-pulse" />
                    <div className="w-2 h-2 rounded-full bg-surface-400 animate-pulse stagger-1" />
                    <div className="w-2 h-2 rounded-full bg-surface-400 animate-pulse stagger-2" />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="p-4 border-t border-surface-200">
            <div className="flex gap-2">
              <input
                className="input flex-1"
                placeholder={
                  session
                    ? "Ask about your data, or request a chart..."
                    : "Start a session first"
                }
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={!session || sending}
              />
              <button
                onClick={sendMessage}
                disabled={!session || !input.trim() || sending}
                className="btn-primary px-5"
              >
                <svg
                  width="16"
                  height="16"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                  />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}