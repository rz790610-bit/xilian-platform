import { getDb } from "../../lib/db";
import { eq } from "drizzle-orm";
import * as schema from "../../../drizzle/schema";

export type PluginStatus = "installed" | "running" | "stopped" | "error";

export class PluginManagerService {
  async listPlugins() {
    const db = (await getDb())!;
    return db.select().from(schema.pluginRegistry);
  }
  async installPlugin(data: { name: string; version: string; type: string; config?: any }) {
    const db = (await getDb())!;
    return db.insert(schema.pluginRegistry).values({ name: data.name, version: data.version, pluginType: data.type, config: data.config, status: "installed" } as any);
  }
  async startPlugin(pluginId: number) {
    const db = (await getDb())!;
    await db.update(schema.pluginRegistry).set({ status: "running" }).where(eq(schema.pluginRegistry.id, pluginId));
    await db.insert(schema.pluginEvents).values({ pluginId, eventType: "started", payload: { timestamp: new Date().toISOString() } } as any);
  }
  async stopPlugin(pluginId: number) {
    const db = (await getDb())!;
    await db.update(schema.pluginRegistry).set({ status: "stopped" }).where(eq(schema.pluginRegistry.id, pluginId));
    await db.insert(schema.pluginEvents).values({ pluginId, eventType: "stopped", payload: { timestamp: new Date().toISOString() } } as any);
  }
}
export const pluginManager = new PluginManagerService();
