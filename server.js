import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createStickerServer as createServerFromHtml } from "./server-factory.js";

const widgetHtml = readFileSync(
  new URL("./sticker-widget.html", import.meta.url),
  "utf8"
);

export function createStickerServer() {
  return createServerFromHtml(widgetHtml);
}

const MCP_PATH = "/mcp";

async function readJsonBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1024 * 1024) throw new Error("Request body is too large");
    chunks.push(chunk);
  }
  if (!chunks.length) return undefined;
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export function createHttpServer() {
  return createServer(async (req, res) => {
  if (!req.url) {
    res.writeHead(400).end("Missing URL");
    return;
  }

  const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);

  if (req.method === "OPTIONS" && url.pathname === MCP_PATH) {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "content-type, mcp-session-id",
      "Access-Control-Expose-Headers": "Mcp-Session-Id",
    });
    res.end();
    return;
  }

  if (req.method === "GET" && url.pathname === "/") {
    res
      .writeHead(200, { "content-type": "application/json; charset=utf-8" })
      .end(JSON.stringify({ name: "paopao-stickers", status: "ok" }));
    return;
  }

  if (url.pathname === MCP_PATH && req.method === "POST") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Expose-Headers", "Mcp-Session-Id");

    const server = createStickerServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    try {
      const body = await readJsonBody(req);
      await server.connect(transport);
      await transport.handleRequest(req, res, body);
      res.on("close", () => {
        transport.close();
        server.close();
      });
    } catch (error) {
      console.error("MCP request failed", error);
      if (!res.headersSent) res.writeHead(500).end("Internal server error");
    }
    return;
  }

  if (url.pathname === MCP_PATH && (req.method === "GET" || req.method === "DELETE")) {
    res
      .writeHead(405, { "content-type": "application/json; charset=utf-8" })
      .end(
        JSON.stringify({
          jsonrpc: "2.0",
          error: { code: -32000, message: "Method not allowed in stateless mode" },
          id: null,
        })
      );
    return;
  }

  res.writeHead(404).end("Not Found");
  });
}

export function startHttpServer(port = Number(process.env.PORT ?? 8787)) {
  const httpServer = createHttpServer();
  return httpServer.listen(port, "0.0.0.0", () => {
    console.log(`Paopao sticker MCP listening on http://0.0.0.0:${port}${MCP_PATH}`);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startHttpServer();
}
