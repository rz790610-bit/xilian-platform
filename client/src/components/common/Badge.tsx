import { cn } from '@/lib/utils';

type BadgeVariant = 'default' | 'success' | 'warning' | 'danger' | 'info';

interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
  dot?: boolean;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-secondary text-secondary-foreground',
  success: 'bg-success/20 text-success',
  warning: 'bg-warning/20 text-warning',
  danger: 'bg-danger/20 text-danger',
  info: 'bg-primary/20 text-primary'
};

export function Badge({ children, variant = 'default', className, dot }: BadgeProps) {
  return (
    <span 
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium",
        variantStyles[variant],
        className
      )}
    >
      {dot && (
        <span className={cn(
          "w-1.5 h-1.5 rounded-full",
          variant === 'success' && "bg-success",
          variant === 'warning' && "bg-warning",
          variant === 'danger' && "bg-danger",
          variant === 'info' && "bg-primary",
          variant === 'default' && "bg-muted-foreground"
        )} />
      )}
      {children}
    </span>
  );
}
