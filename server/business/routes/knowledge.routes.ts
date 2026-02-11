import { router, publicProcedure } from "../../core/trpc";
import { knowledgeBaseService } from "../services/knowledge-base.service";
import { getDb } from "../../lib/db";
import * as schema from "../../../drizzle/schema";
import { eq, desc, count } from "drizzle-orm";
import { z } from "zod";

const graphRouter = router({
  getData: publicProcedure
    .input(z.object({ collectionId: z.number().optional() }).optional())
    .query(async ({ input }) => {
      const db = (await getDb())!;
      const cid = input?.collectionId;
      const [nodes, edges] = await Promise.all([
        cid ? db.select().from(schema.kgNodes).where(eq(schema.kgNodes.collectionId, cid)) : db.select().from(schema.kgNodes),
        cid ? db.select().from(schema.kgEdges).where(eq(schema.kgEdges.collectionId, cid)) : db.select().from(schema.kgEdges),
      ]);
      return { nodes, edges };
    }),
  createNode: publicProcedure
    .input(z.object({
      collectionId: z.number(), nodeId: z.string(), label: z.string(),
      type: z.string().default("entity"), properties: z.any().optional(),
      x: z.number().optional(), y: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      return db.insert(schema.kgNodes).values(input as any);
    }),
  updateNode: publicProcedure
    .input(z.object({
      id: z.number(), label: z.string().optional(), type: z.string().optional(),
      properties: z.any().optional(), x: z.number().optional(), y: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      const { id, ...data } = input;
      return db.update(schema.kgNodes).set(data as any).where(eq(schema.kgNodes.id, id));
    }),
  deleteNode: publicProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    return db.delete(schema.kgNodes).where(eq(schema.kgNodes.id, input.id));
  }),
  createEdge: publicProcedure
    .input(z.object({
      collectionId: z.number(), edgeId: z.string(), sourceNodeId: z.string(),
      targetNodeId: z.string(), label: z.string(), type: z.string().default("related_to"),
      weight: z.number().default(1),
    }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      return db.insert(schema.kgEdges).values(input as any);
    }),
  deleteEdge: publicProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    return db.delete(schema.kgEdges).where(eq(schema.kgEdges.id, input.id));
  }),
  stats: publicProcedure.query(async () => {
    const db = (await getDb())!;
    const [nodes, edges, collections] = await Promise.all([
      db.select({ count: count() }).from(schema.kgNodes),
      db.select({ count: count() }).from(schema.kgEdges),
      db.select({ count: count() }).from(schema.kbCollections),
    ]);
    return { nodes: nodes[0]?.count || 0, edges: edges[0]?.count || 0, collections: collections[0]?.count || 0 };
  }),
});

const collectionsRouter = router({
  list: publicProcedure.query(async () => {
    const db = (await getDb())!;
    return db.select().from(schema.kbCollections).orderBy(desc(schema.kbCollections.createdAt));
  }),
  create: publicProcedure
    .input(z.object({ name: z.string(), description: z.string().optional(), isPublic: z.boolean().default(true) }))
    .mutation(async ({ input }) => {
      const db = (await getDb())!;
      return db.insert(schema.kbCollections).values(input as any);
    }),
  documents: publicProcedure
    .input(z.object({ collectionId: z.number().optional() }))
    .query(({ input }) => knowledgeBaseService.listDocuments(input.collectionId)),
});

export const knowledgeRoutes = router({
  collections: collectionsRouter,
  graph: graphRouter,
});
