import {
  calculateMatchBreakdown,
  calculateStudentAbilityScore,
  classifyDifficulty
} from "./difficulty.js";
import {
  fetchTranscriptForVideo,
  isVideoDurationMatch,
  searchYoutubeVideos
} from "./youtube.js";

const SEARCH_LIMIT = 24;
const ANALYSIS_LIMIT = 16;
const RECOMMENDATION_LIMIT = 8;

function buildFallbackText(video, topic, learningGoal, currentLevel) {
  return [video.title, video.summary, topic, learningGoal, currentLevel]
    .filter(Boolean)
    .join(". ");
}

function buildSearchQuery({ topic, learningGoal, currentLevel }) {
  return `${topic} ${learningGoal} ${currentLevel || ""}`.trim();
}

function toPipelineMeta(preferredDuration, candidates, analyzed) {
  return {
    name: "youtube-recommendation-pipeline",
    version: "v1",
    stages: [
      "validate-api-key",
      "fetch-youtube-videos",
      "fetch-transcripts",
      "nlp-difficulty-analysis",
      "ability-match-scoring",
      "rank-and-select"
    ],
    constraints: {
      preferredDuration: preferredDuration || "any",
      strictDurationFilter: (preferredDuration || "any") !== "any"
    },
    stats: {
      fetchedCandidates: candidates.length,
      analyzedCandidates: analyzed.length
    }
  };
}

export async function runRecommendationPipeline({
  studentName,
  topic,
  currentLevel,
  learningGoal,
  preferredDuration,
  assessment
}) {
  if (!process.env.YOUTUBE_API_KEY) {
    const error = new Error("Missing YOUTUBE_API_KEY. Add it before requesting recommendations.");
    error.code = "MISSING_YOUTUBE_API_KEY";
    throw error;
  }

  const iq = assessment.iqScore;
  const eq = assessment.eqScore;
  const studentAbilityScore = calculateStudentAbilityScore(iq, eq);

  const query = buildSearchQuery({ topic, learningGoal, currentLevel });
  const candidates = await searchYoutubeVideos(query, {
    limit: SEARCH_LIMIT,
    preferredDuration
  });

  const analyzedRaw = await Promise.all(
    candidates.slice(0, ANALYSIS_LIMIT).map(async (video) => {
      const transcript = await fetchTranscriptForVideo(video.videoId);
      const analysisText = transcript || buildFallbackText(video, topic, learningGoal, currentLevel);
      if (!analysisText) return null;

      const difficulty = classifyDifficulty(analysisText);
      const score = calculateMatchBreakdown({
        studentAbilityScore,
        difficultyScore: difficulty.score,
        transcriptText: analysisText,
        query
      });

      return {
        ...video,
        transcriptSnippet: analysisText.slice(0, 240) + "...",
        analysisSource: transcript ? "transcript" : "metadata-fallback",
        difficulty,
        matchScore: score.finalScore,
        scoreBreakdown: score
      };
    })
  );

  const analyzed = analyzedRaw
    .filter(Boolean)
    .filter((item) => isVideoDurationMatch(preferredDuration, item.durationSeconds));

  const recommendations = analyzed
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, RECOMMENDATION_LIMIT);

  return {
    youtubeApiConfigured: true,
    searchProvider: "youtube-data-api-v3",
    pipeline: toPipelineMeta(preferredDuration, candidates, analyzed),
    student: {
      name: studentName || "Student",
      iq,
      eq,
      abilityScore: studentAbilityScore,
      abilityFormula: "0.7 * IQ + 0.3 * EQ",
      assessment,
      topic,
      currentLevel,
      learningGoal
    },
    flowchart: {
      difficultyMethod: "NLP Difficulty Analysis (Readability + keyword semantics)",
      matchingRule: "Pipeline ranking: Ability-Difficulty Alignment + Semantic Match"
    },
    searchQuery: query,
    totalCandidates: candidates.length,
    analyzedWithTranscript: analyzed.length,
    recommendations
  };
}
