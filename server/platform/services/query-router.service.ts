import { mysqlConnector } from "../connectors/mysql.connector";
import { clickhouseConnector } from "../connectors/clickhouse.connector";
import { qdrantConnector } from "../connectors/qdrant.connector";
import { nebulaConnector } from "../connectors/nebula.connector";

export type QueryEngine = "mysql" | "clickhouse" | "qdrant" | "nebula";
export interface QueryRequest { engine: QueryEngine; query: string; params?: Record<string, any>; }

export class QueryRouterService {
  async route(req: QueryRequest): Promise<any> {
    switch (req.engine) {
      case "mysql": return (await mysqlConnector.getConnection()).execute(req.query);
      case "clickhouse": return clickhouseConnector.query(req.query);
      case "qdrant": return qdrantConnector.search(req.params?.collection || "default", req.params?.vector || [], req.params?.limit || 10);
      case "nebula": return nebulaConnector.executeNGQL(req.query);
      default: throw new Error(`Unknown engine: ${req.engine}`);
    }
  }
  inferEngine(tableName: string): QueryEngine {
    if (tableName.startsWith("ch_")) return "clickhouse";
    if (tableName.startsWith("kg_")) return "nebula";
    if (tableName.includes("embedding") || tableName === "kb_points") return "qdrant";
    return "mysql";
  }
}
export const queryRouter = new QueryRouterService();
