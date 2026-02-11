export interface ApiResponse<T = any> { success: boolean; data?: T; error?: string; timestamp: string; }
export interface QueryOptions { page?: number; pageSize?: number; sortBy?: string; sortOrder?: "asc" | "desc"; filters?: Record<string, any>; }
