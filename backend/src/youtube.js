import ytsr from "ytsr";
import { getSubtitles } from "youtube-caption-extractor";

const SEARCH_TIMEOUT_MS = 5000;
const TRANSCRIPT_TIMEOUT_MS = 3500;
const MIN_TRANSCRIPT_CHARS = 120;

function withTimeout(promise, timeoutMs, fallbackValue = null) {
  return Promise.race([
    promise,
    new Promise((resolve) => {
      setTimeout(() => resolve(fallbackValue), timeoutMs);
    })
  ]);
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
  const result = await withTimeout(
    ytsr(query, { limit: Math.max(limit * 2, 20) }),
    SEARCH_TIMEOUT_MS,
    { items: [] }
  );

  if (!result || !Array.isArray(result.items)) {
    return [];
  }

  const videos = result.items
    .filter((item) => item.type === "video" && item.id)
    .slice(0, limit);

  return videos.map((video) => ({
    videoId: video.id,
    title: video.title,
    url: video.url,
    duration: video.duration || "Unknown",
    views: video.views,
    author: video.author?.name || "Unknown",
    publishedAt: video.uploadedAt || "Unknown",
    summary: normalizeDescription(video.description)
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
