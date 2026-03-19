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

function calculateMean(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function calculateStdDev(values, mean) {
  if (!values.length) return 0;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    values.length;
  return Math.sqrt(variance);
}

function percentileRank(values, target) {
  if (!values.length) return 50;
  const belowOrEqual = values.filter((value) => value <= target).length;
  return (belowOrEqual / values.length) * 100;
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

  const cohortScoreMean = values.length ? calculateMean(values) : 45;
  const cohortScoreStd = values.length ? calculateStdDev(values, cohortScoreMean) : 12;
  const entropyFactor = clamp(
    cohortScoreMean > 0 ? cohortScoreStd / cohortScoreMean : 0,
    0,
    0.95
  );

  // Baseline psychometric cohort references when no class-level IQ/EQ history is available.
  const cohortMeanIq = 100;
  const cohortSdIq = 15;
  const cohortMeanEq = 100;
  const cohortSdEq = 15;

  const iqNorm = (iq - cohortMeanIq) / cohortSdIq;
  const eqNorm = (eq - cohortMeanEq) / cohortSdEq;
  const cognitiveFit = ((iqNorm * 0.6 + eqNorm * 0.4) / 2);

  const abilityScore = calculateStudentAbilityScore(iq, eq);
  const userCognitiveScore = clamp(((abilityScore - 50) / 130) * 100, 0, 100);
  const percentile = percentileRank(values, userCognitiveScore);
  const dcrt = clamp((percentile / 100) * (1 - entropyFactor), 0, 1);

  if (!values.length) {
    const beginnerUpperFallback = 30;
    const advancedLowerFallback = 60;

    return {
      beginnerUpper: beginnerUpperFallback,
      advancedLower: advancedLowerFallback,
      cohortMedian: 45,
      cohortIqr: 20,
      dcrt: Number(dcrt.toFixed(4)),
      entropyFactor: Number(entropyFactor.toFixed(4)),
      cognitiveFit: Number(cognitiveFit.toFixed(4)),
      iqNorm: Number(iqNorm.toFixed(4)),
      eqNorm: Number(eqNorm.toFixed(4)),
      userCognitiveScore: Number(userCognitiveScore.toFixed(2)),
      cohortMeanScore: Number(cohortScoreMean.toFixed(2)),
      cohortStdScore: Number(cohortScoreStd.toFixed(2))
    };
  }

  const q1 = quantile(values, 0.25);
  const median = quantile(values, 0.5);
  const q3 = quantile(values, 0.75);
  const iqr = Math.max(1, q3 - q1);

  const spread = clamp(iqr * 0.75, 8, 20);
  const adaptiveShift = clamp(dcrt * cognitiveFit * 20, -10, 10);

  let beginnerUpper = clamp(median - spread + adaptiveShift, 12, 55);
  let advancedLower = clamp(median + spread + adaptiveShift, 40, 88);

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
    dcrt: Number(dcrt.toFixed(4)),
    entropyFactor: Number(entropyFactor.toFixed(4)),
    cognitiveFit: Number(cognitiveFit.toFixed(4)),
    iqNorm: Number(iqNorm.toFixed(4)),
    eqNorm: Number(eqNorm.toFixed(4)),
    userCognitiveScore: Number(userCognitiveScore.toFixed(2)),
    cohortMeanScore: Number(cohortScoreMean.toFixed(2)),
    cohortStdScore: Number(cohortScoreStd.toFixed(2)),
    adaptiveShift: Number(adaptiveShift.toFixed(2))
  };
}

export function applyDynamicDifficultyProfile(difficulty, thresholds) {
  const fre = clamp(Number(difficulty?.fleschReadingEase ?? 60), 0, 100);
  const dcrt = clamp(Number(thresholds?.dcrt ?? 0), 0, 1);
  const cognitiveFit = Number(thresholds?.cognitiveFit ?? 0);
  const adaptationFactor = Math.max(0.2, 1 + dcrt * cognitiveFit);
  const cadsRaw = (100 - fre) * adaptationFactor;
  const rawScore = clamp(Number(cadsRaw), 0, 140);

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
    cadsRaw: Number(cadsRaw.toFixed(2)),
    adaptationFactor: Number(adaptationFactor.toFixed(4)),
    thresholds: {
      beginnerUpper,
      advancedLower,
      dcrt: Number(dcrt.toFixed(4)),
      cognitiveFit: Number(cognitiveFit.toFixed(4))
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
  const baseScore = clamp(fleschDifficulty, 0, 100);

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
