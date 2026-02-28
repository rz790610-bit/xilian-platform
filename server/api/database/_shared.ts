/**
 * 数据库子路由公共依赖
 * 所有 database/*.router.ts 统一复用此文件的导出
 */
import { z } from 'zod';
import { router, protectedProcedure } from '../../core/trpc';

// 保持向后兼容 — 原文件中 publicProcedure 实际指向 protectedProcedure
const publicProcedure = protectedProcedure;

export { z, router, publicProcedure };
