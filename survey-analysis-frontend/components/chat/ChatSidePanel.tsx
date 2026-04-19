"use client";

import React, { useEffect, useRef, useState } from "react";
import { X, Send, PlusCircle } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { chat } from "@/lib/api";
import type { ChatMessage } from "@/types";
import { cn } from "@/lib/utils";
import DynamicChart from "../tabs/DynamicChart";

export function ChatSidePanel() {
  const {
    activeSurvey,
    chatPanelOpen,
    setChatPanelOpen,
    chatSessionId,
    setChatSessionId,
    chatMessages,
    setChatMessages,
    appendChatMessage,
    resetChatSession,
    addToast
  } = useAppStore();

  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, sending]);

  if (!activeSurvey) {
    return null;
  }

  const handleSendMessage = async () => {
    if (!input.trim() || sending) return;

    const userMsg: ChatMessage = { role: "USER", content: input };
    appendChatMessage(userMsg);
    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    setSending(true);

    try {
      let currentSessionId = chatSessionId;
      if (!currentSessionId) {
        const s = await chat.startSession({
          survey_schema_id: activeSurvey.id,
          session_type: "DATA_QUERY",
        });
        currentSessionId = s.session_id;
        setChatSessionId(currentSessionId);
      }

      const response = await chat.sendMessage({
        session_id: currentSessionId,
        content: userMsg.content,
      });
      appendChatMessage(response);
    } catch {
      appendChatMessage({
        role: "ASSISTANT",
        content: "Sorry, I encountered an error. Please try again.",
      });
      addToast("Failed to get chat response", "error");
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    // Auto-resize logic
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  };

  const examplePrompts = [
    "How many responses do we have?",
    "Show a pie chart of device distribution",
    "What's the average satisfaction by region?"
  ];

  return (
    <div
      className={cn(
        "fixed top-0 right-0 h-full w-full md:w-[420px] bg-white shadow-2xl border-l border-surface-200 z-50 flex flex-col transition-transform duration-300",
        chatPanelOpen ? "translate-x-0" : "translate-x-full"
      )}
    >
      {/* Header */}
      <div className="h-[68px] flex-shrink-0 border-b border-surface-200 px-4 py-3 flex items-center justify-between bg-surface-50">
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-display font-bold text-surface-900 truncate">Data Assistant</h2>
          <p className="text-xs text-surface-500 truncate mt-0.5">{activeSurvey.title}</p>
        </div>
        <div className="flex items-center gap-2 ml-4">
          {chatMessages.length > 0 && (
            <button
              onClick={resetChatSession}
              disabled={sending}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-surface-600 hover:text-brand-600 hover:bg-brand-50 rounded-md transition-colors disabled:opacity-50"
              title="Start a new chat"
            >
              <PlusCircle size={14} />
              <span>New chat</span>
            </button>
          )}
          <button
            onClick={() => setChatPanelOpen(false)}
            className="p-1.5 text-surface-400 hover:text-surface-700 hover:bg-surface-100 rounded-md transition-colors"
            title="Close panel"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0 bg-white">
        {chatMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full max-w-sm mx-auto text-center animate-fade-in">
            <h3 className="text-sm font-semibold text-surface-700 mb-2">Welcome to Data Assistant</h3>
            <p className="text-sm text-surface-500 mb-6">
              Ask about your survey data, request a chart, or explore patterns.
            </p>
            <div className="w-full space-y-2">
              {examplePrompts.map((q) => (
                <button
                  key={q}
                  onClick={() => {
                    setInput(q);
                    setTimeout(() => textareaRef.current?.focus(), 0);
                  }}
                  className="w-full text-left px-4 py-2.5 rounded-lg text-xs text-brand-600 border border-brand-100 hover:bg-brand-50 hover:border-brand-200 transition-colors shadow-sm"
                >
                  &ldquo;{q}&rdquo;
                </button>
              ))}
            </div>
          </div>
        ) : (
          chatMessages.map((msg, i) => (
            <div
              key={i}
              className={cn(
                "flex animate-slide-up",
                msg.role === "USER" ? "justify-end" : "justify-start"
              )}
            >
              <div
                className={cn(
                  "rounded-2xl px-4 py-3 text-sm shadow-sm",
                  msg.role === "USER"
                    ? "max-w-[85%] bg-brand-600 text-white rounded-br-sm"
                    : "max-w-[90%] bg-surface-50 border border-surface-200 text-surface-800 rounded-bl-sm"
                )}
              >
                <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>

                {msg.role === "ASSISTANT" && msg.chart_code && !!msg.chart_data && (
                  <div className="mt-3 bg-white border border-surface-200 rounded-lg overflow-hidden">
                    <DynamicChart
                      code={msg.chart_code}
                      data={msg.chart_data as Record<string, unknown>[]}
                      chartType={msg.chart_type || undefined}
                    />
                  </div>
                )}

                {!!msg.executed_query && (
                  <details className="mt-2 text-xs opacity-70 group">
                    <summary className="cursor-pointer font-medium hover:text-brand-600 transition-colors">Query details</summary>
                    <div className="mt-2 bg-surface-100/50 rounded-md p-2 border border-surface-200">
                      <pre className="font-mono text-[10px] overflow-x-auto text-surface-600">
                        {JSON.stringify(msg.executed_query, null, 2)}
                      </pre>
                    </div>
                  </details>
                )}
                
                {!!msg.result_snapshot?.data && (
                  <details className="mt-2 text-xs opacity-70 group">
                    <summary className="cursor-pointer font-medium hover:text-brand-600 transition-colors">Result data</summary>
                    <div className="mt-2 bg-surface-100/50 rounded-md p-2 border border-surface-200">
                      <pre className="font-mono text-[10px] overflow-x-auto text-surface-600">
                        {JSON.stringify(
                          (msg.result_snapshot as Record<string, unknown>).data,
                          null,
                          2
                        )}
                      </pre>
                    </div>
                  </details>
                )}
              </div>
            </div>
          ))
        )}
        
        {sending && (
          <div className="flex justify-start animate-fade-in">
            <div className="bg-surface-50 border border-surface-200 rounded-2xl rounded-bl-sm px-4 py-3 shadow-sm">
              <div className="flex items-center gap-1.5 h-5">
                <div className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-pulse" />
                <div className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-pulse stagger-1" />
                <div className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-pulse stagger-2" />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} className="h-1" />
      </div>

      {/* Input Area */}
      <div className="flex-shrink-0 p-3 border-t border-surface-200 bg-white">
        <div className="relative flex items-end gap-2 bg-surface-50 border border-surface-300 rounded-2xl focus-within:border-brand-500 focus-within:ring-1 focus-within:ring-brand-500 transition-all p-1">
          <textarea
            ref={textareaRef}
            className="flex-1 max-h-[120px] min-h-[40px] bg-transparent border-0 outline-none resize-none py-2.5 pl-3 pr-2 text-sm text-surface-900 placeholder-surface-400 disabled:opacity-50"
            placeholder="Ask a question..."
            value={input}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            disabled={sending}
            rows={1}
            style={{ overflowY: input.split("\n").length > 4 ? "auto" : "hidden" }}
          />
          <button
            onClick={handleSendMessage}
            disabled={!input.trim() || sending}
            className={cn(
              "p-2 mb-0.5 mr-0.5 rounded-xl transition-all flex items-center justify-center flex-shrink-0",
              input.trim() && !sending
                ? "bg-brand-600 text-white hover:bg-brand-700 shadow-sm"
                : "bg-surface-200 text-surface-400 cursor-not-allowed"
            )}
            title="Send (Enter)"
          >
            <Send size={18} strokeWidth={2.5} className={cn(sending && "opacity-50")} />
          </button>
        </div>
        <div className="text-center mt-2">
          <p className="text-[10px] text-surface-400">Press <kbd className="font-sans font-medium px-1 bg-surface-100 rounded border border-surface-200">Enter</kbd> to send, <kbd className="font-sans font-medium px-1 bg-surface-100 rounded border border-surface-200">Shift + Enter</kbd> for new line</p>
        </div>
      </div>
    </div>
  );
}
