import { defineConfig } from "vitest/config"
import path from "path"

// Config de test minimale : le repo n'avait aucun framework de test avant
// le correctif KPI (2026-09-01). On teste ici la logique métier pure
// (lib/*) et les handlers de route en les import direct, sans serveur HTTP.
export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["node_modules/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
})
