#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const https = require("https");

const DEFAULT_FOLDER_ID = "193860";
const DEFAULT_OUTPUT = path.resolve(__dirname, "..", "app", "vocab-data.json");
const CACHE_ROOT = path.resolve(__dirname, "..", "tmp", "classcard-cache");
const CONCURRENCY = 4;

function parseArgs(argv) {
  const options = {
    folderId: DEFAULT_FOLDER_ID,
    output: DEFAULT_OUTPUT,
    refresh: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--folder" || arg === "--folder-id") {
      options.folderId = argv[index + 1];
      index += 1;
    } else if (arg === "--out") {
      options.output = path.resolve(argv[index + 1]);
      index += 1;
    } else if (arg === "--refresh") {
      options.refresh = true;
    } else if (/^\d+$/.test(arg)) {
      options.folderId = arg;
    }
  }

  return options;
}

function ensureDir(targetPath) {
  fs.mkdirSync(targetPath, { recursive: true });
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, num) => String.fromCodePoint(parseInt(num, 10)));
}

function stripTags(value) {
  return decodeHtml(value)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function request(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
          accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "accept-language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
        },
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          res.resume();
          return;
        }

        let data = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => resolve(data));
      }
    );

    req.setTimeout(30000, () => {
      req.destroy(new Error(`Timeout for ${url}`));
    });
    req.on("error", reject);
  });
}

async function fetchWithRetry(url, retries = 3) {
  let lastError = null;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      return await request(url);
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    }
  }

  throw lastError;
}

async function fetchCached(url, cachePath, refresh) {
  if (!refresh && fs.existsSync(cachePath)) {
    return fs.readFileSync(cachePath, "utf8");
  }

  const html = await fetchWithRetry(url);
  ensureDir(path.dirname(cachePath));
  fs.writeFileSync(cachePath, html, "utf8");
  return html;
}

function extractFolderTitle(html, fallbackFolderId) {
  const match = html.match(/<meta property="og:title" content="([^"]+)"/i);
  return match ? decodeHtml(match[1]).trim() : `Folder ${fallbackFolderId}`;
}

function extractSetLinks(html) {
  const matches = [
    ...html.matchAll(
      /href="\/set\/(\d+)"[\s\S]*?<span class="set-name-copy-text">([\s\S]*?)<\/span>[\s\S]*?<span class="text-gray[^"]*">(\d+)\s*카드<\/span>/g
    ),
  ];

  const seen = new Set();

  return matches
    .map((match) => ({
      id: match[1],
      title: stripTags(match[2]),
      cardCount: Number(match[3]),
    }))
    .filter((item) => {
      if (seen.has(item.id)) {
        return false;
      }

      seen.add(item.id);
      return true;
    });
}

function extractCards(setHtml) {
  const cards = [];
  const cardRegex =
    /<div class="flip-card[^"]*" data-idx="(\d+)">[\s\S]*?<div class="flip-card-front">[\s\S]*?<div class="font-bold">\s*([\s\S]*?)\s*<\/div>[\s\S]*?(?:<a class="btn-audio" data-src="([^"]+)")?[\s\S]*?<div class="flip-card-back">[\s\S]*?<div class=""[^>]*>\s*([\s\S]*?)\s*<\/div>/g;

  for (const match of setHtml.matchAll(cardRegex)) {
    const [, cardId, rawWord, audioUrl = "", rawMeaning] = match;
    const word = stripTags(rawWord);
    const meaning = stripTags(rawMeaning);

    if (!word || !meaning) {
      continue;
    }

    cards.push({
      id: cardId,
      word,
      meaning,
      audioUrl: audioUrl || null,
    });
  }

  return cards;
}

function getSetKind(title) {
  if (/review/i.test(title)) {
    return "review";
  }

  if (/DAY\s+\d{2}$/i.test(title)) {
    return "single";
  }

  if (/DAY\s+\d{2}-\d{2}$/i.test(title)) {
    return "range";
  }

  return "other";
}

async function mapLimit(items, limit, iteratee) {
  const results = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const currentIndex = cursor;
      cursor += 1;
      results[currentIndex] = await iteratee(items[currentIndex], currentIndex);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const folderUrl = `https://www.classcard.net/folder/${options.folderId}`;
  const folderCache = path.join(CACHE_ROOT, options.folderId, "folder.html");

  console.log(`Fetching folder ${options.folderId}...`);
  const folderHtml = await fetchCached(folderUrl, folderCache, options.refresh);
  const folderTitle = extractFolderTitle(folderHtml, options.folderId);
  const setLinks = extractSetLinks(folderHtml);

  if (!setLinks.length) {
    throw new Error("No sets found in the folder page.");
  }

  console.log(`Found ${setLinks.length} sets in "${folderTitle}".`);

  const sets = await mapLimit(setLinks, CONCURRENCY, async (setItem, index) => {
    const setUrl = `https://www.classcard.net/set/${setItem.id}`;
    const cachePath = path.join(CACHE_ROOT, options.folderId, "sets", `${setItem.id}.html`);
    const setHtml = await fetchCached(setUrl, cachePath, options.refresh);
    const cards = extractCards(setHtml);

    console.log(`[${index + 1}/${setLinks.length}] ${setItem.title} -> ${cards.length} cards`);

    return {
      id: setItem.id,
      title: setItem.title,
      cardCount: cards.length || setItem.cardCount,
      kind: getSetKind(setItem.title),
      isReview: /review/i.test(setItem.title),
      previewWords: cards.slice(0, 3).map((card) => card.word),
      cards,
    };
  });

  const totalCards = sets.reduce((sum, setItem) => sum + setItem.cardCount, 0);
  const now = new Date();
  const summary = {
    single: sets.filter((setItem) => setItem.kind === "single").length,
    range: sets.filter((setItem) => setItem.kind === "range").length,
    review: sets.filter((setItem) => setItem.kind === "review").length,
    other: sets.filter((setItem) => setItem.kind === "other").length,
  };

  const output = {
    folderId: options.folderId,
    folderUrl,
    folderTitle,
    scrapedAt: now.toISOString(),
    scrapedAtLabel: new Intl.DateTimeFormat("ko-KR", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(now),
    totalSets: sets.length,
    totalCards,
    summary,
    sets,
  };

  ensureDir(path.dirname(options.output));
  fs.writeFileSync(options.output, JSON.stringify(output, null, 2), "utf8");
  console.log(`Saved ${totalCards} cards to ${options.output}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
