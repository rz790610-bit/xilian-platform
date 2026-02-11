import { authService } from "../services/auth.service";
export async function authMiddleware(req: any, res: any, next: any) {
  const token = req.headers.authorization?.replace("Bearer ", "");
  const result = await authService.validateToken(token || "");
  if (!result.valid) return res.status(401).json({ error: "Unauthorized" });
  req.userId = result.userId;
  next();
}
