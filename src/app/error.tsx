"use client";

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-8 text-center">
      <div className="display text-[40px]">Something went wrong</div>
      <p className="mt-2 max-w-sm text-[14px] text-muted">{error.message}</p>
      <button onClick={reset} className="btn-primary mt-5">Try again</button>
    </div>
  );
}
