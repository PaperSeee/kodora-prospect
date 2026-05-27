import "dotenv/config";
import { defineConfig } from "prisma/config";

const tursoUrl = process.env["TURSO_DATABASE_URL"]
const tursoToken = process.env["TURSO_AUTH_TOKEN"]

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: tursoUrl && tursoToken
      ? `${tursoUrl}?authToken=${tursoToken}`
      : (process.env["DATABASE_URL"] ?? "file:./kodora.db"),
  },
});
