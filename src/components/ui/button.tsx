import { cva, type VariantProps } from "class-variance-authority";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0 cursor-pointer",
  {
    variants: {
      variant: {
        primary: "bg-teal-600 text-white shadow-soft hover:bg-teal-700",
        secondary: "bg-surface text-ink border border-line hover:bg-sand/60",
        soft: "bg-teal-50 text-teal-700 hover:bg-teal-100",
        ghost: "text-ink-soft hover:bg-sand/70",
        safety: "bg-safety-500 text-white shadow-soft hover:bg-safety-600",
        "safety-soft": "bg-safety-50 text-safety-700 border border-safety-100 hover:bg-safety-100",
        link: "text-teal-700 underline-offset-4 hover:underline rounded-none px-0",
      },
      size: {
        sm: "h-9 px-3.5 text-sm",
        md: "h-11 px-5 text-sm",
        lg: "h-12 px-6 text-base",
        icon: "size-10",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = "button", ...props }, ref) => (
    <button ref={ref} type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  ),
);
Button.displayName = "Button";
