import { useEffect, useMemo, useState } from 'react'
import './App.css'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000'

const initialForm = {
  studentName: '',
  topic: '',
  currentLevel: 'Beginner',
  learningGoal: '',
  preferredDuration: 'any',
}

function App() {
  const [form, setForm] = useState(initialForm)
  const [loading, setLoading] = useState(false)
  const [questionLoading, setQuestionLoading] = useState(false)
  const [error, setError] = useState('')
  const [response, setResponse] = useState(null)
  const [assessment, setAssessment] = useState({
    assessmentId: '',
    source: '',
    questions: [],
    answers: {},
  })
  const [apiStatus, setApiStatus] = useState({
    loading: true,
    configured: false,
    provider: 'unknown',
  })

  const headline = useMemo(() => {
    if (!response) return 'Your Personalized Learning Matchmaker'
    return `Top Recommendations for ${response.student.name}`
  }, [response])

  const sourceSummary = useMemo(() => {
    const items = response?.recommendations || []
    const transcript = items.filter((item) => item.analysisSource === 'transcript').length
    const fallback = items.filter((item) => item.analysisSource === 'metadata-fallback').length
    return { transcript, fallback, total: items.length }
  }, [response])

  const answeredQuestions = useMemo(
    () => Object.keys(assessment.answers).length,
    [assessment.answers],
  )

  useEffect(() => {
    let mounted = true

    const loadHealth = async () => {
      try {
        const result = await fetch(`${API_BASE}/api/health`)
        const data = await result.json()

        if (!mounted) return

        setApiStatus({
          loading: false,
          configured: Boolean(data.youtubeApiConfigured),
          provider: data.searchProvider || 'unknown',
        })
      } catch {
        if (!mounted) return

        setApiStatus({
          loading: false,
          configured: false,
          provider: 'unreachable',
        })
      }
    }

    loadHealth()

    return () => {
      mounted = false
    }
  }, [])

  const handleChange = (event) => {
    const { name, value } = event.target
    setForm((prev) => ({ ...prev, [name]: value }))

    if (name === 'topic' || name === 'currentLevel' || name === 'learningGoal') {
      setAssessment({ assessmentId: '', source: '', questions: [], answers: {} })
    }
  }

  const handleAnswerChange = (questionId, optionId) => {
    setAssessment((prev) => ({
      ...prev,
      answers: {
        ...prev.answers,
        [questionId]: optionId,
      },
    }))
  }

  const generateQuestions = async () => {
    if (!form.topic || !form.learningGoal) {
      setError('Please enter topic and learning goal before generating questions.')
      return
    }

    setQuestionLoading(true)
    setError('')
    setResponse(null)

    try {
      const result = await fetch(`${API_BASE}/api/assessment/questions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: form.topic,
          currentLevel: form.currentLevel,
          learningGoal: form.learningGoal,
        }),
      })

      const data = await result.json()

      if (!result.ok) {
        throw new Error(data.message || 'Could not generate assessment questions.')
      }

      setAssessment({
        assessmentId: data.assessmentId,
        source: data.source,
        questions: data.questions || [],
        answers: {},
      })
    } catch (questionError) {
      setAssessment({ assessmentId: '', source: '', questions: [], answers: {} })
      setError(questionError.message)
    } finally {
      setQuestionLoading(false)
    }
  }

  const handleSubmit = async (event) => {
    event.preventDefault()

    if (!assessment.assessmentId || !assessment.questions.length) {
      setError('Generate and answer assessment questions before requesting recommendations.')
      return
    }

    if (answeredQuestions < assessment.questions.length) {
      setError('Please answer all assessment questions before submitting.')
      return
    }

    setLoading(true)
    setError('')

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 25000)

      const result = await fetch(`${API_BASE}/api/recommendations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          assessmentId: assessment.assessmentId,
          assessmentResponses: Object.entries(assessment.answers).map(
            ([questionId, optionId]) => ({ questionId, optionId }),
          ),
        }),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      const data = await result.json()

      if (!result.ok) {
        const detailedMessage = [data?.message, data?.error].filter(Boolean).join(' | ')
        throw new Error(detailedMessage || 'Could not fetch recommendations.')
      }

      setResponse(data)
    } catch (submitError) {
      setResponse(null)
      if (submitError.name === 'AbortError') {
        setError('Request timed out. Please try again with a more specific topic.')
      } else {
        setError(submitError.message)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page-shell">
      <div className="decor decor-left" aria-hidden="true" />
      <div className="decor decor-right" aria-hidden="true" />

      <main className="content-wrap">
        <header className="hero">
          <div className="status-row">
            <span className={`status-pill ${apiStatus.configured ? 'ok' : 'warn'}`}>
              {apiStatus.loading
                ? 'Checking API...'
                : apiStatus.configured
                  ? 'YouTube API Connected'
                  : 'YouTube API Key Missing'}
            </span>
            <span className="provider-pill">Provider: {apiStatus.provider}</span>
          </div>
          <p className="eyebrow">Personalized YouTube Learning Engine</p>
          <h1>{headline}</h1>
          <p className="sub">
            Enter your learning profile, answer a focused AI-generated assessment,
            and the platform will estimate IQ and EQ automatically before ranking
            YouTube recommendations.
          </p>

          <div className="api-diff-panel">
            <h3>Recommendation Insights</h3>
            <div className="api-diff-grid">
              <div>
                <span className="diff-label">Search Mode</span>
                <strong>{apiStatus.provider}</strong>
              </div>
              <div>
                <span className="diff-label">Live Recommendations</span>
                <strong>{response?.recommendations?.length || 0}</strong>
              </div>
              <div>
                <span className="diff-label">Transcript-backed</span>
                <strong>{sourceSummary.transcript}</strong>
              </div>
              <div>
                <span className="diff-label">Metadata fallback</span>
                <strong>{sourceSummary.fallback}</strong>
              </div>
              <div>
                <span className="diff-label">Assessment Progress</span>
                <strong>{answeredQuestions}/{assessment.questions.length || 0}</strong>
              </div>
              <div>
                <span className="diff-label">Adaptive Band</span>
                <strong>
                  {response?.difficultyModel?.thresholds
                    ? `${response.difficultyModel.thresholds.beginnerUpper} - ${response.difficultyModel.thresholds.advancedLower}`
                    : '--'}
                </strong>
              </div>
            </div>
          </div>
        </header>

        <section className="panel intake-panel">
          <h2>Student Intake Form</h2>
          <form onSubmit={handleSubmit} className="intake-grid">
            <label>
              Student Name
              <input
                name="studentName"
                placeholder="Aarav Sharma"
                value={form.studentName}
                onChange={handleChange}
              />
            </label>

            <label>
              Topic of Interest *
              <input
                name="topic"
                required
                placeholder="Data Structures"
                value={form.topic}
                onChange={handleChange}
              />
            </label>

            <label>
              Current Level
              <select
                name="currentLevel"
                value={form.currentLevel}
                onChange={handleChange}
              >
                <option>Beginner</option>
                <option>Intermediate</option>
                <option>Advanced</option>
              </select>
            </label>

            <label>
              Learning Goal *
              <input
                name="learningGoal"
                required
                placeholder="Prepare for coding interviews"
                value={form.learningGoal}
                onChange={handleChange}
              />
            </label>

            <label>
              Preferred Video Length
              <select
                name="preferredDuration"
                value={form.preferredDuration}
                onChange={handleChange}
              >
                <option value="any">Any</option>
                <option value="short">Short (under ~15 min)</option>
                <option value="long">Long (deep dive)</option>
              </select>
            </label>

            <button type="button" onClick={generateQuestions} disabled={questionLoading}>
              {questionLoading ? 'Generating Questions...' : 'Generate AI Assessment Questions'}
            </button>

            <button type="submit" disabled={loading}>
              {loading ? 'Analyzing Profile...' : 'Evaluate & Get Recommendations'}
            </button>
          </form>
          {error ? <p className="error-banner">{error}</p> : null}

          {assessment.questions.length ? (
            <div className="assessment-panel">
              <h3>Targeted Assessment (Auto IQ/EQ)</h3>
              <p>
                Source: <strong>{assessment.source || 'ai-generated-assessment'}</strong>
              </p>
              <div className="assessment-list">
                {assessment.questions.map((question, index) => (
                  <article key={question.id} className="question-card">
                    <p className="question-title">
                      Q{index + 1}. {question.prompt}
                    </p>
                    <p className="question-dimension">{question.dimension}</p>
                    <div className="question-options">
                      {question.options.map((option) => (
                        <label key={option.id}>
                          <input
                            type="radio"
                            name={question.id}
                            value={option.id}
                            checked={assessment.answers[question.id] === option.id}
                            onChange={() => handleAnswerChange(question.id, option.id)}
                          />
                          <span>{option.text}</span>
                        </label>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          ) : null}
        </section>

        <section className="panel result-panel">
          <div className="panel-head">
            <h2>Recommended Videos</h2>
            {response ? (
              <p>
                Query: <strong>{response.searchQuery}</strong> | Transcript analyzed:{' '}
                <strong>{response.analyzedWithTranscript}</strong> | Ability Score:{' '}
                <strong>{response.student.abilityScore}</strong> | IQ/EQ:{' '}
                <strong>{response.student.iq}/{response.student.eq}</strong> | IQ/EQ Difficulty:{' '}
                <strong>
                  {response.student.iqEqDifficulty?.score}/10 ({response.student.iqEqDifficulty?.label})
                </strong>{' '}
                | Assessment:{' '}
                <strong>{response.student.assessment?.answeredCount || 0}/{response.student.assessment?.totalQuestions || 0}</strong>
              </p>
            ) : (
              <p>Submit the form to see personalized video recommendations.</p>
            )}
          </div>

          <div className="results-grid">
            {response?.recommendations?.length ? (
              response.recommendations.map((item) => (
                <article key={item.videoId} className="video-card">
                  <div className="score-chip">Match {item.matchScore}%</div>
                  <div className="video-embed-wrap">
                    <iframe
                      src={item.embedUrl || `https://www.youtube.com/embed/${item.videoId}`}
                      title={item.title}
                      loading="lazy"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      referrerPolicy="strict-origin-when-cross-origin"
                      allowFullScreen
                    />
                  </div>
                  <h3>{item.title}</h3>
                  <p className="meta">
                    {item.author} | {item.duration} | {item.publishedAt}
                  </p>

                  <div className="tags-row">
                    <span>{item.difficulty.label}</span>
                    <span>Difficulty {item.difficulty.score}/10</span>
                    <span>Flesch {item.difficulty.fleschReadingEase}</span>
                    <span>Grade {item.difficulty.readabilityGrade}</span>
                    <span>Source {item.analysisSource}</span>
                  </div>

                  <p className="snippet">{item.transcriptSnippet}</p>
                  <a href={item.url} target="_blank" rel="noreferrer">
                    Watch on YouTube
                  </a>
                </article>
              ))
            ) : (
              <div className="empty-state">
                <p>
                  No recommendations yet. Fill profile, generate assessment,
                  answer questions, then click "Evaluate & Get Recommendations".
                </p>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  )
}

export default App
