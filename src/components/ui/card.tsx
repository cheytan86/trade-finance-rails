import { cn } from "@/lib/cn";

export function Card({
  title,
  sub,
  className,
  children,
}: {
  title?: string;
  sub?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("rounded-card border border-line bg-card p-5 shadow-card", className)}>
      {title ? <h2 className="text-[15px] font-semibold">{title}</h2> : null}
      {sub ? <p className="mt-0.5 mb-3.5 text-[13px] text-muted">{sub}</p> : null}
      {children}
    </section>
  );
}
