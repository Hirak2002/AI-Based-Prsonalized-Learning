import { getSubtitles } from "youtube-caption-extractor";

const SEARCH_TIMEOUT_MS = 5000;
const TRANSCRIPT_TIMEOUT_MS = 3500;
const MIN_TRANSCRIPT_CHARS = 120;
const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";

function withTimeout(promise, timeoutMs, fallbackValue = null) {
  return Promise.race([
    promise,
    new Promise((resolve) => {
      setTimeout(() => resolve(fallbackValue), timeoutMs);
    })
  ]);
}

async function fetchJsonWithTimeout(url, timeoutMs, fallbackValue) {
  try {
    const response = await withTimeout(fetch(url), timeoutMs, null);
    if (!response || !response.ok) {
      return fallbackValue;
    }
    return await response.json();
  } catch {
    return fallbackValue;
  }
}

function formatViewCount(viewCount) {
  if (!viewCount) return "0";
  const numeric = Number(viewCount);
  if (!Number.isFinite(numeric)) return String(viewCount);
  return numeric.toLocaleString("en-US");
}

function formatIso8601Duration(isoValue) {
  if (!isoValue || typeof isoValue !== "string") return "Unknown";

  const match = isoValue.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return "Unknown";

  const hours = Number(match[1] || 0);
  const minutes = Number(match[2] || 0);
  const seconds = Number(match[3] || 0);

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function normalizeDescription(description) {
  if (!description) return "";
  if (typeof description === "string") return description;
  if (Array.isArray(description)) {
    return description
      .map((part) => (typeof part === "string" ? part : part?.text || ""))
      .join(" ")
      .trim();
  }
  return "";
}

export async function searchYoutubeVideos(query, limit = 12) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return [];
  }

  const searchParams = new URLSearchParams({
    key: apiKey,
    part: "snippet",
    q: query,
    type: "video",
    maxResults: String(Math.max(limit, 5)),
    safeSearch: "none"
  });

  const searchResult = await fetchJsonWithTimeout(
    `${YOUTUBE_API_BASE}/search?${searchParams.toString()}`,
    SEARCH_TIMEOUT_MS,
    { items: [] }
  );

  if (!searchResult || !Array.isArray(searchResult.items) || !searchResult.items.length) {
    return [];
  }

  const videoIds = searchResult.items
    .map((item) => item.id?.videoId)
    .filter(Boolean)
    .slice(0, limit);

  if (!videoIds.length) {
    return [];
  }

  const detailsParams = new URLSearchParams({
    key: apiKey,
    part: "snippet,contentDetails,statistics",
    id: videoIds.join(",")
  });

  const detailsResult = await fetchJsonWithTimeout(
    `${YOUTUBE_API_BASE}/videos?${detailsParams.toString()}`,
    SEARCH_TIMEOUT_MS,
    { items: [] }
  );

  if (!detailsResult || !Array.isArray(detailsResult.items)) {
    return [];
  }

  return detailsResult.items.map((video) => ({
    videoId: video.id,
    title: video.snippet?.title || "Untitled",
    url: `https://www.youtube.com/watch?v=${video.id}`,
    duration: formatIso8601Duration(video.contentDetails?.duration),
    views: formatViewCount(video.statistics?.viewCount),
    author: video.snippet?.channelTitle || "Unknown",
    publishedAt: video.snippet?.publishedAt || "Unknown",
    summary: normalizeDescription(video.snippet?.description)
  }));
}

export async function fetchTranscriptForVideo(videoId) {
  try {
    const transcript = await withTimeout(
      getSubtitles({ videoID: videoId, lang: "en" }),
      TRANSCRIPT_TIMEOUT_MS,
      null
    );

    if (!Array.isArray(transcript) || !transcript.length) {
      return null;
    }

    const text = transcript.map((line) => line.text).join(" ").trim();

    if (!text || text.length < MIN_TRANSCRIPT_CHARS) {
      return null;
    }

    return text;
  } catch {
    return null;
  }
}
