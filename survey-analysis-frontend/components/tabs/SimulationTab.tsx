"use client";

import { useEffect, useState } from "react";
import { useAppStore } from "@/lib/store";
import { simulation } from "@/lib/api";
import type { Persona, SimulatedResponse } from "@/types";

export default function SimulationTab() {
  const { activeSurvey, addToast } = useAppStore();
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [responses, setResponses] = useState<SimulatedResponse[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [simulating, setSimulating] = useState<string | null>(null);
  const [numResponses, setNumResponses] = useState(1);

  useEffect(() => {
    simulation.listPersonas().then(setPersonas).catch(() => {});
    if (activeSurvey) {
      simulation.getResponses(activeSurvey.id).then(setResponses).catch(() => {});
    }
  }, [activeSurvey]);

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
        num_responses: numResponses,
      });
      addToast(`Generated ${result.length} simulated responses`, "success");
      simulation.getResponses(activeSurvey.id).then(setResponses);
    } catch {
      addToast("Simulation failed — check LLM API key", "error");
    }
    setSimulating(null);
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
        <div className="card p-4 flex items-center gap-4">
          <span className="text-sm text-surface-600">Responses per simulation:</span>
          <input
            type="number"
            min={1}
            max={10}
            value={numResponses}
            onChange={(e) => setNumResponses(Number(e.target.value))}
            className="input w-20 text-center"
          />
          <span className="text-xs text-surface-400">
            Target: {activeSurvey.title}
          </span>
        </div>
      )}

      {/* Personas Grid */}
      <div className="grid grid-cols-2 gap-4">
        {personas.map((persona) => (
          <div key={persona.id} className="card-padded">
            <div className="flex items-start justify-between">
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
        ))}
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
        </div>
      )}
    </div>
  );
}