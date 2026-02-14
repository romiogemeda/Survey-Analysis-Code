// ── Domain Types ────────────────────────────────

export type QualityGrade = "HIGH" | "MEDIUM" | "LOW";
export type DataType = "NOMINAL" | "ORDINAL" | "INTERVAL" | "OPEN_ENDED" | "IDENTIFIER" | "BOOLEAN" | "DATETIME" | "MULTI_SELECT";
export type CorrelationMethod = "CHI_SQUARE" | "PEARSON" | "SPEARMAN";
export type InsightSeverity = "HIGH" | "MEDIUM" | "LOW";
export type ChatSessionType = "DATA_QUERY" | "PERSONA_INTERVIEW";

// ── API Response Types ─────────────────────────

export interface QuestionDefinition {
  question_id: string;
  text: string;
  data_type: DataType;
  options?: string[] | null;
  is_required?: boolean;
}

export interface SurveySchema {
  id: string;
  title: string;
  version_id: number;
  question_definitions: QuestionDefinition[];
  created_at: string;
}

export interface Submission {
  id: string;
  survey_schema_id: string;
  raw_responses: Record<string, unknown>;
  source_format: string;
  started_at: string | null;
  completed_at: string | null;
  received_at: string;
  is_valid: boolean;
}

export interface QualityScore {
  id: string;
  submission_id: string;
  grade: QualityGrade;
  speed_score: number;
  variance_score: number;
  gibberish_score: number;
  composite_score: number;
  scored_at: string;
}

export interface CorrelationResult {
  id: string;
  survey_schema_id: string;
  independent_variable: string;
  dependent_variable: string;
  method: CorrelationMethod;
  statistic_value: number;
  p_value: number;
  is_significant: boolean;
  analyzed_at: string;
}

export interface Insight {
  id: string;
  survey_schema_id: string;
  correlation_result_id?: string;
  insight_text: string;
  severity: InsightSeverity;
  generated_at: string;
}

export interface ChartPayload {
  question_id: string;
  question_text: string;
  data_type: string;
  chart_type: string;
  labels: string[];
  values: number[];
  metadata?: Record<string, unknown>;
}

export interface SentimentResult {
  text: string;
  polarity: number;
  subjectivity: number;
  label: "POSITIVE" | "NEUTRAL" | "NEGATIVE";
}

export interface Persona {
  id: string;
  name: string;
  type: string;
  description_prompt?: string;
  parsed_parameters: Record<string, unknown>;
}

export interface SimulatedResponse {
  id: string;
  persona_id: string;
  synthetic_answers: Record<string, unknown>;
  is_simulated: boolean;
  llm_model_used: string;
}

export interface ChatSession {
  session_id: string;
  survey_schema_id: string;
  session_type: ChatSessionType;
}

export interface ChatMessage {
  role: "USER" | "ASSISTANT";
  content: string;
  chart_code?: string | null;
  chart_data?: Record<string, unknown>[] | null;
  chart_type?: string | null;
  executed_query?: Record<string, unknown> | null;
  result_snapshot?: Record<string, unknown> | null;
  sent_at?: string;
}

export interface UploadResult {
  status: string;
  total_records: number;
  valid_records: number;
}

export interface AutoIngestResult {
  status: string;
  schema: SurveySchema;
  total_records: number;
  valid_records: number;
}

export interface QualityBatchResult {
  scored: number;
  grades: {
    HIGH: number;
    MEDIUM: number;
    LOW: number;
  };
}

export interface CorrelationAnalysisResult {
  total_pairs_analyzed: number;
  significant: number;
  results: CorrelationResult[];
}

export interface VersionChange {
  has_changes: boolean;
  added_fields: string[];
  removed_fields: string[];
  type_changes: Record<string, { old: string; new: string }>;
}

export interface MergeResult {
  source_schema: { id: string; version: number };
  target_schema: { id: string; version: number };
  field_mapping: {
    matched: Record<string, string>;
    only_in_source: string[];
    only_in_target: string[];
  };
  total_merged_records: number;
  source_records: number;
  target_records: number;
  merged_data: Record<string, unknown>[];
}

export interface ExecutiveSummary {
  survey_schema_id: string;
  summary_text: string;
  llm_model_used: string;
  quality_filter_applied: boolean;
  generated_at?: string;
}