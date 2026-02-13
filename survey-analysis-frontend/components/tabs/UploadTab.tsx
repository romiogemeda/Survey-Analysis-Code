"use client";

import { useCallback, useState } from "react";
import { useAppStore } from "@/lib/store";
import { ingestion } from "@/lib/api";
import type { UploadResult, AutoIngestResult } from "@/types";

export default function UploadTab() {
  const {
    activeSurvey,
    setActiveSurvey,
    setSurveys,
    setSubmissions,
    addToast,
    setActiveTab,
  } = useAppStore();
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState<
    Array<{ filename: string; records: number; valid: number; schemaTitle?: string }>
  >([]);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      await uploadFiles(Array.from(e.dataTransfer.files));
    },
    [activeSurvey]
  );

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    await uploadFiles(Array.from(e.target.files));
    // Reset input so the same file can be uploaded again
    e.target.value = "";
  };

  const uploadFiles = async (files: File[]) => {
    setUploading(true);

    for (const file of files) {
      try {
        if (activeSurvey) {
          // Existing survey — append data to it
          const result: UploadResult = await ingestion.uploadFile(activeSurvey.id, file);
          setResults((prev) => [
            { filename: file.name, records: result.total_records, valid: result.valid_records },
            ...prev,
          ]);
          addToast(
            `Uploaded ${file.name}: ${result.valid_records}/${result.total_records} valid`,
            "success"
          );
          // Reload shared submissions
          ingestion.getSubmissions(activeSurvey.id, false).then(setSubmissions).catch(() => {});
        } else {
          // No survey selected — auto-infer schema from file
          const result: AutoIngestResult = await ingestion.autoIngest(file);
          setResults((prev) => [
            {
              filename: file.name,
              records: result.total_records,
              valid: result.valid_records,
              schemaTitle: result.schema.title,
            },
            ...prev,
          ]);
          addToast(
            `Created "${result.schema.title}" with ${result.schema.question_definitions.length} questions · ${result.valid_records}/${result.total_records} records ingested`,
            "success"
          );
          // Update survey list and activate the new survey
          const updatedSchemas = await ingestion.listSchemas();
          setSurveys(updatedSchemas);
          setActiveSurvey(result.schema);
          // Load submissions for the new survey
          ingestion.getSubmissions(result.schema.id, false).then(setSubmissions).catch(() => {});
        }
      } catch (err) {
        addToast(`Failed to upload ${file.name}`, "error");
      }
    }

    setUploading(false);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Context message */}
      <div className="card-padded">
        {activeSurvey ? (
          <p className="text-sm text-surface-600">
            Uploading to: <strong>{activeSurvey.title}</strong> (v{activeSurvey.version_id}).
            Data will be appended to this survey.
          </p>
        ) : (
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-brand-50 flex items-center justify-center flex-shrink-0 mt-0.5">
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="text-brand-500">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-surface-800">Quick Start — Just drop a file</p>
              <p className="text-xs text-surface-500 mt-1">
                No survey selected. Upload a CSV or JSON file and the system will automatically
                create a survey by inferring question types from your data columns.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Drop zone */}
      <div className="card-padded">
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors ${
            isDragging
              ? "border-brand-400 bg-brand-50"
              : "border-surface-300 hover:border-surface-400"
          }`}
        >
          <div className="flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-surface-100 flex items-center justify-center">
              <svg
                width="24"
                height="24"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
                className="text-surface-500"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-surface-700">
                {uploading ? "Uploading..." : "Drag and drop files here, or click to browse"}
              </p>
              <p className="text-xs text-surface-400 mt-1">
                {activeSurvey
                  ? "Supports .json and .csv files"
                  : "Drop any .csv or .json — a survey will be created automatically"}
              </p>
            </div>
            <label className="btn-secondary cursor-pointer mt-2">
              <input
                type="file"
                accept=".json,.csv"
                multiple
                onChange={handleFileSelect}
                className="hidden"
              />
              Browse Files
            </label>
          </div>
        </div>
      </div>

      {/* Upload History */}
      {results.length > 0 && (
        <div className="card-padded">
          <h3 className="section-heading mb-4">Upload History</h3>
          <div className="space-y-2">
            {results.map((r, i) => (
              <div
                key={i}
                className="flex items-center justify-between py-2.5 px-3 rounded-lg bg-surface-50"
              >
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full bg-emerald-500" />
                  <div>
                    <span className="text-sm text-surface-700">{r.filename}</span>
                    {r.schemaTitle && (
                      <span className="text-xs text-brand-600 ml-2">
                        → created &quot;{r.schemaTitle}&quot;
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-surface-500">{r.records} total</span>
                  <span className="badge-high">{r.valid} valid</span>
                  {r.records - r.valid > 0 && (
                    <span className="badge-low">{r.records - r.valid} invalid</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Inferred Schema Preview — show after auto-ingest */}
      {activeSurvey && activeSurvey.question_definitions.length > 0 && results.some((r) => r.schemaTitle) && (
        <div className="card-padded">
          <div className="flex items-center justify-between mb-4">
            <h3 className="section-heading">Inferred Schema</h3>
            <button
              onClick={() => setActiveTab("overview")}
              className="text-xs text-brand-600 hover:text-brand-700 font-medium"
            >
              Go to Overview →
            </button>
          </div>
          <p className="text-xs text-surface-500 mb-3">
            The system inferred these question types from your data. You can proceed
            to the other tabs to analyze, visualize, and explore your data.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {activeSurvey.question_definitions.map((q) => (
              <div
                key={q.question_id}
                className="flex items-center justify-between px-3 py-2 rounded-lg bg-surface-50 border border-surface-100"
              >
                <div>
                  <span className="text-sm font-medium text-surface-800">{q.text}</span>
                  <span className="text-[10px] font-mono text-surface-400 ml-2">{q.question_id}</span>
                </div>
                <span
                  className={`badge text-[10px] ${
                    q.data_type === "INTERVAL"
                      ? "bg-blue-50 text-blue-700 border border-blue-200"
                      : q.data_type === "OPEN_ENDED"
                      ? "bg-purple-50 text-purple-700 border border-purple-200"
                      : q.data_type === "ORDINAL"
                      ? "bg-amber-50 text-amber-700 border border-amber-200"
                      : "bg-surface-100 text-surface-600 border border-surface-200"
                  }`}
                >
                  {q.data_type}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Format Guide */}
      <div className="card-padded">
        <h3 className="section-heading mb-3">Supported Formats</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <h4 className="text-sm font-semibold text-surface-700 mb-2">JSON</h4>
            <pre className="text-xs font-mono bg-surface-900 text-emerald-400 p-3 rounded-lg overflow-x-auto">
{`[
  {"age": 25, "device": "Mobile",
   "satisfaction": 4, "feedback": "Great app!"},
  {"age": 42, "device": "Desktop",
   "satisfaction": 3, "feedback": "Needs work"}
]`}
            </pre>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-surface-700 mb-2">CSV</h4>
            <pre className="text-xs font-mono bg-surface-900 text-emerald-400 p-3 rounded-lg overflow-x-auto">
{`age,device,satisfaction,feedback
25,Mobile,4,Great app!
42,Desktop,3,Needs work`}
            </pre>
          </div>
        </div>
        <p className="text-xs text-surface-400 mt-3">
          Column names become question IDs. Types are inferred automatically:
          numeric → INTERVAL, few distinct values → ORDINAL, long text → OPEN_ENDED, else NOMINAL.
        </p>
      </div>
    </div>
  );
}