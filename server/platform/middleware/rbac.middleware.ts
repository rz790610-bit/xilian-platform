import { authService } from "../services/auth.service";
export function rbacMiddleware(requiredPermission: string) {
  return async (req: any, res: any, next: any) => {
    const perms = await authService.getUserPermissions(req.userId || "");
    if (!perms.includes(requiredPermission) && !perms.includes("admin")) return res.status(403).json({ error: "Forbidden" });
    next();
  };
}
