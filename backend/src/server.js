import "dotenv/config";
import express from "express";
import cors from "cors";
import {
  calculateMatchScore,
  calculateStudentAbilityScore,
  classifyDifficulty
} from "./difficulty.js";
import { createAssessment, evaluateAssessment } from "./assessment.js";
import { fetchTranscriptForVideo, searchYoutubeVideos } from "./youtube.js";

const app = express();
const PORT = process.env.PORT || 4000;
const SEARCH_LIMIT = 10;
const ANALYSIS_LIMIT = 8;
const MIN_SCORE = 50;
const MAX_SCORE = 180;

function isValidScore(value) {
  return Number.isFinite(value) && value >= MIN_SCORE && value <= MAX_SCORE;
}

function getDurationPenalty(preferredDuration, durationText, baseScore) {
  if (!preferredDuration || preferredDuration === "any") {
    return baseScore;
  }

  const isLikelyLong =
    durationText.includes("1:") || durationText.length > 5;
  const isLikelyShort = durationText.length <= 5;

  const mismatch =
    (preferredDuration === "short" && isLikelyLong) ||
    (preferredDuration === "long" && isLikelyShort);

  return mismatch ? Math.max(0, baseScore - 8) : baseScore;
}

function buildFallbackText(video, topic, learningGoal, currentLevel) {
  return [video.title, video.summary, topic, learningGoal, currentLevel]
    .filter(Boolean)
    .join(". ");
}

function parseAssessmentResponses(rawResponses) {
  if (!Array.isArray(rawResponses)) return [];

  return rawResponses
    .map((item) => ({
      questionId: item?.questionId,
      optionId: item?.optionId
    }))
    .filter((item) => item.questionId && item.optionId);
}

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "IQ Video Recommender API",
    youtubeApiConfigured: Boolean(process.env.YOUTUBE_API_KEY),
    searchProvider: "youtube-data-api-v3"
  });
});

app.post("/api/assessment/questions", (req, res) => {
  const { topic, learningGoal, currentLevel } = req.body;

  if (!topic || !learningGoal) {
    return res.status(400).json({
      message: "topic and learningGoal are required to generate assessment questions."
    });
  }

  const assessment = createAssessment({
    topic,
    learningGoal,
    currentLevel: currentLevel || "Beginner"
  });

  return res.json({
    ...assessment,
    instructions:
      "Answer all questions. IQ and EQ scores will be calculated automatically from your responses."
  });
});

app.post("/api/recommendations", async (req, res) => {
  try {
    if (!process.env.YOUTUBE_API_KEY) {
      return res.status(500).json({
        message: "Missing YOUTUBE_API_KEY. Add it before requesting recommendations.",
        youtubeApiConfigured: false,
        searchProvider: "youtube-data-api-v3"
      });
    }

    const {
      studentName,
      assessmentId,
      assessmentResponses,
      topic,
      currentLevel,
      learningGoal,
      preferredDuration
    } = req.body;

    if (!assessmentId || !topic || !learningGoal) {
      return res.status(400).json({
        message: "assessmentId, topic, and learningGoal are required."
      });
    }

    const responses = parseAssessmentResponses(assessmentResponses);
    const assessmentResult = evaluateAssessment(assessmentId, responses);
    const iq = assessmentResult.iqScore;
    const eq = assessmentResult.eqScore;

    if (!isValidScore(iq) || !isValidScore(eq)) {
      return res.status(400).json({
        message: "Computed IQ/EQ scores are out of expected range. Retake assessment."
      });
    }

    const studentAbilityScore = calculateStudentAbilityScore(iq, eq);

    const query = `${topic} ${learningGoal} ${currentLevel || ""}`.trim();
    const candidates = await searchYoutubeVideos(query, SEARCH_LIMIT);

    const analyzed = await Promise.all(
      candidates.slice(0, ANALYSIS_LIMIT).map(async (video) => {
        const transcript = await fetchTranscriptForVideo(video.videoId);
        const analysisText =
          transcript ||
          buildFallbackText(video, topic, learningGoal, currentLevel);
        if (!analysisText) return null;

        const difficulty = classifyDifficulty(analysisText);
        const baseMatchScore = calculateMatchScore({
          studentAbilityScore,
          difficultyScore: difficulty.score,
          transcriptText: analysisText,
          query
        });

        const matchScore = getDurationPenalty(
          preferredDuration,
          video.duration,
          baseMatchScore
        );

        return {
          ...video,
          transcriptSnippet: analysisText.slice(0, 240) + "...",
          analysisSource: transcript ? "transcript" : "metadata-fallback",
          difficulty,
          matchScore
        };
      })
    );

    const enriched = analyzed.filter(Boolean);

    const recommendations = enriched
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, 8);

    return res.json({
      youtubeApiConfigured: true,
      searchProvider: "youtube-data-api-v3",
      student: {
        name: studentName || "Student",
        iq,
        eq,
        abilityScore: studentAbilityScore,
        abilityFormula: "0.7 * IQ + 0.3 * EQ",
        assessment: assessmentResult,
        topic,
        currentLevel,
        learningGoal
      },
      flowchart: {
        difficultyMethod: "NLP Difficulty Analysis (Flesch Reading Ease Score)",
        matchingRule: "Match Student Ability With Video Difficulty"
      },
      searchQuery: query,
      totalCandidates: candidates.length,
      analyzedWithTranscript: enriched.length,
      recommendations
    });
  } catch (error) {
    return res.status(500).json({
      message: "Could not generate recommendations right now.",
      error: error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`API running at http://localhost:${PORT}`);
});
