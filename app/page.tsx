'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

type AssistantState = 'ready' | 'listening' | 'thinking' | 'speaking'

declare global {
  interface Window {
    webkitSpeechRecognition?: new () => SpeechRecognition
    SpeechRecognition?: new () => SpeechRecognition
  }

  interface SpeechRecognition extends EventTarget {
    continuous: boolean
    interimResults: boolean
    lang: string
    start: () => void
    stop: () => void
    abort: () => void
    onresult: ((event: SpeechRecognitionEvent) => void) | null
    onend: (() => void) | null
    onerror: (() => void) | null
  }

  interface SpeechRecognitionEvent extends Event {
    results: SpeechRecognitionResultList
  }
}

const replies = [
  'I am here. What would you like to explore?',
  'Signal received. Tell me what is on your mind.',
  'I am listening. We can begin whenever you are ready.',
]

function Face({ state }: { state: AssistantState }) {
  return (
    <div className={`face-stage face-stage--${state}`} aria-hidden="true">
      <div className="orbit orbit--outer" />
      <div className="orbit orbit--inner" />
      <div className="face-glow" />
      <div className="scan-lines" />
      <div className="head">
        <div className="head-top" />
        <div className="temple temple--left" />
        <div className="temple temple--right" />
        <div className="brow brow--left" />
        <div className="brow brow--right" />
        <div className="eye eye--left"><span /></div>
        <div className="eye eye--right"><span /></div>
        <div className="nose" />
        <div className="mouth"><span /></div>
        <div className="chin" />
        <div className="face-highlight" />
      </div>
      <div className="particle particle--one" />
      <div className="particle particle--two" />
      <div className="particle particle--three" />
      <div className="particle particle--four" />
    </div>
  )
}

export default function Page() {
  const [state, setState] = useState<AssistantState>('ready')
  const [transcript, setTranscript] = useState('')
  const [supported, setSupported] = useState(true)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const shouldContinueRef = useRef(false)
  const responseIndexRef = useRef(0)

  const speak = useCallback(async (text: string) => {
    setState('speaking')
    try {
      const response = await fetch('/api/voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      if (!response.ok) throw new Error('Voice generation failed')
      const audio = new Audio(URL.createObjectURL(await response.blob()))
      audio.onended = () => {
        URL.revokeObjectURL(audio.src)
        if (shouldContinueRef.current) setState('listening')
        else setState('ready')
      }
      audio.onerror = () => {
        URL.revokeObjectURL(audio.src)
        setState('ready')
      }
      await audio.play()
    } catch {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel()
        const utterance = new SpeechSynthesisUtterance(text)
        utterance.rate = 0.96
        utterance.pitch = 1.04
        utterance.onend = () => setState(shouldContinueRef.current ? 'listening' : 'ready')
        window.speechSynthesis.speak(utterance)
      } else {
        setState('ready')
      }
    }
  }, [])

  const startListening = useCallback(() => {
    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition
    if (!Recognition) {
      setSupported(false)
      setState('listening')
      return
    }
    shouldContinueRef.current = true
    const recognition = new Recognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'
    recognition.onresult = (event) => {
      let current = ''
      for (let index = event.results.length - 1; index >= 0; index -= 1) {
        current = event.results[index][0].transcript
        if (event.results[index].isFinal) break
      }
      setTranscript(current)
      if (event.results[event.results.length - 1].isFinal) {
        setState('thinking')
        window.setTimeout(() => speak(replies[responseIndexRef.current++ % replies.length]), 650)
      }
    }
    recognition.onend = () => {
      if (shouldContinueRef.current) {
        try { recognition.start() } catch { /* recognition is already restarting */ }
      }
    }
    recognition.onerror = () => setSupported(false)
    recognitionRef.current = recognition
    setState('listening')
    try { recognition.start() } catch { setSupported(false) }
  }, [speak])

  const stopListening = useCallback(() => {
    shouldContinueRef.current = false
    recognitionRef.current?.stop()
    recognitionRef.current = null
    window.speechSynthesis?.cancel()
    setTranscript('')
    setState('ready')
  }, [])

  const toggleListening = () => {
    if (state === 'ready' || state === 'speaking') startListening()
    else stopListening()
  }

  useEffect(() => () => stopListening(), [stopListening])

  const statusLabel = state === 'ready' ? 'READY' : state.toUpperCase()
  const helperLabel = supported ? (state === 'ready' ? 'VOICE MODE' : 'TAP TO INTERRUPT') : 'VISUAL DEMO MODE'

  return (
    <main className="shagnex-shell">
      <div className="atmosphere atmosphere--one" />
      <div className="atmosphere atmosphere--two" />
      <div className="grid-floor" />
      <header className="brand-mark" aria-label="SHAGNEX assistant">
        <span className="brand-glyph">S</span>
        <span className="brand-name">SHAGNEX</span>
      </header>
      <div className="signal-readout" aria-hidden="true">
        <span>SYS // 07</span>
        <span className="signal-dot" />
        <span>NEURAL LINK</span>
      </div>

      <section className="assistant-console" aria-labelledby="assistant-title">
        <p className="eyebrow">PERSONAL INTELLIGENCE</p>
        <h1 id="assistant-title" className="sr-only">SHAGNEX voice assistant</h1>
        <Face state={state} />
        <div className="status-block" aria-live="polite">
          <p className="status-label">{statusLabel}<span className="status-pulse" /></p>
          <p className="transcript">{transcript || (state === 'thinking' ? 'Processing signal…' : 'Your signal is clear.')}</p>
        </div>
        <button
          className={`voice-control voice-control--${state}`}
          type="button"
          onClick={toggleListening}
          aria-pressed={state === 'listening'}
          aria-label={state === 'listening' ? 'Stop listening' : 'Start voice mode'}
        >
          <span className="control-ring" />
          <span className="control-icon" />
        </button>
        <p className="helper-label">{helperLabel}</p>
      </section>

      <footer className="footer-line">
        <span>© 2024 SHAGNEX SYSTEMS</span>
        <span className="footer-center">DESIGNED FOR THE IN-BETWEEN</span>
        <span>V.1.0.7</span>
      </footer>
    </main>
  )
}
