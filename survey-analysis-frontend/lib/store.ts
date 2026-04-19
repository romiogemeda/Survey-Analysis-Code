import { create } from "zustand";
import type { SurveySchema, Submission, QualityScore } from "@/types";

export type AnalysisTab =
  | "overview"
  | "responses"
  | "analytics"
  | "charts"
  | "simulation";

interface AppState {
  activeSurvey: SurveySchema | null;
  setActiveSurvey: (survey: SurveySchema | null) => void;

  activeTab: AnalysisTab;
  setActiveTab: (tab: AnalysisTab) => void;

  // Survey list — shared between TopBar dropdown and Overview upload section
  surveys: SurveySchema[];
  setSurveys: (surveys: SurveySchema[]) => void;

  // Shared data — loaded once when survey changes, consumed by all tabs
  submissions: Submission[];
  setSubmissions: (subs: Submission[]) => void;
  qualityScores: Map<string, QualityScore>;
  setQualityScores: (scores: Map<string, QualityScore>) => void;

  qualityFilterEnabled: boolean;
  toggleQualityFilter: () => void;

  globalLoading: boolean;
  setGlobalLoading: (loading: boolean) => void;

  toasts: Array<{ id: string; message: string; type: "success" | "error" | "info" }>;
  addToast: (message: string, type?: "success" | "error" | "info") => void;
  removeToast: (id: string) => void;
}

export const useAppStore = create<AppState>((set) => ({
  activeSurvey: null,
  setActiveSurvey: (survey) =>
    set({ activeSurvey: survey, submissions: [], qualityScores: new Map() }),

  activeTab: "overview",
  setActiveTab: (tab) => set({ activeTab: tab }),

  surveys: [],
  setSurveys: (surveys) => set({ surveys }),

  submissions: [],
  setSubmissions: (submissions) => set({ submissions }),
  qualityScores: new Map(),
  setQualityScores: (qualityScores) => set({ qualityScores }),

  qualityFilterEnabled: false,
  toggleQualityFilter: () =>
    set((s) => ({ qualityFilterEnabled: !s.qualityFilterEnabled })),

  globalLoading: false,
  setGlobalLoading: (loading) => set({ globalLoading: loading }),

  toasts: [],
  addToast: (message, type = "info") => {
    const id = Date.now().toString(36);
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 4000);
  },
  removeToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));