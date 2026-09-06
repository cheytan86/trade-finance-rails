import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { switchSeat } from "@/lib/roles/actions";
import type { Seat } from "@/lib/roles/parse";

// What a wrong-seat visitor sees instead of data: whose surface this is, and
// the one-click switch. Never the content (design §6).
export function RoleGate({
  required,
  current,
  returnTo,
}: {
  required: Seat;
  current: Seat;
  /** where the visitor was heading — the switch lands them there, not at the seat home */
  returnTo?: string;
}) {
  return (
    <div className="mx-auto max-w-md pt-10">
      <Card title={`This surface belongs to ${required === "ops" ? "platform ops" : `the ${required}`}`}>
        <p className="text-[13.5px] text-muted">
          You&apos;re in the <span className="font-semibold text-ink">{current}</span> seat, and
          each seat sees only its own book — that isolation is a tested property, not a
          convention. Switching is one click.
        </p>
        <form action={switchSeat} className="mt-4">
          <input type="hidden" name="seat" value={required} />
          {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
          <Button type="submit">Switch to {required}</Button>
        </form>
      </Card>
    </div>
  );
}
