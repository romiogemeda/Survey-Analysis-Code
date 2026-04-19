"use client";

import { useEffect, useState, useRef } from "react";
import { useAppStore } from "@/lib/store";
import { simulation, ingestion, chat } from "@/lib/api";
import { gradeBadgeClass } from "@/lib/utils";
import type { Persona, SimulatedResponse, ChatSession, ChatMessage } from "@/types";

export default function SimulationTab() {
  const { activeSurvey, addToast, setSubmissions } = useAppStore();
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [responses, setResponses] = useState<SimulatedResponse[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [simulating, setSimulating] = useState<string | null>(null);
  const [quantityPerPersona, setQuantityPerPersona] = useState(10);

  // ── Multi-Select State ──────────────────────────
  const [selectedPersonas, setSelectedPersonas] = useState<Set<string>>(new Set());

  // ── Batch / Clear / Promote loading states ──────
  const [batchRunning, setBatchRunning] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [promoting, setPromoting] = useState(false);

  // ── Persona Interview State ───────────────────────
  const [interviewSession, setInterviewSession] = useState<ChatSession | null>(null);
  const [interviewMessages, setInterviewMessages] = useState<ChatMessage[]>([]);
  const [interviewInput, setInterviewInput] = useState("");
  const [interviewSending, setInterviewSending] = useState(false);
  const [selectedInterviewPersona, setSelectedInterviewPersona] = useState<string>("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [interviewMessages]);

  useEffect(() => {
    simulation.listPersonas().then(setPersonas).catch(() => {});
    if (activeSurvey) {
      simulation.getResponses(activeSurvey.id).then(setResponses).catch(() => {});
    }
  }, [activeSurvey]);

  // ── Selection helpers ───────────────────────────
  const togglePersona = (id: string) => {
    setSelectedPersonas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelectedPersonas(new Set(personas.map((p) => p.id)));
  };

  const deselectAll = () => {
    setSelectedPersonas(new Set());
  };

  // ── Persona CRUD ────────────────────────────────
  const handleSeedDefaults = async () => {
    try {
      const seeded = await simulation.seedPersonas();
      addToast(`Seeded ${seeded.length} default personas`, "success");
      simulation.listPersonas().then(setPersonas);
    } catch {
      addToast("Failed to seed personas", "error");
    }
  };

  const handleCreatePersona = async () => {
    if (!newName || !newDescription) return;
    setCreating(true);
    try {
      await simulation.createPersona({
        name: newName,
        description_prompt: newDescription,
      });
      addToast("Persona created!", "success");
      setShowCreate(false);
      setNewName("");
      setNewDescription("");
      simulation.listPersonas().then(setPersonas);
    } catch {
      addToast("Failed to create persona — check LLM API key", "error");
    }
    setCreating(false);
  };

  // ── Single persona run (preserved) ──────────────
  const handleRunSimulation = async (personaId: string) => {
    if (!activeSurvey) {
      addToast("Select a survey first", "error");
      return;
    }
    setSimulating(personaId);
    try {
      const result = await simulation.runSimulation({
        survey_schema_id: activeSurvey.id,
        persona_id: personaId,
        num_responses: quantityPerPersona,
      });
      addToast(`Generated ${result.length} simulated responses`, "success");
      simulation.getResponses(activeSurvey.id).then(setResponses);
    } catch {
      addToast("Simulation failed — check LLM API key", "error");
    }
    setSimulating(null);
  };

  // ── Batch run ───────────────────────────────────
  const handleRunBatch = async () => {
    if (!activeSurvey) {
      addToast("Select a survey first", "error");
      return;
    }
    if (selectedPersonas.size === 0) {
      addToast("Select at least one persona", "error");
      return;
    }
    setBatchRunning(true);
    try {
      const result = await simulation.runBatch({
        survey_schema_id: activeSurvey.id,
        items: Array.from(selectedPersonas).map((id) => ({
          persona_id: id,
          num_responses: quantityPerPersona,
        })),
      });
      setResponses((prev) => [...prev, ...result]);
      addToast(
        `Batch complete — ${result.length} responses from ${selectedPersonas.size} persona(s)`,
        "success"
      );
    } catch {
      addToast("Batch simulation failed — check LLM API key", "error");
    }
    setBatchRunning(false);
  };

  // ── Clear responses ─────────────────────────────
  const handleClearResponses = async () => {
    if (!activeSurvey) return;
    if (
      !window.confirm(
        "Delete all simulated responses for this survey? This cannot be undone."
      )
    )
      return;
    setClearing(true);
    try {
      const { deleted } = await simulation.clearResponses(activeSurvey.id);
      addToast(`Cleared ${deleted} simulated responses`, "success");
      setResponses([]);
    } catch {
      addToast("Failed to clear responses", "error");
    }
    setClearing(false);
  };

  // ── Promote to analysis ─────────────────────────
  const handlePromote = async () => {
    if (!activeSurvey) return;
    setPromoting(true);
    try {
      const result = await simulation.promoteToAnalysis(activeSurvey.id);
      addToast(
        `${result.promoted} responses added to analysis pipeline`,
        "success"
      );
      // Refresh shared submissions so other tabs pick up the promoted data
      ingestion
        .getSubmissions(activeSurvey.id)
        .then(setSubmissions)
        .catch(() => {});
    } catch {
      addToast("Failed to promote responses", "error");
    }
    setPromoting(false);
  };

  // ── Persona Interview ───────────────────────────
  const handleStartInterview = async () => {
    if (!activeSurvey) return;
    if (!selectedInterviewPersona) {
      addToast("Select a persona to interview", "error");
      return;
    }
    try {
      const s = await chat.startSession({
        survey_schema_id: activeSurvey.id,
        session_type: "PERSONA_INTERVIEW",
        persona_id: selectedInterviewPersona,
      });
      setInterviewSession(s);
      setInterviewMessages([]);
      addToast("Interview session started", "success");
    } catch {
      addToast("Failed to start interview", "error");
    }
  };

  const handleSendInterviewMessage = async () => {
    if (!interviewSession || !interviewInput.trim()) return;
    const userMsg: ChatMessage = { role: "USER", content: interviewInput };
    setInterviewMessages((prev) => [...prev, userMsg]);
    const currentInput = interviewInput;
    setInterviewInput("");
    setInterviewSending(true);

    try {
      const response = await chat.sendMessage({
        session_id: interviewSession.session_id,
        content: currentInput,
      });
      setInterviewMessages((prev) => [...prev, response]);
    } catch {
      setInterviewMessages((prev) => [
        ...prev,
        {
          role: "ASSISTANT",
          content: "Sorry, I encountered an error. Make sure an LLM API key is configured.",
        },
      ]);
    }
    setInterviewSending(false);
  };

  const handleInterviewKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendInterviewMessage();
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold">Persona Simulation</h1>
          <p className="text-surface-500 text-sm mt-1">
            AI personas that generate synthetic survey responses
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={handleSeedDefaults} className="btn-secondary">
            Seed Defaults
          </button>
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="btn-primary"
          >
            {showCreate ? "Cancel" : "+ Custom Persona"}
          </button>
        </div>
      </div>

      {/* Create Form */}
      {showCreate && (
        <div className="card-padded animate-slide-up space-y-4">
          <h3 className="section-heading">Create Custom Persona</h3>
          <input
            className="input"
            placeholder="Persona name (e.g., Tech-savvy Millennial)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <textarea
            className="input min-h-[80px]"
            placeholder="Describe this persona in natural language (e.g., 'A 28-year-old software developer who is impatient with poorly designed interfaces...')"
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
          />
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowCreate(false)} className="btn-secondary">
              Cancel
            </button>
            <button
              onClick={handleCreatePersona}
              disabled={creating || !newName || !newDescription}
              className="btn-primary"
            >
              {creating ? "Creating (LLM parsing)..." : "Create Persona"}
            </button>
          </div>
        </div>
      )}

      {/* Simulation Controls */}
      {activeSurvey && (
        <div className="card p-4 flex flex-wrap items-center gap-4">
          <span className="text-sm text-surface-600">Responses per persona:</span>
          <input
            type="number"
            min={1}
            max={100}
            value={quantityPerPersona}
            onChange={(e) => setQuantityPerPersona(Number(e.target.value))}
            className="input w-20 text-center"
          />
          <span className="text-xs text-surface-400">
            Target: {activeSurvey.title}
          </span>

          {/* Batch actions */}
          <div className="ml-auto flex gap-2">
            <button
              onClick={handleClearResponses}
              disabled={clearing || responses.length === 0}
              className="btn-danger text-xs"
            >
              {clearing ? "Clearing..." : "Clear Responses"}
            </button>
            <button
              onClick={handlePromote}
              disabled={promoting || responses.length === 0}
              className="btn-secondary text-xs"
            >
              {promoting ? "Promoting..." : "Push to Analysis"}
            </button>
          </div>
        </div>
      )}

      {/* Selection toolbar */}
      {personas.length > 0 && (
        <div className="flex items-center gap-3">
          <button onClick={selectAll} className="btn-ghost text-xs">
            Select All
          </button>
          <button onClick={deselectAll} className="btn-ghost text-xs">
            Deselect All
          </button>
          <span className="text-xs text-surface-500">
            {selectedPersonas.size} of {personas.length} selected
          </span>
        </div>
      )}

      {/* Generate All Selected — prominent batch button */}
      {activeSurvey && personas.length > 0 && (
        <div className="card p-4 flex items-center gap-4 border-brand-200 bg-brand-50/40">
          <button
            id="generate-all-selected"
            onClick={handleRunBatch}
            disabled={batchRunning || selectedPersonas.size === 0}
            className="btn-primary"
          >
            {batchRunning ? (
              <>
                <svg
                  className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                Generating responses…
              </>
            ) : (
              `Generate All Selected (${selectedPersonas.size})`
            )}
          </button>
          {batchRunning && (
            <span className="text-sm text-surface-500 animate-pulse">
              This may take a minute
            </span>
          )}
          {!batchRunning && selectedPersonas.size === 0 && (
            <span className="text-xs text-surface-400">
              Select personas above to enable batch generation
            </span>
          )}
        </div>
      )}

      {/* Personas Grid */}
      <div className="grid grid-cols-2 gap-4">
        {personas.map((persona) => {
          const isSelected = selectedPersonas.has(persona.id);
          return (
            <div
              key={persona.id}
              className={`card-padded relative transition-all duration-150 ${
                isSelected
                  ? "ring-2 ring-brand-500 border-brand-400"
                  : ""
              }`}
            >
              {/* Checkbox in top-right corner */}
              <input
                id={`persona-select-${persona.id}`}
                type="checkbox"
                checked={isSelected}
                onChange={() => togglePersona(persona.id)}
                className="absolute top-3 right-3 h-4 w-4 rounded border-surface-300 text-brand-600 focus:ring-brand-500 cursor-pointer accent-brand-600"
              />

              <div className="flex items-start justify-between pr-8">
                <div>
                  <h4 className="font-display font-semibold text-surface-800">
                    {persona.name}
                  </h4>
                  <span className="badge-info text-[10px] mt-1">{persona.type}</span>
                </div>
                <button
                  onClick={() => handleRunSimulation(persona.id)}
                  disabled={simulating === persona.id || !activeSurvey}
                  className="btn-secondary text-xs"
                >
                  {simulating === persona.id ? "Simulating..." : "Run"}
                </button>
              </div>
              {persona.description_prompt && (
                <p className="text-xs text-surface-500 mt-2 line-clamp-2">
                  {persona.description_prompt}
                </p>
              )}
              {persona.parsed_parameters && Object.keys(persona.parsed_parameters).length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {Object.entries(persona.parsed_parameters)
                    .slice(0, 5)
                    .map(([key, val]) => (
                      <span
                        key={key}
                        className="inline-flex items-center px-2 py-0.5 rounded text-[10px] bg-surface-100 text-surface-600"
                      >
                        {key}: {typeof val === "object" ? JSON.stringify(val) : String(val)}
                      </span>
                    ))}
                </div>
              )}
            </div>
          );
        })}
        {personas.length === 0 && (
          <div className="col-span-2 text-center py-12 text-surface-500 card-padded">
            No personas yet. Click &quot;Seed Defaults&quot; to get started.
          </div>
        )}
      </div>

      {/* Simulated Responses */}
      {responses.length > 0 && (
        <div className="card-padded">
          <h3 className="section-heading mb-4">
            Simulated Responses ({responses.length})
          </h3>
          <div className="space-y-3 max-h-[400px] overflow-y-auto">
            {responses.map((resp) => (
              <div
                key={resp.id}
                className="p-3 rounded-lg bg-surface-50 border border-surface-100"
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="badge-info text-[10px]">SIMULATED</span>
                  {/* Quality badge */}
                  {resp.quality_grade && (
                    <span className={`${gradeBadgeClass(resp.quality_grade)} text-[10px]`}>
                      {resp.quality_grade}
                      {resp.quality_score != null && (
                        <span className="ml-1 opacity-75">
                          ({(resp.quality_score * 100).toFixed(0)}%)
                        </span>
                      )}
                    </span>
                  )}
                  {resp.quality_grade === "LOW" && (
                    <span
                      className="relative group cursor-help"
                      aria-label="May not be realistic — consider regenerating."
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        className="h-4 w-4 text-red-500"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                      >
                        <path
                          fillRule="evenodd"
                          d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                          clipRule="evenodd"
                        />
                      </svg>
                      <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2.5 py-1 rounded bg-surface-900 text-white text-[10px] whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none shadow-lg">
                        May not be realistic — consider regenerating.
                      </span>
                    </span>
                  )}
                  <span className="text-xs text-surface-400 font-mono">
                    {resp.llm_model_used}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {Object.entries(resp.synthetic_answers).map(([k, v]) => (
                    <div key={k} className="text-xs">
                      <span className="text-surface-500">{k}:</span>{" "}
                      <span className="text-surface-800 font-medium">
                        {String(v)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-4 border-t border-surface-100 flex justify-end gap-3">
            <button
              id="clear-all-responses"
              onClick={handleClearResponses}
              disabled={clearing}
              className="btn-danger text-sm"
            >
              {clearing ? "Clearing…" : "Clear All Responses"}
            </button>
            <button
              id="push-to-analysis"
              onClick={handlePromote}
              disabled={promoting || responses.length === 0}
              className="btn-primary text-sm"
            >
              {promoting ? "Promoting…" : "Push to Analysis Pipeline →"}
            </button>
          </div>
        </div>
      )}

      {/* ── Interview a Persona ─────────────────────── */}
      <div className="card-padded space-y-4">
        <h3 className="section-heading">Interview a Persona</h3>
        <p className="text-xs text-surface-500">
          Have a conversational interview with a synthetic persona to deeply understand their viewpoint.
        </p>

        {!interviewSession ? (
          <div className="flex gap-2 items-center">
            <select
              className="input text-sm flex-1 max-w-sm"
              value={selectedInterviewPersona}
              onChange={(e) => setSelectedInterviewPersona(e.target.value)}
            >
              <option value="">Choose a persona...</option>
              {personas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} {p.type ? `(${p.type})` : ""}
                </option>
              ))}
            </select>
            <button
              onClick={handleStartInterview}
              disabled={!selectedInterviewPersona || !activeSurvey}
              className="btn-primary"
            >
              Start Interview
            </button>
          </div>
        ) : (
          <div className="border border-surface-200 rounded-xl overflow-hidden flex flex-col h-[500px]">
            {/* Banner */}
            <div className="bg-surface-50 border-b border-surface-200 p-3 flex justify-between items-center">
              <div>
                <h4 className="font-semibold text-surface-800 text-sm">
                  {personas.find((p) => p.id === interviewSession.persona_id)?.name || "Persona"}
                </h4>
                <span className="badge-info text-[10px] mt-0.5">
                  {personas.find((p) => p.id === interviewSession.persona_id)?.type || "PREDEFINED"}
                </span>
              </div>
              <button
                onClick={() => {
                  setInterviewSession(null);
                  setInterviewMessages([]);
                }}
                className="btn-ghost text-xs text-surface-500"
              >
                End Interview
              </button>
            </div>

            {/* Chat Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-white">
              {interviewMessages.length === 0 ? (
                <div className="flex items-center justify-center h-full text-surface-400 text-sm">
                  Say hi to begin the interview.
                </div>
              ) : (
                interviewMessages.map((msg, i) => (
                  <div
                    key={i}
                    className={`flex animate-slide-up ${
                      msg.role === "USER" ? "justify-end" : "justify-start"
                    }`}
                  >
                    <div
                      className={`rounded-2xl px-4 py-3 text-sm ${
                        msg.role === "USER"
                          ? "max-w-[75%] bg-brand-600 text-white rounded-br-[4px]"
                          : "max-w-[85%] bg-surface-100 text-surface-800 rounded-bl-[4px]"
                      }`}
                    >
                      <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                    </div>
                  </div>
                ))
              )}
              {interviewSending && (
                <div className="flex justify-start">
                  <div className="bg-surface-100 rounded-2xl rounded-bl-[4px] px-4 py-3">
                    <div className="flex gap-1.5 h-5 items-center">
                      <div className="w-1.5 h-1.5 rounded-full bg-surface-400 animate-pulse" />
                      <div className="w-1.5 h-1.5 rounded-full bg-surface-400 animate-pulse stagger-1" />
                      <div className="w-1.5 h-1.5 rounded-full bg-surface-400 animate-pulse stagger-2" />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="p-3 border-t border-surface-200 bg-white">
              <div className="flex gap-2">
                <input
                  className="input flex-1"
                  placeholder="Ask a question..."
                  value={interviewInput}
                  onChange={(e) => setInterviewInput(e.target.value)}
                  onKeyDown={handleInterviewKeyDown}
                  disabled={interviewSending}
                />
                <button
                  onClick={handleSendInterviewMessage}
                  disabled={!interviewInput.trim() || interviewSending}
                  className="btn-primary px-4"
                >
                  <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}