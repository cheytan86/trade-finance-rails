// Provenance is never a colour (design §5): mock or demo-internal anything
// wears this dashed badge with the word inside, legible without colour.
export function ProvenanceBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block rounded-md border-[1.5px] border-dashed border-line bg-card px-2 py-px font-mono text-[11px] text-muted">
      {children}
    </span>
  );
}
