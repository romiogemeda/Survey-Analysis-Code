"use client";

import { useEffect, useState } from "react";
import { ingestion } from "@/lib/api";
import { useAppStore } from "@/lib/store";
import type { SurveySchema } from "@/types";
import { formatDate } from "@/lib/utils";

const DATA_TYPES = ["NOMINAL", "ORDINAL", "INTERVAL", "OPEN_ENDED"] as const;

interface QuestionInput {
  question_id: string;
  text: string;
  data_type: string;
  options: string;
}

export default function SurveysPage() {
  const { setActiveSurvey, addToast } = useAppStore();
  const [surveys, setSurveys] = useState<SurveySchema[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [questions, setQuestions] = useState<QuestionInput[]>([
    { question_id: "", text: "", data_type: "NOMINAL", options: "" },
  ]);
  const [submitting, setSubmitting] = useState(false);

  const loadSurveys = () => {
    ingestion.listSchemas().then(setSurveys).catch(() => {});
  };

  useEffect(loadSurveys, []);

  const addQuestion = () => {
    setQuestions((q) => [
      ...q,
      { question_id: "", text: "", data_type: "NOMINAL", options: "" },
    ]);
  };

  const removeQuestion = (idx: number) => {
    setQuestions((q) => q.filter((_, i) => i !== idx));
  };

  const updateQuestion = (idx: number, field: keyof QuestionInput, value: string) => {
    setQuestions((q) =>
      q.map((item, i) => (i === idx ? { ...item, [field]: value } : item))
    );
  };

  const handleSubmit = async () => {
    if (!title.trim()) return;
    setSubmitting(true);
    try {
      const defs = questions
        .filter((q) => q.question_id && q.text)
        .map((q) => ({
          question_id: q.question_id,
          text: q.text,
          data_type: q.data_type,
          options: q.options ? q.options.split(",").map((o) => o.trim()) : undefined,
        }));

      const schema = await ingestion.createSchema({
        title,
        question_definitions: defs,
      });
      addToast("Survey schema created!", "success");
      setActiveSurvey(schema);
      setShowForm(false);
      setTitle("");
      setQuestions([{ question_id: "", text: "", data_type: "NOMINAL", options: "" }]);
      loadSurveys();
    } catch (e) {
      addToast("Failed to create schema", "error");
    }
    setSubmitting(false);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold">Surveys</h1>
          <p className="text-surface-500 text-sm mt-1">
            Create and manage survey schemas
          </p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="btn-primary"
        >
          {showForm ? "Cancel" : "+ New Survey"}
        </button>
      </div>

      {/* Create Form */}
      {showForm && (
        <div className="card-padded animate-slide-up space-y-5">
          <h3 className="section-heading">New Survey Schema</h3>

          <div>
            <label className="block text-sm font-medium text-surface-700 mb-1.5">
              Survey Title
            </label>
            <input
              className="input"
              placeholder="e.g., Product Satisfaction Survey v1"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-surface-700 mb-3">
              Question Definitions
            </label>
            <div className="space-y-3">
              {questions.map((q, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-[1fr_2fr_1fr_1.5fr_auto] gap-2 items-start"
                >
                  <input
                    className="input text-xs"
                    placeholder="ID (e.g., q1)"
                    value={q.question_id}
                    onChange={(e) => updateQuestion(idx, "question_id", e.target.value)}
                  />
                  <input
                    className="input text-xs"
                    placeholder="Question text"
                    value={q.text}
                    onChange={(e) => updateQuestion(idx, "text", e.target.value)}
                  />
                  <select
                    className="input text-xs"
                    value={q.data_type}
                    onChange={(e) => updateQuestion(idx, "data_type", e.target.value)}
                  >
                    {DATA_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                  <input
                    className="input text-xs"
                    placeholder="Options (comma-separated)"
                    value={q.options}
                    onChange={(e) => updateQuestion(idx, "options", e.target.value)}
                  />
                  <button
                    onClick={() => removeQuestion(idx)}
                    className="btn-ghost p-2 text-red-500 hover:text-red-700"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <button onClick={addQuestion} className="btn-ghost text-xs mt-2">
              + Add Question
            </button>
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-surface-100">
            <button onClick={() => setShowForm(false)} className="btn-secondary">
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={submitting || !title.trim()}
              className="btn-primary"
            >
              {submitting ? "Creating..." : "Create Schema"}
            </button>
          </div>
        </div>
      )}

      {/* Surveys List */}
      <div className="grid gap-3">
        {surveys.map((survey) => (
          <div
            key={survey.id}
            className="card p-5 hover:shadow-elevated transition-shadow cursor-pointer"
            onClick={() => setActiveSurvey(survey)}
          >
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-display font-semibold text-surface-800">
                  {survey.title}
                </h4>
                <p className="text-xs text-surface-500 mt-1">
                  Version {survey.version_id} ·{" "}
                  {survey.question_definitions?.length || 0} questions ·{" "}
                  Created {formatDate(survey.created_at)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {survey.question_definitions?.slice(0, 3).map((q) => (
                  <span key={q.question_id} className="badge-info text-[10px]">
                    {q.data_type}
                  </span>
                ))}
                {(survey.question_definitions?.length || 0) > 3 && (
                  <span className="text-xs text-surface-400">
                    +{(survey.question_definitions?.length || 0) - 3}
                  </span>
                )}
              </div>
            </div>
          </div>
        ))}
        {surveys.length === 0 && (
          <div className="text-center py-12 text-surface-500">
            No surveys yet. Create your first one above.
          </div>
        )}
      </div>
    </div>
  );
}