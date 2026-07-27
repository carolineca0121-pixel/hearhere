/**
 * 通过 Wikipedia API 获取地点的真实照片 URL。
 * 先搜索匹配页面，再提取页面缩略图。完全免费，无需 API key。
 */

const WIKI_API = "https://zh.wikipedia.org/w/api.php";
const WIKI_API_EN = "https://en.wikipedia.org/w/api.php";

interface WikiSearchResult {
  query?: {
    search?: Array<{ title: string }>;
  };
}

interface WikiImageResult {
  query?: {
    pages?: Record<string, {
      title: string;
      thumbnail?: { source: string; width: number; height: number };
    }>;
  };
}

async function wikiSearch(title: string, api: string): Promise<string | null> {
  const url = new URL(api);
  url.searchParams.set("action", "query");
  url.searchParams.set("list", "search");
  url.searchParams.set("srsearch", title);
  url.searchParams.set("format", "json");
  url.searchParams.set("srlimit", "1");
  url.searchParams.set("origin", "*");

  try {
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const data = (await res.json()) as WikiSearchResult;
    return data.query?.search?.[0]?.title ?? null;
  } catch {
    return null;
  }
}

async function wikiImage(title: string, api: string): Promise<string | null> {
  const url = new URL(api);
  url.searchParams.set("action", "query");
  url.searchParams.set("titles", title);
  url.searchParams.set("prop", "pageimages");
  url.searchParams.set("format", "json");
  url.searchParams.set("pithumbsize", "800");
  url.searchParams.set("origin", "*");

  try {
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const data = (await res.json()) as WikiImageResult;
    const pages = data.query?.pages ?? {};
    for (const key of Object.keys(pages)) {
      const thumb = pages[key].thumbnail;
      if (thumb?.source) return thumb.source;
    }
    return null;
  } catch {
    return null;
  }
}

export async function fetchWikipediaImage(title: string): Promise<string | null> {
  if (!title?.trim()) return null;

  // 先搜中文 Wikipedia
  let matched = await wikiSearch(title, WIKI_API);
  if (matched) {
    const img = await wikiImage(matched, WIKI_API);
    if (img) return img;
  }

  // 中文没有，试英文
  matched = await wikiSearch(title, WIKI_API_EN);
  if (matched) {
    const img = await wikiImage(matched, WIKI_API_EN);
    if (img) return img;
  }

  return null;
}
