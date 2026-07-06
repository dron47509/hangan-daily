const fs = require("fs");
const vm = require("vm");
const { execFileSync } = require("child_process");

const SITE_URL = (process.env.SITE_URL || "https://dron47509.github.io/hangan-daily").replace(/\/$/, "");
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const BEFORE_SHA = process.env.BEFORE_SHA;
const FORCE_LATEST = process.env.FORCE_LATEST === "true";
const DRY_RUN = process.env.TELEGRAM_DRY_RUN === "1";

function readNewsFromSource(source, label) {
  const context = {
    Intl,
    URL,
    console: { log() {}, warn() {}, error() {} },
  };

  vm.createContext(context);
  vm.runInContext(
    `${source}
this.__NEWS__ = NEWS;
this.__IMAGE_SOURCES__ = IMAGE_SOURCES;
this.__getSortedNews__ = getSortedNews;`,
    context,
    { filename: label },
  );

  return {
    news: context.__NEWS__,
    images: context.__IMAGE_SOURCES__,
    getSortedNews: context.__getSortedNews__,
  };
}

function readCurrentNews() {
  return readNewsFromSource(fs.readFileSync("scripts/news.js", "utf8"), "scripts/news.js");
}

function readOldNews() {
  if (!BEFORE_SHA || /^0+$/.test(BEFORE_SHA)) {
    return { news: [] };
  }

  try {
    const oldSource = execFileSync("git", ["show", `${BEFORE_SHA}:scripts/news.js`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return readNewsFromSource(oldSource, `${BEFORE_SHA}:scripts/news.js`);
  } catch (error) {
    console.warn(`Could not read previous news file: ${error.message}`);
    return { news: [] };
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function articleUrl(newsItem) {
  return `${SITE_URL}/article.html?id=${encodeURIComponent(newsItem.id)}`;
}

function captionFor(newsItem) {
  const url = articleUrl(newsItem);
  const title = escapeHtml(newsItem.title);
  const summary = escapeHtml(newsItem.summary);

  return `<b>${title}</b>\n\n${summary}\n\n<a href="${url}">Читать новость</a>`;
}

async function telegramRequest(method, payload) {
  if (DRY_RUN) {
    console.log(JSON.stringify({ method, payload }, null, 2));
    return;
  }

  if (!BOT_TOKEN || !CHAT_ID) {
    throw new Error("TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are required");
  }

  const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const result = await response.json();
  if (!response.ok || !result.ok) {
    throw new Error(`Telegram ${method} failed: ${JSON.stringify(result)}`);
  }
}

async function sendNews(newsItem, images) {
  const image = images[newsItem.image];
  const payload = {
    chat_id: CHAT_ID,
    parse_mode: "HTML",
    disable_web_page_preview: false,
  };

  if (image?.url) {
    await telegramRequest("sendPhoto", {
      ...payload,
      photo: image.url,
      caption: captionFor(newsItem).slice(0, 1024),
    });
    return;
  }

  await telegramRequest("sendMessage", {
    ...payload,
    text: captionFor(newsItem),
  });
}

async function main() {
  const current = readCurrentNews();
  const old = readOldNews();
  const oldIds = new Set(old.news.map((item) => item.id));
  let added = current.news.filter((item) => !oldIds.has(item.id));

  if (!added.length && FORCE_LATEST) {
    added = [current.getSortedNews(current.news)[0]].filter(Boolean);
  }

  added = current.getSortedNews(added);

  if (!added.length) {
    console.log("No new news to send.");
    return;
  }

  for (const newsItem of added) {
    console.log(`Sending Telegram notification: ${newsItem.title}`);
    await sendNews(newsItem, current.images);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
