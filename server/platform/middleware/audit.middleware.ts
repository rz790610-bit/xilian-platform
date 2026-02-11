import { getDb } from "../../lib/db";
import * as schema from "../../../drizzle/schema";
export async function auditMiddleware(req: any, res: any, next: any) {
  const db = (await getDb())!;
  if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    try {
      await db.insert(schema.auditLogs).values({ userId: req.userId || "anonymous", action: `${req.method} ${req.path}`, resource: req.path, details: { body: req.body, query: req.query }, ipAddress: req.ip } as any);
    } catch (e) { console.error("Audit log failed:", e); }
  }
  next();
}
