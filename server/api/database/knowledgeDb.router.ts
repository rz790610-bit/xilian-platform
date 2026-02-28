import { z, router, publicProcedure } from './_shared';
import { kbChunkService, kbConversationService, kbConversationMessageService, kbEmbeddingService, kbQaPairService } from '../../services/database/knowledge.db.service';

export const knowledgeDbRouter = router({
  listChunks: publicProcedure
    .input(z.object({ documentId: z.number(), page: z.number().optional(), pageSize: z.number().optional() }))
    .query(({ input }) => kbChunkService.listByDocument(input.documentId, input.page, input.pageSize)),
  getChunk: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(({ input }) => kbChunkService.getById(input.id)),
  createChunk: publicProcedure
    .input(z.object({ documentId: z.number(), chunkIndex: z.number(), content: z.string(), tokenCount: z.number().optional(), metadata: z.any().optional(), embeddingId: z.number().optional() }))
    .mutation(({ input }) => kbChunkService.create(input)),
  deleteChunksByDocument: publicProcedure
    .input(z.object({ documentId: z.number() }))
    .mutation(({ input }) => kbChunkService.deleteByDocument(input.documentId)),
  listConversations: publicProcedure
    .input(z.object({ collectionId: z.number().optional(), userId: z.string().optional(), page: z.number().optional(), pageSize: z.number().optional() }).optional())
    .query(({ input }) => kbConversationService.list(input ?? undefined)),
  getConversation: publicProcedure
    .input(z.object({ id: z.number() }))
    .query(({ input }) => kbConversationService.getById(input.id)),
  createConversation: publicProcedure
    .input(z.object({ collectionId: z.number(), title: z.string().optional(), userId: z.string(), modelName: z.string().optional() }))
    .mutation(({ input }) => kbConversationService.create(input)),
  listMessages: publicProcedure
    .input(z.object({ conversationId: z.number(), page: z.number().optional(), pageSize: z.number().optional() }))
    .query(({ input }) => kbConversationMessageService.listByConversation(input.conversationId, input.page, input.pageSize)),
  createMessage: publicProcedure
    .input(z.object({ conversationId: z.number(), role: z.string(), content: z.string(), tokenCount: z.number().optional(), sources: z.any().optional() }))
    .mutation(({ input }) => kbConversationMessageService.create(input)),
  feedbackMessage: publicProcedure
    .input(z.object({ id: z.number(), feedback: z.number() }))
    .mutation(({ input }) => kbConversationMessageService.feedback(input.id, input.feedback)),
  listEmbeddings: publicProcedure
    .input(z.object({ chunkId: z.number() }))
    .query(({ input }) => kbEmbeddingService.listByChunk(input.chunkId)),
  createEmbedding: publicProcedure
    .input(z.object({ chunkId: z.number(), modelName: z.string(), dimensions: z.number(), vectorData: z.string(), norm: z.number().optional() }))
    .mutation(({ input }) => kbEmbeddingService.create(input)),
  listQaPairs: publicProcedure
    .input(z.object({ collectionId: z.number().optional(), isVerified: z.number().optional(), search: z.string().optional(), page: z.number().optional(), pageSize: z.number().optional() }).optional())
    .query(({ input }) => kbQaPairService.list(input ?? undefined)),
  createQaPair: publicProcedure
    .input(z.object({ collectionId: z.number(), question: z.string(), answer: z.string(), sourceDocumentId: z.number().optional(), confidence: z.number().optional(), tags: z.any().optional() }))
    .mutation(({ input }) => kbQaPairService.create(input)),
  verifyQaPair: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) => kbQaPairService.verify(input.id)),
});
