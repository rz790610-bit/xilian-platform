import { router, publicProcedure } from "../../core/trpc";
import { knowledgeBaseService } from "../services/knowledge-base.service";
import { z } from "zod";

export const knowledgeRoutes = router({
  collections: publicProcedure.query(() => knowledgeBaseService.listCollections()),
  documents: publicProcedure.input(z.object({ collectionId: z.number().optional() })).query(({ input }) => knowledgeBaseService.listDocuments(input.collectionId)),
  graph: publicProcedure.query(() => knowledgeBaseService.getKnowledgeGraph()),
});
