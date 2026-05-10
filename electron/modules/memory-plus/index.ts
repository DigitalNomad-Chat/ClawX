import type { IncomingMessage, ServerResponse } from "node:http";
import type { BackendModule } from "../types";
import { sendJson } from "../../api/route-utils";
import { createModuleLogger } from "../_shared/module-logger";
import { listEditableMemoryFiles, readEditableFile, writeEditableFileContent } from "../_shared/editable-file-service";
import { resolveEditableAgentScopes } from "../_shared/workspace-resolver";
import { loadCachedOpenClawMemorySummary } from "./memory-status";

const logger = createModuleLogger("memory-plus");

async function handleMemoryRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<boolean> {
  const pathname = url.pathname;

  // GET /api/memory/files
  if (pathname === "/api/memory/files" && req.method === "GET") {
    try {
      const files = await listEditableMemoryFiles();
      sendJson(res, 200, { ok: true, count: files.length, files });
    } catch (err) {
      logger.error("Failed to list memory files:", err);
      sendJson(res, 500, { ok: false, error: "Failed to list files" });
    }
    return true;
  }

  // GET /api/memory/files/content?path=xxx
  if (pathname === "/api/memory/files/content" && req.method === "GET") {
    const filePath = url.searchParams.get("path");
    if (!filePath) {
      sendJson(res, 400, { ok: false, error: "path is required" });
      return true;
    }
    try {
      const result = await readEditableFile("memory", filePath);
      if (!result) {
        sendJson(res, 404, { ok: false, error: "File not found" });
        return true;
      }
      sendJson(res, 200, { ok: true, entry: result.entry, content: result.content });
    } catch (err) {
      logger.error("Failed to read memory file:", err);
      sendJson(res, 500, { ok: false, error: "Failed to read file" });
    }
    return true;
  }

  // PUT /api/memory/files/content
  if (pathname === "/api/memory/files/content" && req.method === "PUT") {
    try {
      const body = await parseBody(req);
      const filePath = typeof body.path === "string" ? body.path : "";
      const content = typeof body.content === "string" ? body.content : "";
      if (!filePath) {
        sendJson(res, 400, { ok: false, error: "path is required" });
        return true;
      }
      const result = await writeEditableFileContent("memory", filePath, content);
      if (!result) {
        sendJson(res, 404, { ok: false, error: "File not found" });
        return true;
      }
      sendJson(res, 200, { ok: true, entry: result.entry, content: result.content });
    } catch (err) {
      logger.error("Failed to write memory file:", err);
      sendJson(res, 500, { ok: false, error: "Failed to write file" });
    }
    return true;
  }

  // GET /api/memory/agents
  if (pathname === "/api/memory/agents" && req.method === "GET") {
    try {
      const scopes = resolveEditableAgentScopes().scopes;
      sendJson(res, 200, { ok: true, agents: scopes.map((s) => ({ key: s.facetKey, label: s.facetLabel })) });
    } catch (err) {
      logger.error("Failed to list agents:", err);
      sendJson(res, 500, { ok: false, error: "Failed to list agents" });
    }
    return true;
  }

  // GET /api/memory/status
  if (pathname === "/api/memory/status" && req.method === "GET") {
    try {
      const summary = await loadCachedOpenClawMemorySummary();
      sendJson(res, 200, { ok: true, summary });
    } catch (err) {
      logger.error("Failed to load memory status:", err);
      sendJson(res, 500, { ok: false, error: "Failed to load memory status" });
    }
    return true;
  }

  return false;
}

function parseBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try {
        resolve(JSON.parse(data) as Record<string, unknown>);
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

const memoryPlusModule: BackendModule = {
  id: "memory-plus",
  name: "记忆增强",
  routeHandlers: [handleMemoryRoutes],
  enabledByDefault: true,
};

export default memoryPlusModule;
