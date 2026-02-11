import { getDb } from "../../lib/db";
import { eq } from "drizzle-orm";
import * as schema from "../../../drizzle/schema";

export class KnowledgeBaseService {
  async listCollections() {
    const db = (await getDb())!;
    return db.select().from(schema.kbCollections);
  }
  async listDocuments(collectionId?: number) {
    const db = (await getDb())!;
    if (collectionId) return db.select().from(schema.kbDocuments).where(eq(schema.kbDocuments.collectionId, collectionId));
    return db.select().from(schema.kbDocuments);
  }
  async getKnowledgeGraph() {
    const db = (await getDb())!;
    const [nodes, edges] = await Promise.all([db.select().from(schema.kgNodes), db.select().from(schema.kgEdges)]);
    return { nodes, edges };
  }
}
export const knowledgeBaseService = new KnowledgeBaseService();
