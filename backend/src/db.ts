import { PrismaClient } from "@prisma/client";

export const db = new PrismaClient({
  log: process.env.LOG_LEVEL === "debug" ? ["query", "warn", "error"] : ["warn", "error"],
});
