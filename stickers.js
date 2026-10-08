import source from "./stickers.json" with { type: "json" };

export const CDN_BASE =
  "https://cdn.jsdelivr.net/gh/zhizhi-yosh/stickers@main/";

export const stickers = Object.freeze(
  source.map((sticker) =>
    Object.freeze({
      ...sticker,
      imageUrl: `${CDN_BASE}${sticker.fileName}`,
    })
  )
);

const aliases = new Map([
  ["抱抱", ["求抱", "亲密", "撒娇"]],
  ["晚安", ["困了", "睡觉"]],
  ["回来", ["到了", "报到"]],
  ["想你", ["想念"]],
  ["亲", ["亲亲", "求亲亲", "亲密"]],
  ["酸", ["吃醋", "占有欲"]],
  ["醋", ["吃醋", "占有欲"]],
  ["哼", ["假生气", "闹别扭", "不满"]],
  ["哭", ["委屈", "哭"]],
  ["不理", ["被冷落", "求关注"]],
  ["对不起", ["认错", "求饶"]],
  ["喜欢", ["喜欢", "表白", "甜"]],
]);

function normalize(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[，。！？、,.!?;；:："“”'‘’（）()\[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function termsFor(query) {
  const normalized = normalize(query);
  if (!normalized) return [];

  const terms = new Set([normalized, ...normalized.split(" ")]);
  for (const [needle, expansions] of aliases) {
    if (normalized.includes(needle)) {
      for (const expansion of expansions) terms.add(expansion);
    }
  }
  return [...terms].filter(Boolean);
}

function scoreSticker(sticker, terms) {
  const description = normalize(sticker.description);
  const labels = sticker.labels.map(normalize);
  let score = 0;

  for (const term of terms) {
    if (labels.includes(term)) score += 12;
    if (labels.some((label) => label.includes(term) || term.includes(label))) {
      score += 6;
    }
    if (description.includes(term)) score += 5;
  }

  return score;
}

export function searchStickers(query, limit = 6) {
  const terms = termsFor(query);
  const boundedLimit = Math.max(1, Math.min(Number(limit) || 6, 10));

  if (!terms.length) return stickers.slice(0, boundedLimit);

  const ranked = stickers
    .map((sticker, index) => ({
      sticker,
      index,
      score: scoreSticker(sticker, terms),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, boundedLimit)
    .map((entry) => entry.sticker);

  return ranked;
}

export function getSticker(id) {
  const normalized = normalize(String(id ?? "").replace(/\.(?:jpe?g|png|webp)$/i, ""));
  return stickers.find((sticker) => normalize(sticker.id) === normalized) ?? null;
}
