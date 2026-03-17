import "dotenv/config";
import express from "express";
import cors from "cors";
import { createAssessment, evaluateAssessment } from "./assessment.js";
import { runRecommendationPipeline } from "./pipeline.js";

const app = express();
const PORT = process.env.PORT || 4000;
const MIN_SCORE = 50;
const MAX_SCORE = 180;

function isValidScore(value) {
  return Number.isFinite(value) && value >= MIN_SCORE && value <= MAX_SCORE;
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

    const recommendationResponse = await runRecommendationPipeline({
      studentName,
      topic,
      currentLevel,
      learningGoal,
      preferredDuration,
      assessment: assessmentResult
    });

    return res.json(recommendationResponse);
  } catch (error) {
    if (
      typeof error.message === "string" &&
      error.message.includes("Assessment expired or invalid")
    ) {
      return res.status(400).json({
        message: error.message
      });
    }

    if (error.code === "MISSING_YOUTUBE_API_KEY") {
      return res.status(500).json({
        message: error.message,
        youtubeApiConfigured: false,
        searchProvider: "youtube-data-api-v3"
      });
    }

    return res.status(500).json({
      message: error.message || "Could not generate recommendations right now.",
      error: error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`API running at http://localhost:${PORT}`);
});
