import { cn } from "@/lib/cn";

const VARIANTS = {
  primary: "bg-cobalt text-white hover:opacity-90",
  secondary: "border border-line bg-card text-ink hover:bg-surface",
  danger: "border border-line bg-card text-refuse hover:bg-refuse/5",
} as const;

export function Button({
  variant = "primary",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof VARIANTS }) {
  return (
    <button
      {...props}
      className={cn(
        "rounded-lg px-4 py-2 text-[13.5px] font-semibold transition-colors",
        "disabled:cursor-not-allowed disabled:border disabled:border-line disabled:bg-surface disabled:text-muted/60",
        VARIANTS[variant],
        className,
      )}
    />
  );
}
