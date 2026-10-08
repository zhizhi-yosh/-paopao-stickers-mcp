import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import widgetHtml from "./sticker-widget.html";
import { createStickerServer } from "./server-factory.js";

const MCP_PATH = "/mcp";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "content-type, mcp-session-id, last-event-id, mcp-protocol-version",
  "Access-Control-Expose-Headers": "mcp-session-id, mcp-protocol-version",
};

function withCors(response) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders)) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS" && url.pathname === MCP_PATH) {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (request.method === "GET" && url.pathname === "/") {
      return Response.json({
        name: "paopao-stickers",
        status: "ok",
        mcp: MCP_PATH,
      });
    }

    if (url.pathname !== MCP_PATH) {
      return new Response("Not Found", { status: 404 });
    }

    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
      maxRequestBodySize: 1024 * 1024,
    });
    const server = createStickerServer(widgetHtml);

    try {
      await server.connect(transport);
      return withCors(await transport.handleRequest(request));
    } catch (error) {
      console.error("MCP request failed", error);
      return withCors(
        Response.json(
          {
            jsonrpc: "2.0",
            error: { code: -32603, message: "Internal server error" },
            id: null,
          },
          { status: 500 }
        )
      );
    }
  },
};
