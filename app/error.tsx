'use client';
export default function GlobalError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="min-h-screen bg-[#1A0F0A] flex items-center justify-center">
      <div className="text-center space-y-4">
        <p className="text-white/50">Une erreur est survenue</p>
        <button onClick={reset} className="text-[#C19A6B] border border-[#C19A6B]/30 px-4 py-2 rounded-xl">
          Réessayer
        </button>
      </div>
    </div>
  );
}