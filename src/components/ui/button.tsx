import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva("btn", {
  variants: {
    variant: {
      primary: "btn-primary",
      gold: "btn-gold",
      outline: "btn-outline",
      ghost: "btn-ghost",
      danger: "btn-danger",
    },
    size: {
      sm: "text-xs px-3 py-1.5 gap-1.5",
      default: "",
      lg: "text-base px-6 py-3",
    },
  },
  defaultVariants: {
    variant: "primary",
    size: "default",
  },
});

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, loading, children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={disabled || loading}
        {...props}
      >
        {loading ? (
          <span
            style={{
              width: 14,
              height: 14,
              border: "2px solid currentColor",
              borderTopColor: "transparent",
              borderRadius: "50%",
              display: "inline-block",
              animation: "spin 0.6s linear infinite",
            }}
          />
        ) : null}
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";

export { Button, buttonVariants };
