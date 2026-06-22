import { useState } from 'react'
import './App.css'

const STACK = [
  { name: 'Claude', role: 'Senior Principal Engineer', color: '#d97706' },
  { name: 'Codex', role: 'Independent Reviewer', color: '#7c3aed' },
  { name: 'Ollama', role: 'Commodity Tasks', color: '#059669' },
]

const PIPELINE = [
  'Linear Issue Created',
  'Branch Created',
  'Claude Implements',
  'CI Gates Pass',
  'Codex Reviews',
  'PR Merged',
  'Deployed',
]

export default function App() {
  const [step, setStep] = useState(0)
  const [running, setRunning] = useState(false)

  const runPipeline = () => {
    if (running) return
    setRunning(true)
    setStep(0)
    let i = 0
    const tick = setInterval(() => {
      i++
      setStep(i)
      if (i >= PIPELINE.length) {
        clearInterval(tick)
        setRunning(false)
      }
    }, 600)
  }

  const reset = () => {
    setStep(0)
    setRunning(false)
  }

  return (
    <div className="app">
      <header>
        <div className="badge">AST-40</div>
        <h1>Agentic DevSecOps Factory</h1>
        <p className="subtitle">Hello World — built by the factory, end to end</p>
      </header>

      <section className="workforce">
        <h2>AI Workforce</h2>
        <div className="agents">
          {STACK.map(a => (
            <div key={a.name} className="agent" style={{ borderColor: a.color }}>
              <span className="agent-name" style={{ color: a.color }}>{a.name}</span>
              <span className="agent-role">{a.role}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="pipeline">
        <h2>Deployment Pipeline</h2>
        <div className="steps">
          {PIPELINE.map((label, i) => (
            <div
              key={label}
              className={`step ${i < step ? 'done' : ''} ${i === step && running ? 'active' : ''}`}
            >
              <span className="step-num">{i < step ? '✓' : i + 1}</span>
              <span className="step-label">{label}</span>
            </div>
          ))}
        </div>
        <div className="actions">
          {step === PIPELINE.length
            ? <button onClick={reset} className="btn secondary">Reset</button>
            : <button onClick={runPipeline} disabled={running} className="btn primary">
                {running ? 'Running...' : 'Run Pipeline'}
              </button>
          }
        </div>
        {step === PIPELINE.length && (
          <p className="success">Pipeline complete. Ship it.</p>
        )}
      </section>
    </div>
  )
}
