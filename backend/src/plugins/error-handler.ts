import type { FastifyInstance } from "fastify";
import { ZodError } from "zod";

// Translates Zod validation errors into 400, Prisma "not found" (P2025) into
// 404, and falls back to the default Fastify handler otherwise.
export function registerErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ZodError) {
      reply.code(400).send({
        error: "validation_failed",
        issues: err.errors.map((e) => ({ path: e.path.join("."), message: e.message })),
      });
      return;
    }

    // Prisma's P2025 = Record not found.
    if (typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "P2025") {
      reply.code(404).send({ error: "not_found" });
      return;
    }

    const status = err.statusCode ?? 500;
    reply.code(status).send({
      error: status >= 500 ? "internal_error" : err.message,
      ...(status >= 500 && process.env.LOG_LEVEL === "debug" ? { stack: err.stack } : {}),
    });
  });
}
