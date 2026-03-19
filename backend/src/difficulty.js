const EASY_WORDS = [
  "introduction",
  "basics",
  "beginner",
  "simple",
  "overview",
  "fundamental"
];

const HARD_WORDS = [
  "optimization",
  "architecture",
  "asymptotic",
  "abstraction",
  "distributed",
  "concurrency",
  "probability",
  "advanced",
  "theorem"
];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function countSyllables(word) {
  const cleaned = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!cleaned) return 0;

  const vowelGroups = cleaned.match(/[aeiouy]+/g);
  let count = vowelGroups ? vowelGroups.length : 1;

  if (cleaned.endsWith("e")) {
    count -= 1;
  }

  return Math.max(1, count);
}

function estimateReadability(text) {
  const words = text.match(/[A-Za-z']+/g) || [];
  const sentences = text.split(/[.!?]+/).filter(Boolean);

  if (!words.length || !sentences.length) {
    return {
      grade: 8,
      difficultWordRatio: 0.25
    };
  }

  let syllableCount = 0;
  let difficultWords = 0;

  for (const word of words) {
    const syllables = countSyllables(word);
    syllableCount += syllables;
    if (syllables >= 3) {
      difficultWords += 1;
    }
  }

  const avgSentenceLength = words.length / sentences.length;
  const avgSyllablesPerWord = syllableCount / words.length;

  const grade =
    0.39 * avgSentenceLength + 11.8 * avgSyllablesPerWord - 15.59;

  const fleschReadingEase =
    206.835 - 1.015 * avgSentenceLength - 84.6 * avgSyllablesPerWord;

  return {
    grade: Number.isFinite(grade) ? grade : 8,
    difficultWordRatio: difficultWords / words.length,
    fleschReadingEase: Number.isFinite(fleschReadingEase)
      ? fleschReadingEase
      : 60
  };
}

function keywordComplexityBoost(text) {
  const normalized = text.toLowerCase();
  let boost = 0;

  for (const word of EASY_WORDS) {
    if (normalized.includes(word)) boost -= 0.4;
  }

  for (const word of HARD_WORDS) {
    if (normalized.includes(word)) boost += 0.7;
  }

  return boost;
}

function quantile(sortedValues, q) {
  if (!sortedValues.length) return 0;
  const position = (sortedValues.length - 1) * q;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);

  if (lower === upper) return sortedValues[lower];

  const weight = position - lower;
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

function scoreByThresholdBand(rawScore, beginnerUpper, advancedLower) {
  const safeBand = Math.max(advancedLower - beginnerUpper, 8);
  const relative = (rawScore - beginnerUpper) / safeBand;
  return clamp(1 + relative * 9, 1, 10);
}

export function calculateStudentAbilityScore(iq, eq) {
  return Number((0.7 * iq + 0.3 * eq).toFixed(2));
}

function normalizeScore(value, min = 50, max = 180) {
  const bounded = clamp(value, min, max);
  return (bounded - min) / (max - min);
}

export function calculateIqEqDifficulty(iq, eq) {
  const abilityScore = calculateStudentAbilityScore(iq, eq);

  const iqNorm = normalizeScore(iq);
  const eqNorm = normalizeScore(eq);
  const blendedNorm = 0.7 * iqNorm + 0.3 * eqNorm;

  // Penalize high IQ/EQ imbalance so recommendations stay realistically paced.
  const balancePenalty = Math.abs(iqNorm - eqNorm) * 0.6;
  const score = clamp(1 + (blendedNorm - balancePenalty) * 9, 1, 10);

  let label = "Moderate";
  if (score < 3.2) label = "Easy";
  if (score >= 5.8) label = "Hard";
  if (score >= 8.2) label = "Very Hard";

  return {
    score: Number(score.toFixed(2)),
    label,
    abilityScore,
    balanceGap: Number(Math.abs(iq - eq).toFixed(2))
  };
}

export function calculateDynamicCohortThresholds({
  rawScores,
  iq,
  eq
}) {
  const values = (rawScores || [])
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);

  const cognitive = calculateIqEqDifficulty(iq, eq);
  const cognitiveIndex = cognitive.score / 10;

  if (!values.length) {
    return {
      beginnerUpper: 30,
      advancedLower: 60,
      cohortMedian: 45,
      cohortIqr: 20,
      cognitiveShift: Number(((cognitiveIndex - 0.5) * 12).toFixed(2))
    };
  }

  const q1 = quantile(values, 0.25);
  const median = quantile(values, 0.5);
  const q3 = quantile(values, 0.75);
  const iqr = Math.max(1, q3 - q1);

  const spread = clamp(iqr * 0.65, 6, 18);
  const cognitiveShift = (cognitiveIndex - 0.5) * 12;

  let beginnerUpper = clamp(median - spread + cognitiveShift, 12, 55);
  let advancedLower = clamp(median + spread + cognitiveShift, 40, 88);

  if (advancedLower - beginnerUpper < 14) {
    const center = (advancedLower + beginnerUpper) / 2;
    beginnerUpper = clamp(center - 7, 12, 55);
    advancedLower = clamp(center + 7, 40, 88);
  }

  return {
    beginnerUpper: Number(beginnerUpper.toFixed(2)),
    advancedLower: Number(advancedLower.toFixed(2)),
    cohortMedian: Number(median.toFixed(2)),
    cohortIqr: Number(iqr.toFixed(2)),
    cognitiveShift: Number(cognitiveShift.toFixed(2))
  };
}

export function applyDynamicDifficultyProfile(difficulty, thresholds) {
  const rawScore = clamp(
    Number(difficulty?.baseScore ?? difficulty?.rawScore ?? 45),
    0,
    100
  );
  const beginnerUpper = Number(thresholds?.beginnerUpper ?? 30);
  const advancedLower = Number(thresholds?.advancedLower ?? 60);

  let label = "Intermediate";
  if (rawScore < beginnerUpper) label = "Beginner";
  if (rawScore > advancedLower) label = "Advanced";

  const score = scoreByThresholdBand(rawScore, beginnerUpper, advancedLower);

  return {
    ...difficulty,
    score: Number(score.toFixed(2)),
    label,
    rawScore: Number(rawScore.toFixed(2)),
    thresholds: {
      beginnerUpper,
      advancedLower
    }
  };
}

export function mapAbilityToTargetDifficulty(abilityScore) {
  if (abilityScore <= 85) return 2.5;
  if (abilityScore <= 100) return 4;
  if (abilityScore <= 115) return 5.5;
  if (abilityScore <= 130) return 7;
  return 8.5;
}

export function classifyDifficulty(transcriptText) {
  const readability = estimateReadability(transcriptText);
  const normalizedFlesch = clamp(readability.fleschReadingEase, 0, 100);
  const fleschDifficulty = 100 - normalizedFlesch;
  const lexicalSignal =
    keywordComplexityBoost(transcriptText) * 6 +
    readability.difficultWordRatio * 18 +
    (readability.grade - 8) * 1.2;
  const baseScore = clamp(fleschDifficulty + lexicalSignal, 0, 100);

  let label = "Intermediate";
  if (baseScore < 30) label = "Beginner";
  if (baseScore > 60) label = "Advanced";

  const score = clamp(baseScore / 10, 1, 10);

  return {
    score: Number(score.toFixed(2)),
    label,
    baseScore: Number(baseScore.toFixed(2)),
    rawScore: Number(baseScore.toFixed(2)),
    fleschDifficulty: Number(fleschDifficulty.toFixed(2)),
    fleschReadingEase: Number(readability.fleschReadingEase.toFixed(2)),
    readabilityGrade: Number(readability.grade.toFixed(2)),
    difficultWordRatio: Number(readability.difficultWordRatio.toFixed(2))
  };
}

export function calculateMatchScore({
  studentAbilityScore,
  difficultyScore,
  transcriptText,
  query
}) {
  return calculateMatchBreakdown({
    studentAbilityScore,
    difficultyScore,
    transcriptText,
    query
  }).finalScore;
}

export function calculateMatchBreakdown({
  studentAbilityScore,
  difficultyScore,
  transcriptText,
  query
}) {
  const target = mapAbilityToTargetDifficulty(studentAbilityScore);
  const closeness = Math.max(0, 1 - Math.abs(target - difficultyScore) / 10);

  const loweredTranscript = transcriptText.toLowerCase();
  const queryTokens = query
    .toLowerCase()
    .split(/\s+/)
    .filter((token) => token.length > 2);

  const queryHits = queryTokens.filter((token) =>
    loweredTranscript.includes(token)
  ).length;

  const semanticFit = queryTokens.length
    ? queryHits / queryTokens.length
    : 0.5;

  const finalScore = Number(((closeness * 0.65 + semanticFit * 0.35) * 100).toFixed(1));

  return {
    targetDifficulty: Number(target.toFixed(2)),
    closenessScore: Number((closeness * 100).toFixed(1)),
    semanticScore: Number((semanticFit * 100).toFixed(1)),
    finalScore
  };
}
