/**
 * API Client — Typed wrapper around all backend endpoints.
 * Uses Next.js proxy rewrite (/api/* → localhost:8000/api/*).
 */

import type {
  AnalysisResult,
  AutoIngestResult,
  ChatMessage,
  ChatSession,
  ChartPayload,
  CorrelationAnalysisResult,
  CorrelationResult,
  ExecutiveSummary,
  Insight,
  MergeResult,
  Persona,
  QualityBatchResult,
  QualityScore,
  SentimentResult,
  SimulatedResponse,
  Submission,
  SurveySchema,
  UploadResult,
  RunBatchRequest,
  PromotionResult,
} from "@/types";

const BASE = "/api/v1";

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }
  return res.json();
}

// ── Ingestion ────────────────────────────────────

export const ingestion = {
  createSchema(data: {
    title: string;
    version_id?: number;
    question_definitions?: Array<{
      question_id: string;
      text: string;
      data_type: string;
      options?: string[];
    }>;
  }) {
    return request<SurveySchema>(`${BASE}/ingestion/schemas`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  listSchemas() {
    return request<SurveySchema[]>(`${BASE}/ingestion/schemas`);
  },

  getSchema(id: string) {
    return request<SurveySchema>(`${BASE}/ingestion/schemas/${id}`);
  },

  async uploadFile(schemaId: string, file: File): Promise<UploadResult> {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${BASE}/ingestion/upload/${schemaId}`, {
      method: "POST",
      body: form,
    });
    if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
    return res.json();
  },

  async autoIngest(file: File): Promise<AutoIngestResult> {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${BASE}/ingestion/auto-ingest`, {
      method: "POST",
      body: form,
    });
    if (!res.ok) throw new Error(`Auto-ingest failed: ${res.status}`);
    return res.json();
  },

  getSubmissions(schemaId: string, validOnly = true) {
    return request<Submission[]>(
      `${BASE}/ingestion/submissions/${schemaId}?valid_only=${validOnly}`
    );
  },

  getSubmission(submissionId: string) {
    return request<Submission>(
      `${BASE}/ingestion/submission/${submissionId}`
    );
  },

  getVersionChain(title: string) {
    return request<SurveySchema[]>(
      `${BASE}/ingestion/versions/${encodeURIComponent(title)}`
    );
  },

  mergeVersions(sourceSchemaId: string, targetSchemaId: string) {
    return request<MergeResult>(`${BASE}/ingestion/merge`, {
      method: "POST",
      body: JSON.stringify({
        source_schema_id: sourceSchemaId,
        target_schema_id: targetSchemaId,
      }),
    });
  },
};

// ── Quality ──────────────────────────────────────

export const quality = {
  scoreBatch(schemaId: string) {
    return request<QualityBatchResult>(
      `${BASE}/quality/score-batch/${schemaId}`,
      { method: "POST" }
    );
  },

  getScore(submissionId: string) {
    return request<QualityScore>(`${BASE}/quality/score/${submissionId}`);
  },
};

// ── Analytics ────────────────────────────────────

export const analytics = {
  analyze(schemaId: string) {
    return request<AnalysisResult>(
      `${BASE}/analytics/analyze/${schemaId}`,
      { method: "POST" }
    );
  },

  runCorrelations(schemaId: string) {
    return request<CorrelationAnalysisResult>(
      `${BASE}/analytics/correlations/${schemaId}`,
      { method: "POST" }
    );
  },

  getCorrelations(schemaId: string) {
    return request<CorrelationResult[]>(
      `${BASE}/analytics/correlations/${schemaId}`
    );
  },

  getInsights(schemaId: string) {
    return request<Insight[]>(`${BASE}/analytics/insights/${schemaId}`);
  },

  generateSummary(schemaId: string, qualityFilter = false) {
    return request<ExecutiveSummary>(
      `${BASE}/analytics/summary/${schemaId}?quality_filter=${qualityFilter}`,
      { method: "POST" }
    );
  },

  getSummary(schemaId: string) {
    return request<ExecutiveSummary>(`${BASE}/analytics/summary/${schemaId}`);
  },
};

// ── Visualization ────────────────────────────────

export const visualization = {
  buildDashboard(schemaId: string) {
    return request<ChartPayload[]>(
      `${BASE}/visualization/dashboard/${schemaId}`,
      { method: "POST" }
    );
  },

  analyzeSentiment(texts: string[]) {
    return request<SentimentResult[]>(`${BASE}/visualization/sentiment`, {
      method: "POST",
      body: JSON.stringify({ texts }),
    });
  },
};

// ── Simulation ───────────────────────────────────

export const simulation = {
  seedPersonas() {
    return request<Persona[]>(`${BASE}/simulation/personas/seed`, {
      method: "POST",
    });
  },

  listPersonas() {
    return request<Persona[]>(`${BASE}/simulation/personas`);
  },

  createPersona(data: { name: string; description_prompt: string }) {
    return request<Persona>(`${BASE}/simulation/personas`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  runSimulation(data: {
    survey_schema_id: string;
    persona_id: string;
    num_responses?: number;
  }) {
    return request<SimulatedResponse[]>(`${BASE}/simulation/run`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  runBatch(requestData: RunBatchRequest) {
    return request<SimulatedResponse[]>(`${BASE}/simulation/run-batch`, {
      method: "POST",
      body: JSON.stringify(requestData),
    });
  },

  getResponses(schemaId: string) {
    return request<SimulatedResponse[]>(
      `${BASE}/simulation/responses/${schemaId}`
    );
  },

  clearResponses(schemaId: string) {
    return request<{ deleted: number }>(
      `${BASE}/simulation/responses/${schemaId}`,
      { method: "DELETE" }
    );
  },

  promoteToAnalysis(schemaId: string) {
    return request<PromotionResult>(
      `${BASE}/simulation/promote/${schemaId}`,
      { method: "POST" }
    );
  },
};

// ── Chat ─────────────────────────────────────────

export const chat = {
  startSession(data: {
    survey_schema_id: string;
    session_type?: string;
    persona_id?: string | null;
  }) {
    return request<ChatSession>(`${BASE}/chat/sessions`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  sendMessage(data: { session_id: string; content: string }) {
    return request<ChatMessage>(`${BASE}/chat/messages`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  getHistory(sessionId: string) {
    return request<ChatMessage[]>(
      `${BASE}/chat/sessions/${sessionId}/history`
    );
  },

  extractPersonas(schemaId: string) {
    return request<Persona[]>(`${BASE}/chat/extract-personas`, {
      method: "POST",
      body: JSON.stringify({ survey_schema_id: schemaId }),
    });
  },
};

// ── System ───────────────────────────────────────

export const system = {
  health() {
    return request<{ status: string; modules: string[] }>("/health");
  },
};