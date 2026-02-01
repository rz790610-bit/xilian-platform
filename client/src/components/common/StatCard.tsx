import { cn } from '@/lib/utils';

interface StatCardProps {
  value: number | string;
  label: string;
  icon: string;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  onClick?: () => void;
  className?: string;
  compact?: boolean;
}

export function StatCard({ value, label, icon, trend, onClick, className, compact }: StatCardProps) {
  return (
    <div 
      onClick={onClick}
      className={cn(
        "bg-card border border-border rounded-lg relative overflow-hidden transition-all duration-300 card-hover",
        compact ? "p-2" : "p-2.5",
        onClick && "cursor-pointer",
        className
      )}
    >
      {/* Background glow effect */}
      <div className="absolute -top-1/2 -right-1/2 w-full h-full bg-gradient-radial from-primary/10 to-transparent pointer-events-none" />
      
      <div className="relative z-10">
        <div className="flex justify-between items-start">
          <div>
            <div className={cn(
              "font-bold bg-gradient-to-r from-primary to-cyan bg-clip-text text-transparent",
              compact ? "text-lg" : "text-xl"
            )}>{value}</div>
            <div className={cn(
              "text-muted-foreground",
              compact ? "text-[9px]" : "text-[10px]"
            )}>{label}</div>
          </div>
          <div className={cn(
            "rounded-md bg-gradient-to-br from-secondary to-muted flex items-center justify-center",
            compact ? "w-7 h-7 text-sm" : "w-8 h-8 text-base"
          )}>
            {icon}
          </div>
        </div>
        
        {trend && (
          <div className={cn(
            "flex items-center gap-0.5 mt-1",
            compact ? "text-[9px]" : "text-[10px]",
            trend.isPositive ? "text-success" : "text-danger"
          )}>
            <span>{trend.isPositive ? '↑' : '↓'}</span>
            <span>{Math.abs(trend.value)}%</span>
          </div>
        )}
      </div>
    </div>
  );
}
