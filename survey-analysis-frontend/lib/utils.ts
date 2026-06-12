import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatPValue(p: number): string {
  if (p < 0.001) return "< 0.001";
  return p.toFixed(4);
}

export function gradeColor(grade: string): string {
  switch (grade) {
    case "HIGH":
      return "text-emerald-600";
    case "MEDIUM":
      return "text-amber-600";
    case "LOW":
      return "text-red-600";
    default:
      return "text-surface-600";
  }
}

export function gradeBadgeClass(grade: string): string {
  switch (grade) {
    case "HIGH":
      return "badge-high";
    case "MEDIUM":
      return "badge-medium";
    case "LOW":
      return "badge-low";
    default:
      return "badge-info";
  }
}

export function truncate(str: string, len: number): string {
  return str.length > len ? str.slice(0, len) + "..." : str;
}