import { useMemo, useState } from 'react'
import './App.css'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000'

const initialForm = {
  studentName: '',
  iqScore: '',
  eqScore: '',
  topic: '',
  currentLevel: 'Beginner',
  learningGoal: '',
  preferredDuration: 'any',
}

function App() {
  const [form, setForm] = useState(initialForm)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [response, setResponse] = useState(null)

  const headline = useMemo(() => {
    if (!response) return 'Your Personalized Learning Matchmaker'
    return `Top Recommendations for ${response.student.name}`
  }, [response])

  const handleChange = (event) => {
    const { name, value } = event.target
    setForm((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setLoading(true)
    setError('')

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 12000)

      const result = await fetch(`${API_BASE}/api/recommendations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      const data = await result.json()

      if (!result.ok) {
        throw new Error(data.message || 'Could not fetch recommendations.')
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
          <p className="eyebrow">Personalized YouTube Learning Engine</p>
          <h1>{headline}</h1>
          <p className="sub">
            Enter student details, IQ and EQ scores, and learning goal. The system
            computes student ability score using 0.7 x IQ + 0.3 x EQ, searches
            YouTube, extracts transcripts, runs Flesch reading-based difficulty
            analysis, and ranks videos by match.
          </p>
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
              IQ Score (50-180) *
              <input
                name="iqScore"
                type="number"
                min="50"
                max="180"
                required
                placeholder="110"
                value={form.iqScore}
                onChange={handleChange}
              />
            </label>

            <label>
              EQ Score (50-180) *
              <input
                name="eqScore"
                type="number"
                min="50"
                max="180"
                required
                placeholder="105"
                value={form.eqScore}
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

            <button type="submit" disabled={loading}>
              {loading ? 'Analyzing Transcripts...' : 'Get Smart Recommendations'}
            </button>
          </form>
          {error ? <p className="error-banner">{error}</p> : null}
        </section>

        <section className="panel result-panel">
          <div className="panel-head">
            <h2>Recommended Videos</h2>
            {response ? (
              <p>
                Query: <strong>{response.searchQuery}</strong> | Transcript analyzed:{' '}
                <strong>{response.analyzedWithTranscript}</strong> | Ability Score:{' '}
                <strong>{response.student.abilityScore}</strong>
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
                  <h3>{item.title}</h3>
                  <p className="meta">
                    {item.author} | {item.duration} | {item.publishedAt}
                  </p>

                  <div className="tags-row">
                    <span>{item.difficulty.label}</span>
                    <span>Difficulty {item.difficulty.score}/10</span>
                    <span>Flesch {item.difficulty.fleschReadingEase}</span>
                    <span>Grade {item.difficulty.readabilityGrade}</span>
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
                  No recommendations yet. Fill the form and click "Get Smart
                  Recommendations".
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
