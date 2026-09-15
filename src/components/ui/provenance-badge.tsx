// Provenance is never a colour (design §5): mock or demo-internal anything
// wears this dashed badge with the word inside, legible without colour.
export function ProvenanceBadge({
  children,
  href,
}: {
  children: React.ReactNode;
  /** When the evidence is independently checkable (a tx on an explorer),
   *  the badge becomes a link — solid-bordered, because it is no longer a
   *  stand-in for proof: it IS the proof. */
  href?: string;
}) {
  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        className="inline-block rounded-md border border-cobalt/40 bg-cobalt/5 px-2 py-px font-mono text-[11px] text-cobalt hover:bg-cobalt/10"
      >
        {children} ↗
      </a>
    );
  }
  return (
    <span className="inline-block rounded-md border-[1.5px] border-dashed border-line bg-card px-2 py-px font-mono text-[11px] text-muted">
      {children}
    </span>
  );
}
