import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { getSticker, searchStickers } from "./stickers.js";

const WIDGET_URI = "ui://widget/paopao-sticker-v1.html";
const CDN_ORIGIN = "https://cdn.jsdelivr.net";
const widgetHtml = readFileSync(
  new URL("./sticker-widget.html", import.meta.url),
  "utf8"
);

const stickerShape = {
  id: z.string(),
  fileName: z.string(),
  description: z.string(),
  labels: z.array(z.string()),
  imageUrl: z.string().url(),
};

export function createStickerServer() {
  const server = new McpServer({
    name: "paopao-stickers",
    version: "0.1.0",
  });

  registerAppResource(
    server,
    "paopao-sticker-widget",
    WIDGET_URI,
    {},
    async () => ({
      contents: [
        {
          uri: WIDGET_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: widgetHtml,
          _meta: {
            ui: {
              prefersBorder: false,
              csp: {
                connectDomains: [],
                resourceDomains: [CDN_ORIGIN],
              },
            },
            "openai/widgetDescription":
              "A compact 160px sticker image shown inline with the assistant's conversational reply.",
            "openai/widgetPrefersBorder": false,
            "openai/widgetCSP": {
              connect_domains: [],
              resource_domains: [CDN_ORIGIN],
            },
          },
        },
      ],
    })
  );

  registerAppTool(
    server,
    "sticker_search",
    {
      title: "Search stickers",
      description:
        "Search 吱吱's sticker library by a short Chinese emotion or intent such as 吃醋、想念、亲亲、委屈、得意. Use only when a sticker genuinely improves the conversational reply. Return candidates, then call sticker_pick with exactly one candidate id. Do not send more than one sticker in a single assistant reply.",
      inputSchema: {
        query: z.string().min(1).describe("Short Chinese emotion or intent"),
        limit: z.number().int().min(1).max(10).optional().default(6),
      },
      outputSchema: {
        query: z.string(),
        candidates: z.array(z.object(stickerShape)),
      },
      _meta: {},
    },
    async ({ query, limit }) => {
      const candidates = searchStickers(query, limit);
      const summary = candidates.length
        ? candidates
            .map((item) => `${item.id}: ${item.description} [${item.labels.join("/")}]`)
            .join("\n")
        : "No matching sticker found.";

      return {
        content: [{ type: "text", text: summary }],
        structuredContent: { query, candidates },
      };
    }
  );

  registerAppTool(
    server,
    "sticker_pick",
    {
      title: "Send a sticker",
      description:
        "Render exactly one sticker selected from sticker_search. After calling this tool, continue the same assistant turn with a short natural conversational sentence; never leave the sticker as the entire reply.",
      inputSchema: {
        id: z.string().min(1).describe("Sticker id such as IMG_8270"),
      },
      outputSchema: {
        sticker: z.object(stickerShape),
      },
      _meta: {
        ui: { resourceUri: WIDGET_URI },
        "openai/outputTemplate": WIDGET_URI,
      },
    },
    async ({ id }) => {
      const sticker = getSticker(id);
      if (!sticker) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `Sticker ${id} was not found. Call sticker_search first.`,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: "text",
            text: `Sticker selected: ${sticker.description}. Continue with a short natural reply.`,
          },
        ],
        structuredContent: { sticker },
      };
    }
  );

  return server;
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
