"use client";

import { useCallback, useState } from "react";
import { useAppStore } from "@/lib/store";
import { ingestion } from "@/lib/api";
import type { UploadResult } from "@/types";

export default function UploadPage() {
  const { activeSurvey, addToast } = useAppStore();
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState<UploadResult[]>([]);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      if (!activeSurvey) {
        addToast("Select a survey first", "error");
        return;
      }
      const files = Array.from(e.dataTransfer.files);
      await uploadFiles(files);
    },
    [activeSurvey]
  );

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!activeSurvey || !e.target.files) return;
    await uploadFiles(Array.from(e.target.files));
  };

  const uploadFiles = async (files: File[]) => {
    if (!activeSurvey) return;
    setUploading(true);
    const newResults: UploadResult[] = [];

    for (const file of files) {
      try {
        const result = await ingestion.uploadFile(activeSurvey.id, file);
        newResults.push(result);
        addToast(
          `Uploaded ${file.name}: ${result.valid_records}/${result.total_records} valid`,
          "success"
        );
      } catch (err) {
        addToast(`Failed to upload ${file.name}`, "error");
      }
    }

    setResults((prev) => [...newResults, ...prev]);
    setUploading(false);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-display font-bold">Upload Data</h1>
        <p className="text-surface-500 text-sm mt-1">
          Import survey responses in JSON or CSV format
        </p>
      </div>

      {!activeSurvey ? (
        <div className="card-padded text-center py-12">
          <p className="text-surface-500">
            Select a survey from the dropdown above to upload data.
          </p>
        </div>
      ) : (
        <>
          <div className="card-padded">
            <p className="text-sm text-surface-600 mb-4">
              Uploading to: <strong>{activeSurvey.title}</strong>
            </p>

            {/* Drop zone */}
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
                    {uploading
                      ? "Uploading..."
                      : "Drag and drop files here, or click to browse"}
                  </p>
                  <p className="text-xs text-surface-400 mt-1">
                    Supports .json and .csv files
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

          {/* Upload Results */}
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
                      <span className="text-sm text-surface-700">{r.status}</span>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="text-surface-500">
                        {r.total_records} total
                      </span>
                      <span className="badge-high">{r.valid_records} valid</span>
                      {r.total_records - r.valid_records > 0 && (
                        <span className="badge-low">
                          {r.total_records - r.valid_records} invalid
                        </span>
                      )}
                    </div>
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
                <h4 className="text-sm font-semibold text-surface-700 mb-2">
                  JSON
                </h4>
                <pre className="text-xs font-mono bg-surface-900 text-emerald-400 p-3 rounded-lg overflow-x-auto">
{`[
  {"age": "25", "device": "Mobile", "satisfaction": "4"},
  {"age": "42", "device": "Desktop", "satisfaction": "3"}
]`}
                </pre>
              </div>
              <div>
                <h4 className="text-sm font-semibold text-surface-700 mb-2">
                  CSV
                </h4>
                <pre className="text-xs font-mono bg-surface-900 text-emerald-400 p-3 rounded-lg overflow-x-auto">
{`age,device,satisfaction
25,Mobile,4
42,Desktop,3`}
                </pre>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}