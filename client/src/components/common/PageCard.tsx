import { cn } from '@/lib/utils';

interface PageCardProps {
  children: React.ReactNode;
  title?: string;
  icon?: string;
  action?: React.ReactNode;
  className?: string;
  noPadding?: boolean;
  onClick?: () => void;
  compact?: boolean;
}

export function PageCard({ children, title, icon, action, className, noPadding, onClick, compact }: PageCardProps) {
  return (
    <div 
      onClick={onClick}
      className={cn(
        "bg-gradient-to-br from-card to-secondary border border-border rounded-xl relative overflow-hidden transition-all duration-300",
        !noPadding && (compact ? "p-3" : "p-4"),
        onClick && "cursor-pointer",
        className
      )}
    >
      {/* Top highlight line */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      
      {(title || action) && (
        <div className={cn(
          "flex justify-between items-center",
          !noPadding && (compact ? "mb-2" : "mb-3")
        )}>
          {title && (
            <h3 className={cn(
              "font-semibold flex items-center gap-2 text-foreground",
              compact ? "text-sm" : "text-base"
            )}>
              {icon && <span className={compact ? "text-base" : "text-lg"}>{icon}</span>}
              {title}
            </h3>
          )}
          {action && <div>{action}</div>}
        </div>
      )}
      
      {children}
    </div>
  );
}
