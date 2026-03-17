import { randomUUID } from "node:crypto";

const ASSESSMENT_TTL_MS = 30 * 60 * 1000;
const assessments = new Map();

function cleanupExpiredAssessments() {
  const now = Date.now();
  for (const [id, value] of assessments) {
    if (now - value.createdAt > ASSESSMENT_TTL_MS) {
      assessments.delete(id);
    }
  }
}

function withContext(text, topic, goal, level) {
  return text
    .replaceAll("{topic}", topic)
    .replaceAll("{goal}", goal)
    .replaceAll("{level}", level);
}

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function pickRandom(items, count) {
  return shuffle(items).slice(0, Math.max(0, Math.min(count, items.length)));
}

function buildIqQuestions(topic, goal, level) {
  return [
    {
      id: "iq-1",
      dimension: "IQ",
      prompt: withContext(
        "For mastering {topic} at {level} level, which sequence follows the same rule as 3, 6, 12, 24, ?",
        topic,
        goal,
        level
      ),
      options: [
        { id: "a", text: "28" },
        { id: "b", text: "36" },
        { id: "c", text: "48" },
        { id: "d", text: "60" }
      ],
      correctOptionId: "c",
      weight: 1.1
    },
    {
      id: "iq-2",
      dimension: "IQ",
      prompt: withContext(
        "If all students preparing for {goal} solve mock tests, and Riya solves mock tests, what is the most logical conclusion?",
        topic,
        goal,
        level
      ),
      options: [
        { id: "a", text: "Riya may not be preparing for {goal}" },
        { id: "b", text: "Riya is preparing for {goal}" },
        { id: "c", text: "No conclusion can be drawn" },
        { id: "d", text: "Riya has completed preparation" }
      ].map((o) => ({ ...o, text: withContext(o.text, topic, goal, level) })),
      correctOptionId: "b",
      weight: 1.0
    },
    {
      id: "iq-3",
      dimension: "IQ",
      prompt: withContext(
        "You have 4 hours and 5 chapters of {topic}. Chapter A takes twice as long as each of the other chapters. How many equal units should each non-A chapter get if all chapters must finish?",
        topic,
        goal,
        level
      ),
      options: [
        { id: "a", text: "0.5 units" },
        { id: "b", text: "0.67 units" },
        { id: "c", text: "0.8 units" },
        { id: "d", text: "1 unit" }
      ],
      correctOptionId: "b",
      weight: 1.2
    },
    {
      id: "iq-4",
      dimension: "IQ",
      prompt: withContext(
        "Which strategy gives the highest information gain first while revising {topic} for {goal}?",
        topic,
        goal,
        level
      ),
      options: [
        { id: "a", text: "Revise strongest chapter repeatedly" },
        { id: "b", text: "Randomly switch topics every 10 minutes" },
        { id: "c", text: "Prioritize high-weight weak concepts first" },
        { id: "d", text: "Read only solved examples" }
      ],
      correctOptionId: "c",
      weight: 1.0
    },
    {
      id: "iq-5",
      dimension: "IQ",
      prompt: withContext(
        "If your test accuracy on {topic} rises from 40% to 55%, then to 70%, what is the average percentage-point improvement per step?",
        topic,
        goal,
        level
      ),
      options: [
        { id: "a", text: "10" },
        { id: "b", text: "12.5" },
        { id: "c", text: "15" },
        { id: "d", text: "20" }
      ],
      correctOptionId: "c",
      weight: 1.1
    },
    {
      id: "iq-6",
      dimension: "IQ",
      prompt: withContext(
        "In a {topic} schedule, if task X takes 30% of total time and task Y takes 20%, how much time is left for all other tasks?",
        topic,
        goal,
        level
      ),
      options: [
        { id: "a", text: "40%" },
        { id: "b", text: "50%" },
        { id: "c", text: "60%" },
        { id: "d", text: "70%" }
      ],
      correctOptionId: "b",
      weight: 1.0
    },
    {
      id: "iq-7",
      dimension: "IQ",
      prompt: withContext(
        "Which option best shows root-cause thinking after a wrong answer in {topic}?",
        topic,
        goal,
        level
      ),
      options: [
        { id: "a", text: "Memorize the final answer only" },
        { id: "b", text: "Skip this type forever" },
        { id: "c", text: "Identify concept gap and retry a similar problem" },
        { id: "d", text: "Increase speed without reviewing logic" }
      ],
      correctOptionId: "c",
      weight: 1.1
    }
  ];
}

function buildEqQuestions(topic, goal, level) {
  return [
    {
      id: "eq-1",
      dimension: "EQ",
      prompt: withContext(
        "One week before {goal}, your score drops badly in {topic}. What is your best response?",
        topic,
        goal,
        level
      ),
      options: [
        { id: "a", text: "Panic and stop attempting tests" },
        { id: "b", text: "Blame external factors and postpone" },
        { id: "c", text: "Review errors calmly and adjust study plan" },
        { id: "d", text: "Ignore the result completely" }
      ],
      optionScores: { a: 0, b: 0.2, c: 1, d: 0.3 }
    },
    {
      id: "eq-2",
      dimension: "EQ",
      prompt: withContext(
        "Your peer solves {topic} faster than you. What is the healthiest action?",
        topic,
        goal,
        level
      ),
      options: [
        { id: "a", text: "Compare constantly and lose focus" },
        { id: "b", text: "Ask their method and adopt what fits you" },
        { id: "c", text: "Avoid discussing preparation" },
        { id: "d", text: "Assume you cannot improve" }
      ],
      optionScores: { a: 0.1, b: 1, c: 0.4, d: 0 }
    },
    {
      id: "eq-3",
      dimension: "EQ",
      prompt: withContext(
        "During high pressure for {goal}, what keeps consistency highest?",
        topic,
        goal,
        level
      ),
      options: [
        { id: "a", text: "Irregular long study bursts only" },
        { id: "b", text: "Daily focused blocks with reflection" },
        { id: "c", text: "Study only when mood is perfect" },
        { id: "d", text: "Avoid breaks entirely" }
      ],
      optionScores: { a: 0.2, b: 1, c: 0.1, d: 0 }
    },
    {
      id: "eq-4",
      dimension: "EQ",
      prompt: withContext(
        "You miss your {topic} target for two days. What response is most constructive?",
        topic,
        goal,
        level
      ),
      options: [
        { id: "a", text: "Quit the plan for this week" },
        { id: "b", text: "Review what blocked you and reset tomorrow's target" },
        { id: "c", text: "Double workload immediately without planning" },
        { id: "d", text: "Ignore the gap and continue randomly" }
      ],
      optionScores: { a: 0, b: 1, c: 0.3, d: 0.2 }
    },
    {
      id: "eq-5",
      dimension: "EQ",
      prompt: withContext(
        "Before a major {goal} test, what is the best emotional regulation strategy?",
        topic,
        goal,
        level
      ),
      options: [
        { id: "a", text: "Scroll social media until stress disappears" },
        { id: "b", text: "Use brief breathing + focused revision checklist" },
        { id: "c", text: "Study nonstop without breaks" },
        { id: "d", text: "Avoid all practice tests" }
      ],
      optionScores: { a: 0.2, b: 1, c: 0.3, d: 0.1 }
    }
  ];
}

function sanitizeQuestion(question) {
  return {
    id: question.id,
    dimension: question.dimension,
    prompt: question.prompt,
    options: question.options
  };
}

export function createAssessment({ topic, learningGoal, currentLevel }) {
  cleanupExpiredAssessments();

  const iqQuestions = buildIqQuestions(topic, learningGoal, currentLevel);
  const eqQuestions = buildEqQuestions(topic, learningGoal, currentLevel);

  const selectedIq = pickRandom(iqQuestions, 3);
  const selectedEq = pickRandom(eqQuestions, 2);
  const questions = shuffle([...selectedIq, ...selectedEq]);

  const assessmentId = randomUUID();
  assessments.set(assessmentId, {
    createdAt: Date.now(),
    questions
  });

  return {
    assessmentId,
    source: "ai-generated-assessment",
    questions: questions.map(sanitizeQuestion)
  };
}

function scoreToRange(ratio, min, max) {
  return Math.round(min + ratio * (max - min));
}

export function evaluateAssessment(assessmentId, responses) {
  cleanupExpiredAssessments();

  const session = assessments.get(assessmentId);
  if (!session) {
    throw new Error("Assessment expired or invalid. Generate questions again.");
  }

  const responseMap = new Map(
    (responses || []).map((item) => [item.questionId, item.optionId])
  );

  let iqEarned = 0;
  let iqTotal = 0;
  let eqEarned = 0;
  let eqTotal = 0;
  let answeredCount = 0;

  for (const question of session.questions) {
    const answer = responseMap.get(question.id);
    if (!answer) continue;

    answeredCount += 1;

    if (question.dimension === "IQ") {
      iqTotal += question.weight;
      if (answer === question.correctOptionId) {
        iqEarned += question.weight;
      }
      continue;
    }

    const scores = question.optionScores || {};
    const maxScore = Math.max(...Object.values(scores), 1);
    eqTotal += maxScore;
    eqEarned += scores[answer] || 0;
  }

  const iqRatio = iqTotal ? iqEarned / iqTotal : 0.5;
  const eqRatio = eqTotal ? eqEarned / eqTotal : 0.5;

  const iqScore = scoreToRange(iqRatio, 80, 145);
  const eqScore = scoreToRange(eqRatio, 75, 140);

  const totalQuestions = session.questions.length;
  const completionRatio = totalQuestions ? answeredCount / totalQuestions : 0;

  return {
    iqScore,
    eqScore,
    completionRatio: Number(completionRatio.toFixed(2)),
    answeredCount,
    totalQuestions,
    assessmentSource: "ai-generated-assessment"
  };
}
