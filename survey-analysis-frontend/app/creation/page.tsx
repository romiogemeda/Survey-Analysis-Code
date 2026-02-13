export default function CreationPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen text-center px-6">
      <div className="w-16 h-16 rounded-2xl bg-surface-100 flex items-center justify-center mb-5">
        <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="text-surface-400">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
      </div>
      <h2 className="text-xl font-display font-semibold text-surface-800">
        Survey Creation
      </h2>
      <p className="text-surface-500 mt-2 max-w-md">
        Module 1 — Design surveys with question types, logic branching, and templates.
        This module is under development.
      </p>
      <span className="mt-4 badge-info text-xs">Coming Soon</span>
    </div>
  );
}