"use client";

import { useEffect, useState, useRef } from "react";
import { useAppStore } from "@/lib/store";
import { simulation } from "@/lib/api";
import type { Persona, SimulatedResponse } from "@/types";

export default function SimulationTab() {
  const { activeSurvey, addToast, personas, setPersonas } = useAppStore();
  const [responses, setResponses] = useState<SimulatedResponse[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [extracting, setExtracting] = useState(false);

  // Job State
  const [activeJob, setActiveJob] = useState<{
    id: string;
    status: string;
    total: number;
    processed: number;
    personaName: string;
  } | null>(null);

  const [numResponses, setNumResponses] = useState(1);
  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    simulation.listPersonas().then(setPersonas).catch(() => { });
    if (activeSurvey) {
      simulation.getResponses(activeSurvey.id).then(setResponses).catch(() => { });
    }

    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [activeSurvey]);

  const pollJobStatus = async (jobId: string, personaName: string) => {
    try {
      const status = await simulation.getJobStatus(jobId);
      setActiveJob({
        id: jobId,
        status: status.status,
        total: status.total_requested,
        processed: status.processed_count,
        personaName
      });

      if (status.status === "COMPLETED") {
        if (pollingRef.current) clearInterval(pollingRef.current);
        setActiveJob(null);
        addToast(`Simulation job completed for ${personaName}`, "success");
        if (activeSurvey) {
          simulation.getResponses(activeSurvey.id).then(setResponses);
        }
      } else if (status.status === "FAILED") {
        if (pollingRef.current) clearInterval(pollingRef.current);
        setActiveJob(null);
        addToast(`Simulation failed: ${status.error_message}`, "error");
      }
    } catch (err) {
      console.error("Polling error:", err);
    }
  };

  const handleSeedDefaults = async () => {
    try {
      const seeded = await simulation.seedPersonas();
      addToast(`Seeded ${seeded.length} default personas`, "success");
      simulation.listPersonas().then(setPersonas);
    } catch {
      addToast("Failed to seed personas", "error");
    }
  };

  const handleExtractPersonas = async () => {
    if (!activeSurvey) return;
    setExtracting(true);
    try {
      const extracted = await simulation.extractPersonas(activeSurvey.id);
      addToast(`AI extracted ${extracted.length} personas from real data`, "success");
      simulation.listPersonas().then(setPersonas);
    } catch (err: any) {
      addToast(err.message || "Failed to extract personas", "error");
    } finally {
      setExtracting(false);
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

  const handleRunSimulation = async (persona: Persona) => {
    if (!activeSurvey) {
      addToast("Select a survey first", "error");
      return;
    }

    try {
      // If small batch, use sync-ish endpoint
      if (numResponses <= 5) {
        addToast(`Starting simulation for ${persona.name}...`, "info");
        const result = await simulation.runSimulation({
          survey_schema_id: activeSurvey.id,
          persona_id: persona.id,
          num_responses: numResponses,
        });
        addToast(`Generated ${result.length} responses`, "success");
        simulation.getResponses(activeSurvey.id).then(setResponses);
      } else {
        // Bulk generation via background job
        const job = await simulation.startBulkJob({
          survey_schema_id: activeSurvey.id,
          persona_id: persona.id,
          num_responses: numResponses,
        });

        setActiveJob({
          id: job.job_id,
          status: job.status,
          total: job.total_requested,
          processed: 0,
          personaName: persona.name
        });

        addToast("Bulk simulation job started in background", "info");

        // Start polling
        if (pollingRef.current) clearInterval(pollingRef.current);
        pollingRef.current = setInterval(() => pollJobStatus(job.job_id, persona.name), 2000);
      }
    } catch (err: any) {
      addToast(err.message || "Simulation failed", "error");
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
          <button
            onClick={handleExtractPersonas}
            disabled={extracting || !activeSurvey}
            className="btn-secondary"
          >
            {extracting ? "Extracting..." : "Extract from Real Data"}
          </button>
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

      {/* Active Job Progress */}
      {activeJob && (
        <div className="card-padded bg-primary-50 border-primary-100 animate-pulse">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-semibold text-primary-900">
              Bulk Job: {activeJob.personaName}
            </h4>
            <span className="text-xs font-mono text-primary-700">
              {activeJob.processed} / {activeJob.total} responses
            </span>
          </div>
          <div className="w-full bg-primary-200 rounded-full h-2">
            <div
              className="bg-primary-600 h-2 rounded-full transition-all duration-500"
              style={{ width: `${(activeJob.processed / activeJob.total) * 100}%` }}
            />
          </div>
          <p className="text-[10px] text-primary-500 mt-2">
            Status: {activeJob.status}... You can continue using the app while this runs.
          </p>
        </div>
      )}

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
        <div className="card p-4 flex items-center gap-4">
          <span className="text-sm text-surface-600">Responses per simulation:</span>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={1000}
              value={numResponses}
              onChange={(e) => setNumResponses(Number(e.target.value))}
              className="input w-24 text-center"
            />
            {numResponses > 5 && (
              <span className="badge-info text-[10px]">BULK MODE (ASYNC)</span>
            )}
          </div>
          <span className="text-xs text-surface-400 ml-auto">
            Target: <span className="font-medium text-surface-600">{activeSurvey.title}</span>
          </span>
        </div>
      )}

      {/* Personas Grid */}
      <div className="grid grid-cols-2 gap-4">
        {Array.isArray(personas) ? personas.map((persona) => (
          <div key={persona.id} className="card-padded hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between">
              <div>
                <h4 className="font-display font-semibold text-surface-800">
                  {persona.name}
                </h4>
                <div className="flex gap-2 mt-1">
                  <span className="badge-info text-[10px]">{persona.type}</span>
                </div>
              </div>
              <button
                onClick={() => handleRunSimulation(persona)}
                disabled={!!activeJob || !activeSurvey}
                className="btn-secondary text-xs"
              >
                Run
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
                      {key}: {typeof val === "object" ? "..." : String(val)}
                    </span>
                  ))}
              </div>
            )}
          </div>
        )) : null}
        {personas.length === 0 && (
          <div className="col-span-2 text-center py-12 text-surface-500 card-padded">
            No personas yet. Click &quot;Seed Defaults&quot; or &quot;Extract&quot; to get started.
          </div>
        )}
      </div>

      {/* Simulated Responses */}
      {responses.length > 0 && (
        <div className="card-padded">
          <div className="flex items-center justify-between mb-4">
            <h3 className="section-heading">
              Simulated Responses ({responses.length})
            </h3>
            <button
              onClick={() => simulation.getResponses(activeSurvey!.id).then(setResponses)}
              className="text-xs text-primary-600 hover:underline"
            >
              Refresh
            </button>
          </div>
          <div className="space-y-3 max-h-[400px] overflow-y-auto">
            {responses.map((resp) => (
              <div
                key={resp.id}
                className="p-3 rounded-lg bg-surface-50 border border-surface-100"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="badge-info text-[10px]">SIMULATED</span>
                    <span className="text-xs text-surface-400 font-mono">
                      {resp.llm_model_used}
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {Object.entries(resp.synthetic_answers).slice(0, 6).map(([k, v]) => (
                    <div key={k} className="text-xs">
                      <span className="text-surface-500 truncate block" title={k}>{k}:</span>
                      <span className="text-surface-800 font-medium line-clamp-1">
                        {String(v)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}