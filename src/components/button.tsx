import Link from "next/link";
import { cn } from "@/lib/utils";

const base =
  "inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50";
const variants = {
  primary: "bg-accent text-bg hover:bg-accent/90",
  secondary: "border border-border bg-surface text-text hover:bg-surface-2",
};

type Variant = keyof typeof variants;

export function Button({
  variant = "primary",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button className={cn(base, variants[variant], className)} {...props} />;
}

export function LinkButton({
  variant = "primary",
  className,
  ...props
}: React.ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={cn(base, variants[variant], className)} {...props} />;
}
