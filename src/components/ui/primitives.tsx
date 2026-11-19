import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type HTMLAttributes, type InputHTMLAttributes, type LabelHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-2xl border border-line/70 bg-surface shadow-soft", className)} {...props} />;
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1 p-5 pb-3 sm:p-6 sm:pb-3", className)} {...props} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={cn("text-base font-semibold text-ink", className)} {...props} />;
}

export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm text-muted", className)} {...props} />;
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5 pt-0 sm:p-6 sm:pt-0", className)} {...props} />;
}

const badgeVariants = cva("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap", {
  variants: {
    tone: {
      neutral: "bg-sand text-ink-soft",
      brand: "bg-brand-50 text-brand-700",
      sage: "bg-sage-50 text-sage-700",
      sky: "bg-sky-50 text-sky-700",
      amber: "bg-amber-50 text-amber-700",
      safety: "bg-safety-50 text-safety-700",
      outline: "border border-line text-muted",
    },
  },
  defaultVariants: { tone: "neutral" },
});

export function Badge({ className, tone, ...props }: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

/** Prominent label for anything simulated — used consistently across the product. */
export function SimulatedBadge({ className, label = "Simulated" }: { className?: string; label?: string }) {
  return (
    <Badge tone="amber" className={cn("uppercase tracking-wide text-[10px] font-semibold", className)}>
      {label}
    </Badge>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "h-11 w-full rounded-xl border border-line bg-surface px-3.5 text-[15px] text-ink placeholder:text-muted/70 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:opacity-60",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "w-full rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[15px] text-ink placeholder:text-muted/70 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("text-sm font-medium text-ink-soft", className)} {...props} />;
}

export function Field({ label, hint, error, children, htmlFor }: { label: string; hint?: string; error?: string; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && !error && <p className="text-xs text-muted">{hint}</p>}
      {error && <p className="text-xs text-safety-600" role="alert">{error}</p>}
    </div>
  );
}

const calloutVariants = cva("flex gap-3 rounded-2xl border p-4 text-sm", {
  variants: {
    tone: {
      info: "border-sky-100 bg-sky-50 text-sky-700",
      brand: "border-brand-100 bg-brand-50 text-brand-900",
      amber: "border-amber-500/20 bg-amber-50 text-amber-700",
      safety: "border-safety-100 bg-safety-50 text-safety-700",
      neutral: "border-line bg-sand/50 text-ink-soft",
    },
  },
  defaultVariants: { tone: "info" },
});

export function Callout({ className, tone, icon, children, ...props }: HTMLAttributes<HTMLDivElement> & VariantProps<typeof calloutVariants> & { icon?: ReactNode }) {
  return (
    <div className={cn(calloutVariants({ tone }), className)} {...props}>
      {icon && <div className="mt-0.5 shrink-0 [&_svg]:size-4">{icon}</div>}
      <div className="min-w-0 flex-1 leading-relaxed">{children}</div>
    </div>
  );
}

export function PageHeader({ title, description, actions, eyebrow }: { title: string; description?: ReactNode; actions?: ReactNode; eyebrow?: string }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="mb-1 text-xs font-semibold uppercase tracking-[0.14em] text-brand-600">{eyebrow}</p>}
        <h1 className="font-display text-[28px] leading-tight text-ink sm:text-[32px]">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-[15px] text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-line bg-surface/60 px-6 py-10 text-center">
      {icon && <div className="mb-1 text-brand-500 [&_svg]:size-7">{icon}</div>}
      <p className="font-medium text-ink">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function Stat({ label, value, hint, className }: { label: string; value: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-2xl border border-line/70 bg-surface p-4 shadow-soft", className)}>
      <p className="text-xs font-medium text-muted">{label}</p>
      <p className="mt-1 font-display text-2xl text-ink tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}
