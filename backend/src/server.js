import express from "express";
import cors from "cors";
import {
  calculateMatchScore,
  calculateStudentAbilityScore,
  classifyDifficulty
} from "./difficulty.js";
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

app.use(cors());
app.use(express.json());

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "IQ Video Recommender API" });
});

app.post("/api/recommendations", async (req, res) => {
  try {
    const {
      studentName,
      iqScore,
      eqScore,
      topic,
      currentLevel,
      learningGoal,
      preferredDuration
    } = req.body;

    if (!iqScore || !eqScore || !topic || !learningGoal) {
      return res.status(400).json({
        message: "iqScore, eqScore, topic, and learningGoal are required."
      });
    }

    const iq = Number(iqScore);
    const eq = Number(eqScore);

    if (!isValidScore(iq)) {
      return res.status(400).json({
        message: `iqScore must be a number between ${MIN_SCORE} and ${MAX_SCORE}.`
      });
    }

    if (!isValidScore(eq)) {
      return res.status(400).json({
        message: `eqScore must be a number between ${MIN_SCORE} and ${MAX_SCORE}.`
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
      student: {
        name: studentName || "Student",
        iq,
        eq,
        abilityScore: studentAbilityScore,
        abilityFormula: "0.7 * IQ + 0.3 * EQ",
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
