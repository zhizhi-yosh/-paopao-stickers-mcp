import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getSticker, searchStickers } from "./stickers.js";

export const WIDGET_URI = "ui://widget/paopao-sticker-v2.html";
const CDN_ORIGIN = "https://cdn.jsdelivr.net";

const stickerShape = {
  id: z.string(),
  fileName: z.string(),
  description: z.string(),
  labels: z.array(z.string()),
  imageUrl: z.string().url(),
};

export function createStickerServer(widgetHtml) {
  const server = new McpServer({
    name: "paopao-stickers",
    version: "0.2.0",
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
