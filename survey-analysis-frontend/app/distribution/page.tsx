export default function DistributionPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen text-center px-6">
      <div className="w-16 h-16 rounded-2xl bg-surface-100 flex items-center justify-center mb-5">
        <svg width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} className="text-surface-400">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      </div>
      <h2 className="text-xl font-display font-semibold text-surface-800">
        Survey Distribution
      </h2>
      <p className="text-surface-500 mt-2 max-w-md">
        Module 4 — Distribute surveys via email, link sharing, embeds, and QR codes with audience targeting.
        This module is under development.
      </p>
      <span className="mt-4 badge-info text-xs">Coming Soon</span>
    </div>
  );
}