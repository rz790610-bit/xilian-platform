/**
 * 评分环组件（紧凑）
 */
export function ScoreGauge({ label, score, color }: { label: string; score: number; color: string }) {
  const pct = Math.round(score);
  return (
    <div className="text-center">
      <div className="relative w-12 h-12 mx-auto">
        <svg className="w-12 h-12 -rotate-90" viewBox="0 0 36 36">
          <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-muted" />
          <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="2.5" strokeDasharray={`${pct}, 100`} className={color} />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center text-xs font-bold text-foreground">{pct}</div>
      </div>
      <div className="text-[10px] text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}
