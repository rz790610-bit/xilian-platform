import { getDb } from "../../lib/db";
import { eq } from "drizzle-orm";
import * as schema from "../../../drizzle/schema";

export class AssetTreeService {
  async getTree() {
    const db = (await getDb())!;
    const [nodes, mps, sensors, mappings] = await Promise.all([
      db.select().from(schema.assetNodes),
      db.select().from(schema.assetMeasurementPoints),
      db.select().from(schema.assetSensors),
      db.select().from(schema.sensorMpMapping),
    ]);
    return { nodes, measurementPoints: mps, sensors, mappings };
  }
  async getNodeChildren(parentId: string) {
    const db = (await getDb())!;
    return db.select().from(schema.assetNodes).where(eq(schema.assetNodes.parentNodeId, parentId));
  }
  async getNodeMeasurementPoints(nodeId: string) {
    const db = (await getDb())!;
    return db.select().from(schema.assetMeasurementPoints).where(eq(schema.assetMeasurementPoints.nodeId, nodeId));
  }
}
export const assetTreeService = new AssetTreeService();
