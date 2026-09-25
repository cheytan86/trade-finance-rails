// Provenance is never a colour (design §5): mock or demo-internal anything
// wears this dashed badge with the word inside, legible without colour.
export function ProvenanceBadge({
  children,
  href,
  trusted,
}: {
  children: React.ReactNode;
  /** When the evidence is independently checkable (a tx on an explorer),
   *  the badge becomes a link — solid-bordered, because it is no longer a
   *  stand-in for proof: it IS the proof. */
  href?: string;
  /** cycle 2 — THE THIRD TREATMENT, and it carries the product's argument.
   *  A Circle payment id is neither of the other two: it is REAL evidence
   *  that you cannot check yourself, because it lives in someone else's
   *  database. Solid, so it does not read as a stand-in; unlinked, because
   *  there is nowhere to send you. That difference is precisely the axis
   *  cycle 4's priced rail comparison exists to compare. */
  trusted?: boolean;
}) {
  if (trusted && !href) {
    return (
      <span
        title="Real evidence, recorded by the rail — but only the rail can confirm it. There is nothing public to check."
        className="inline-block rounded-md border border-line bg-surface px-2 py-px font-mono text-[11px] text-ink"
      >
        {children}
      </span>
    );
  }
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
