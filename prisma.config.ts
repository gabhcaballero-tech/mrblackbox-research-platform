import { defineConfig } from "prisma/config";

const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://USER:PASSWORD@HOST:5432/postgres";

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: databaseUrl
  },
  migrations: {
    path: "prisma/migrations"
  }
});
