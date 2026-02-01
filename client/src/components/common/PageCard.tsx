import { cn } from '@/lib/utils';

interface PageCardProps {
  children: React.ReactNode;
  title?: string;
  icon?: string;
  action?: React.ReactNode;
  className?: string;
  noPadding?: boolean;
  onClick?: () => void;
}

export function PageCard({ children, title, icon, action, className, noPadding, onClick }: PageCardProps) {
  return (
    <div 
      onClick={onClick}
      className={cn(
        "bg-gradient-to-br from-card to-secondary border border-border rounded-2xl relative overflow-hidden transition-all duration-300",
        !noPadding && "p-6",
        onClick && "cursor-pointer",
        className
      )}
    >
      {/* Top highlight line */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      
      {(title || action) && (
        <div className={cn(
          "flex justify-between items-center",
          !noPadding && "mb-5"
        )}>
          {title && (
            <h3 className="text-lg font-semibold flex items-center gap-2.5 text-foreground">
              {icon && <span className="text-xl">{icon}</span>}
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
