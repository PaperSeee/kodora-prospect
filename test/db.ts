import { execSync } from "child_process"
import fs from "fs"
import os from "os"
import path from "path"

// Chaque fichier de test travaille sur sa propre base SQLite jetable,
// construite depuis prisma/schema.prisma (prisma db push), pour ne jamais
// toucher à kodora.db (dev) ni à Turso (prod).
export function createTestDb(): { url: string; dbPath: string; cleanup: () => void } {
  const dbPath = path.join(os.tmpdir(), `kodora-test-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
  const url = `file:${dbPath}`

  const env: Record<string, string | undefined> = { ...process.env, DATABASE_URL: url }
  delete env.TURSO_DATABASE_URL
  delete env.TURSO_AUTH_TOKEN

  execSync("npx prisma db push --accept-data-loss", {
    cwd: path.resolve(__dirname, ".."),
    env: env as NodeJS.ProcessEnv,
    stdio: "pipe",
  })

  return {
    url,
    dbPath,
    cleanup: () => {
      for (const f of [dbPath, `${dbPath}-journal`, `${dbPath}-wal`, `${dbPath}-shm`]) {
        if (fs.existsSync(f)) fs.rmSync(f)
      }
    },
  }
}
