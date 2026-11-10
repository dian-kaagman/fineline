/** A placeholder block while data loads (no shimmer animation). */
export function Skeleton({ className }: { className?: string }) {
  return <div className={`skeleton ${className ?? ""}`.trim()} aria-hidden="true" />;
}
