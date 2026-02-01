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
}

export function StatCard({ value, label, icon, trend, onClick, className }: StatCardProps) {
  return (
    <div 
      onClick={onClick}
      className={cn(
        "bg-card border border-border rounded-2xl p-6 relative overflow-hidden transition-all duration-300 card-hover",
        onClick && "cursor-pointer",
        className
      )}
    >
      {/* Background glow effect */}
      <div className="absolute -top-1/2 -right-1/2 w-full h-full bg-gradient-radial from-primary/10 to-transparent pointer-events-none" />
      
      <div className="relative z-10">
        <div className="flex justify-between items-start">
          <div>
            <div className="stat-value">{value}</div>
            <div className="text-sm text-muted-foreground mt-1">{label}</div>
          </div>
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-secondary to-muted flex items-center justify-center text-2xl">
            {icon}
          </div>
        </div>
        
        {trend && (
          <div className={cn(
            "flex items-center gap-1 text-sm mt-3",
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
