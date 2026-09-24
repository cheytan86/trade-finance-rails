// The attribution screen's loading state. Same reasoning as the queue's, and
// the same Deploy D7 finding — but this one asks the rail AND reads every open
// leg, so it is the slower of the two.
//
// The heading says what is coming, so the wait reads as work rather than as a
// broken click.

import { Card } from "@/components/ui/card";

export default function LoadingPayment() {
  return (
    <div className="flex flex-col gap-5">
      <div className="text-[12.5px] text-muted">← Money received</div>
      <Card title="The payment" sub="Re-reading the rail's own record.">
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-[13px]">
          {["Reference", "Amount", "Sender", "Arrived", "State", "Unattributed"].map((k) => (
            <div key={k} className="contents">
              <dt className="text-muted">{k}</dt>
              <dd className="text-muted">—</dd>
            </div>
          ))}
        </dl>
      </Card>
      <Card title="What could this be for?" sub="Gathering every open leg this payment could settle.">
        <p className="text-[13px] text-muted">
          Nothing is ranked and nothing is pre-selected — the legs arrive in maturity order, and
          the choice is yours.
        </p>
      </Card>
    </div>
  );
}
