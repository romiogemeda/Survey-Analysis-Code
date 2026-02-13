export default function ReportsPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen text-center px-6">
      <div className="w-16 h-16 rounded-2xl bg-surface-100 flex items-center justify-center mb-5">
        <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="text-surface-400">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      </div>
      <h2 className="text-xl font-display font-semibold text-surface-800">
        Report Generation
      </h2>
      <p className="text-surface-500 mt-2 max-w-md">
        Module 3 — Generate PDF/DOCX reports from analysis results with customizable templates and branding.
        This module is under development.
      </p>
      <span className="mt-4 badge-info text-xs">Coming Soon</span>
    </div>
  );
}