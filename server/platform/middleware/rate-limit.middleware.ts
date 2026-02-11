const counts = new Map<string, { count: number; resetAt: number }>();
export function rateLimitMiddleware(max = 100, windowMs = 60000) {
  return (req: any, res: any, next: any) => {
    const key = req.ip || "unknown";
    const now = Date.now();
    const e = counts.get(key);
    if (!e || now > e.resetAt) { counts.set(key, { count: 1, resetAt: now + windowMs }); return next(); }
    e.count++;
    if (e.count > max) return res.status(429).json({ error: "Too many requests" });
    next();
  };
}
