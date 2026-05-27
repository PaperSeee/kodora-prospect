import { PrismaClient } from "@prisma/client"
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3"
import { PrismaLibSql } from "@prisma/adapter-libsql"
import path from "path"

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

function createPrismaClient() {
  const tursoUrl = process.env.TURSO_DATABASE_URL
  const tursoToken = process.env.TURSO_AUTH_TOKEN

  if (tursoUrl && tursoToken) {
    const adapter = new PrismaLibSql({ url: tursoUrl, authToken: tursoToken })
    return new PrismaClient({ adapter } as never)
  }

  const dbUrl = process.env.DATABASE_URL ?? "file:./kodora.db"
  const dbPath = dbUrl.replace(/^file:/, "")
  const absolutePath = path.isAbsolute(dbPath) ? dbPath : path.resolve(process.cwd(), dbPath)
  const adapter = new PrismaBetterSqlite3({ url: absolutePath })
  return new PrismaClient({ adapter } as never)
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient()
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma
