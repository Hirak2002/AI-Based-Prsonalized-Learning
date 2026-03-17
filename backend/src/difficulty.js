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

export function calculateStudentAbilityScore(iq, eq) {
  return Number((0.7 * iq + 0.3 * eq).toFixed(2));
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
  const baseDifficulty = (100 - normalizedFlesch) / 10;
  const score = clamp(
    baseDifficulty + keywordComplexityBoost(transcriptText),
    1,
    10
  );

  let label = "Intermediate";
  if (score < 3.8) label = "Beginner";
  if (score > 7.2) label = "Advanced";

  return {
    score: Number(score.toFixed(2)),
    label,
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

  const finalScore = closeness * 0.65 + semanticFit * 0.35;
  return Number((finalScore * 100).toFixed(1));
}
