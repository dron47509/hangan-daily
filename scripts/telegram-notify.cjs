const fs = require("fs");
const vm = require("vm");
const { execFileSync } = require("child_process");

const SITE_URL = (process.env.SITE_URL || "https://dron47509.github.io/hangan-daily").replace(/\/$/, "");
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const BEFORE_SHA = process.env.BEFORE_SHA;
const FORCE_LATEST = process.env.FORCE_LATEST === "true";
const SEND_ALL = process.env.SEND_ALL === "true";
const WAIT_FOR_SITE = process.env.WAIT_FOR_SITE === "true";
const SITE_WAIT_TIMEOUT_MS = Number(process.env.SITE_WAIT_TIMEOUT_MS || 10 * 60 * 1000);
const SITE_WAIT_INTERVAL_MS = Number(process.env.SITE_WAIT_INTERVAL_MS || 10 * 1000);
const DRY_RUN = process.env.TELEGRAM_DRY_RUN === "1";
const CATEGORY_TAGS = {
  sport: "#спорт",
  showbiz: "#шоубизнес",
  politics: "#политика",
  corporations: "#корпорации",
  war: "#война",
};

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

function chronologicalNews(items) {
  return [...items].sort((a, b) => {
    const dateDelta = new Date(`${a.date}T12:00:00`) - new Date(`${b.date}T12:00:00`);
    if (dateDelta !== 0) return dateDelta;
    return a.id.localeCompare(b.id);
  });
}

function tagsFor(newsItem) {
  return ["#ХанганДейли", CATEGORY_TAGS[newsItem.category]].filter(Boolean).join(" ");
}

function captionFor(newsItem) {
  const url = articleUrl(newsItem);
  const title = escapeHtml(newsItem.title);
  const summary = escapeHtml(newsItem.summary);
  const tags = tagsFor(newsItem);

  return `<b>${title}</b>\n\n${summary}\n\n<a href="${url}">Читать новость</a>\n\n${tags}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function publishedNewsIds() {
  const url = `${SITE_URL}/scripts/news.js?v=${Date.now()}`;
  const response = await fetch(url, {
    headers: {
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    },
  });

  if (!response.ok) {
    throw new Error(`Could not fetch published news: ${response.status} ${response.statusText}`);
  }

  const source = await response.text();
  return new Set(readNewsFromSource(source, url).news.map((item) => item.id));
}

async function waitForSitePublication(newsItems) {
  if (!WAIT_FOR_SITE || DRY_RUN || SEND_ALL) return;

  const expectedIds = newsItems.map((item) => item.id);
  if (!expectedIds.length) return;

  const deadline = Date.now() + SITE_WAIT_TIMEOUT_MS;
  let lastError = "";

  while (Date.now() < deadline) {
    try {
      const publishedIds = await publishedNewsIds();
      const missing = expectedIds.filter((id) => !publishedIds.has(id));

      if (!missing.length) {
        console.log(`Published site has news id(s): ${expectedIds.join(", ")}`);
        return;
      }

      lastError = `missing id(s): ${missing.join(", ")}`;
      console.log(`Waiting for GitHub Pages publication, ${lastError}`);
    } catch (error) {
      lastError = error.message;
      console.log(`Waiting for GitHub Pages publication, ${lastError}`);
    }

    await sleep(SITE_WAIT_INTERVAL_MS);
  }

  throw new Error(`Timed out waiting for GitHub Pages publication: ${lastError}`);
}

function truncateCaption(caption) {
  if (caption.length <= 1024) return caption;

  const tagStart = caption.lastIndexOf("\n\n#");
  const tags = tagStart === -1 ? "" : caption.slice(tagStart);
  const limit = 1024 - tags.length - 1;
  return `${caption.slice(0, Math.max(0, limit)).trim()}…${tags}`;
}

async function telegramRequest(method, payload, attempt = 1) {
  if (DRY_RUN) {
    console.log(JSON.stringify({ method, payload }, null, 2));
    return { ok: true };
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
  if (response.status === 429 && attempt <= 3) {
    const retryAfter = Number(result.parameters?.retry_after || 2);
    console.warn(`Telegram rate limit, retrying ${method} after ${retryAfter}s`);
    await sleep((retryAfter + 1) * 1000);
    return telegramRequest(method, payload, attempt + 1);
  }

  if (!response.ok || !result.ok) {
    throw new Error(`Telegram ${method} failed: ${JSON.stringify(result)}`);
  }

  return result;
}

async function sendNews(newsItem, images) {
  const image = images[newsItem.image];
  const payload = {
    chat_id: CHAT_ID,
    parse_mode: "HTML",
    disable_web_page_preview: false,
  };

  if (image?.url) {
    try {
      await telegramRequest("sendPhoto", {
        ...payload,
        photo: image.url,
        caption: truncateCaption(captionFor(newsItem)),
      });
      return;
    } catch (error) {
      console.warn(`sendPhoto failed for ${newsItem.id}, falling back to sendMessage: ${error.message}`);
    }
  }

  await telegramRequest("sendMessage", {
    ...payload,
    text: captionFor(newsItem),
  });
}

async function sendNewsBatch(newsItems, images) {
  const failures = [];

  for (const newsItem of newsItems) {
    console.log(`Sending Telegram notification: ${newsItem.title}`);
    try {
      await sendNews(newsItem, images);
    } catch (error) {
      failures.push({ id: newsItem.id, message: error.message });
      console.error(`Could not send ${newsItem.id}: ${error.message}`);
    }

    await sleep(1200);
  }

  if (failures.length) {
    throw new Error(`Failed to send ${failures.length} news item(s): ${JSON.stringify(failures)}`);
  }
}

async function main() {
  const current = readCurrentNews();
  const old = readOldNews();
  const oldIds = new Set(old.news.map((item) => item.id));
  let added = SEND_ALL ? chronologicalNews(current.news) : current.news.filter((item) => !oldIds.has(item.id));

  if (!added.length && FORCE_LATEST) {
    added = [current.getSortedNews(current.news)[0]].filter(Boolean);
  }

  added = SEND_ALL ? chronologicalNews(added) : current.getSortedNews(added);

  if (!added.length) {
    console.log("No new news to send.");
    return;
  }

  await waitForSitePublication(added);
  await sendNewsBatch(added, current.images);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
