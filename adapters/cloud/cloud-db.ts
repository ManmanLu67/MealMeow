/** 云数据库客户端。微信实现和测试假实现都走这五个方法。 */
export type CloudWhereValue = string | number | boolean | null | { lte: string }

export type CloudQuery = {
  where: Record<string, CloudWhereValue>
  limit?: number
  skip?: number
}

export type CloudDb = {
  get(collection: string, id: string): Promise<Record<string, unknown> | null>
  set(collection: string, id: string, data: Record<string, unknown>): Promise<void>
  remove(collection: string, id: string): Promise<void>
  query(collection: string, query: CloudQuery): Promise<Record<string, unknown>[]>
  runTransaction<T>(fn: (tx: CloudDb) => Promise<T>): Promise<T>
}
