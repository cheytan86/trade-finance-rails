import { Amount } from "@/components/ui/amount";
import { ProvenanceBadge } from "@/components/ui/provenance-badge";
import { CheckStatusButton } from "@/components/check-status-button";

/**
 * THE IN-FLIGHT STRIP — cycle 2's one new screen pattern.
 *
 * Amber, hollow, dashed: the treatment cycle 0 reserved for
 * "initiated-not-settled" (`--flight`, DESIGN_SYSTEM_NOTES.md) and which had
 * never had a real tenant, because both earlier rails settle inside the
 * request that asked. A deferred rail finally gives it one.
 *
 * It replaces a leg's action button rather than sitting beside it — there is
 * nothing to press, and offering a second Fund would be an invitation to send
 * the money twice. It says plainly that nothing has booked, because the whole
 * risk of an asynchronous rail is money that looks settled and is not.
 */
export function InFlightStrip({
  legLabel,
  amountMinor,
  reference,
  initiatedAt,
  pendingId,
  failed,
  failureReason,
}: {
  legLabel: string;
  amountMinor: bigint;
  reference: string | null;
  initiatedAt: Date;
  pendingId: string;
  failed?: boolean;
  failureReason?: string | null;
}) {
  if (failed) {
    return (
      <div className="rounded-card border border-refuse/40 bg-refuse/5 p-4">
        <div className="flex items-baseline gap-2.5">
          <span className="text-[13.5px] font-semibold text-refuse">{legLabel} failed</span>
          <span className="flex-1" />
          <Amount minor={amountMinor} className="text-[15px]" />
        </div>
        <p className="mt-1.5 text-[12.5px] text-muted">
          {failureReason ?? "The rail reported this movement as failed."} Nothing was booked and
          nothing needs reversing — the money did not move. You can start this leg again.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-card border-[1.5px] border-dashed border-flight bg-flight/[0.03] p-4">
      <div className="flex flex-wrap items-baseline gap-2.5">
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border-[1.5px] border-dashed border-flight px-2.5 py-0.5 text-xs font-semibold text-flight">
          <i className="h-[5px] w-[5px] rounded-full border-[1.5px] border-flight" />
          in flight
        </span>
        <span className="text-[13.5px] font-semibold text-flight">{legLabel}</span>
        <span className="flex-1" />
        <Amount minor={amountMinor} className="text-[15px]" />
      </div>

      <div className="mt-1.5 flex flex-wrap items-center gap-2 font-mono text-[11px] text-muted">
        {reference ? (
          <ProvenanceBadge trusted>{reference}</ProvenanceBadge>
        ) : (
          <ProvenanceBadge>awaiting a reference</ProvenanceBadge>
        )}
        <span>initiated {initiatedAt.toISOString().slice(11, 16)}</span>
        <span>· {elapsed(initiatedAt)}</span>
      </div>

      <p className="mt-1.5 text-[12.5px] text-muted">
        Nothing has booked. The ledger moves when the rail confirms — or this leg un-flights with
        the rail&rsquo;s own reason if it fails.
      </p>

      <div className="mt-3">
        <CheckStatusButton pendingId={pendingId} />
      </div>
    </div>
  );
}

function elapsed(from: Date): string {
  const mins = Math.max(0, Math.floor((Date.now() - from.getTime()) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs} hr ago`;
}
