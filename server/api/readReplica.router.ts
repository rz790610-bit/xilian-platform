/**
 * 只读副本路由器 - 提供读写分离管理 API
 */

import { z } from 'zod';
import { router, protectedProcedure } from '../core/trpc';
import { readReplicaService } from '../services/readReplica.service';

export const readReplicaRouter = router({
  // 获取读写分离统计
  getStats: protectedProcedure.query(() => {
    return readReplicaService.getStats();
  }),

  // 获取副本状态列表
  listReplicas: protectedProcedure.query(() => {
    return readReplicaService.getReplicaStatuses();
  }),
});

export type ReadReplicaRouter = typeof readReplicaRouter;
