'use client'

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react'

type AssistantState = 'ready' | 'listening' | 'thinking' | 'speaking' | 'error'
type Message = { id: string; role: 'user' | 'assistant'; content: string; timestamp: number; source: 'text' | 'voice' }

declare global {
  interface Window { webkitSpeechRecognition?: new () => SpeechRecognition; SpeechRecognition?: new () => SpeechRecognition }
  interface SpeechRecognition extends EventTarget { continuous: boolean; interimResults: boolean; lang: string; start: () => void; stop: () => void; abort: () => void; onresult: ((event: SpeechRecognitionEvent) => void) | null; onend: (() => void) | null; onerror: (() => void) | null }
  interface SpeechRecognitionEvent extends Event { results: SpeechRecognitionResultList }
}

function Face({ state }: { state: AssistantState }) {
  return <div className={`face-stage face-stage--${state}`} aria-hidden="true"><div className="orbit orbit--outer" /><div className="orbit orbit--inner" /><div className="face-glow" /><div className="scan-lines" /><div className="head"><div className="head-top" /><div className="temple temple--left" /><div className="temple temple--right" /><div className="brow brow--left" /><div className="brow brow--right" /><div className="eye eye--left"><span /></div><div className="eye eye--right"><span /></div><div className="nose" /><div className="mouth"><span /></div><div className="chin" /><div className="face-highlight" /></div><div className="particle particle--one" /><div className="particle particle--two" /><div className="particle particle--three" /><div className="particle particle--four" /></div>
}

export default function Page() {
  const [state, setState] = useState<AssistantState>('ready')
  const [transcript, setTranscript] = useState('')
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [supported, setSupported] = useState(true)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const shouldContinueRef = useRef(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const conversationRef = useRef<Message[]>([])

  const speak = useCallback(async (text: string) => {
    setState('speaking')
    try {
      const response = await fetch('/api/voice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) })
      if (!response.ok) throw new Error('Voice unavailable')
      const url = URL.createObjectURL(await response.blob())
      const audio = new Audio(url)
      audioRef.current = audio
      audio.onended = () => { URL.revokeObjectURL(url); audioRef.current = null; setState(shouldContinueRef.current ? 'listening' : 'ready'); if (shouldContinueRef.current) startListening() }
      audio.onerror = () => { URL.revokeObjectURL(url); audioRef.current = null; setState(shouldContinueRef.current ? 'listening' : 'ready') }
      await audio.play()
    } catch {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel()
        const utterance = new SpeechSynthesisUtterance(text)
        utterance.rate = 0.96
        utterance.onend = () => { setState(shouldContinueRef.current ? 'listening' : 'ready'); if (shouldContinueRef.current) startListening() }
        window.speechSynthesis.speak(utterance)
      } else setState(shouldContinueRef.current ? 'listening' : 'ready')
    }
  }, [])

  const ask = useCallback(async (text: string, source: 'text' | 'voice') => {
    const clean = text.trim()
    if (!clean || state === 'thinking') return
    const userMessage: Message = { id: crypto.randomUUID(), role: 'user', content: clean, timestamp: Date.now(), source }
    conversationRef.current = [...conversationRef.current, userMessage]
    setMessages((current) => [...current, userMessage])
    setTranscript(clean)
    setInput('')
    setState('thinking')
    try {
      const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: clean, conversation: conversationRef.current.map(({ role, content }) => ({ role, content })) }) })
      const data = await response.json()
      if (!response.ok || !data.success || typeof data.message !== 'string') throw new Error(data.error || 'Unable to get a response right now.')
      const assistantMessage: Message = { id: crypto.randomUUID(), role: 'assistant', content: data.message, timestamp: Date.now(), source: 'voice' }
      conversationRef.current = [...conversationRef.current, assistantMessage]
      setMessages((current) => [...current, assistantMessage])
      await speak(data.message)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to get a response right now.'
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'assistant', content: message, timestamp: Date.now(), source: 'text' }])
      setState('error')
    }
  }, [speak, state])

  const startListening = useCallback(() => {
    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition
    if (!Recognition) { setSupported(false); return }
    shouldContinueRef.current = true
    const recognition = new Recognition()
    recognition.continuous = true; recognition.interimResults = true; recognition.lang = 'en-US'
    recognition.onresult = (event) => {
      let current = ''
      for (let index = event.results.length - 1; index >= 0; index -= 1) { current = event.results[index][0].transcript; if (event.results[index].isFinal) break }
      setTranscript(current)
      if (event.results[event.results.length - 1].isFinal) ask(current, 'voice')
    }
    recognition.onend = () => { if (shouldContinueRef.current && state === 'listening') { try { recognition.start() } catch {} } }
    recognition.onerror = () => setSupported(false)
    recognitionRef.current = recognition; setState('listening')
    try { recognition.start() } catch { setSupported(false) }
  }, [ask, state])

  const stopListening = useCallback(() => { shouldContinueRef.current = false; recognitionRef.current?.abort(); recognitionRef.current = null; audioRef.current?.pause(); audioRef.current = null; window.speechSynthesis?.cancel(); setState('ready') }, [])
  const toggleListening = () => { if (state === 'ready' || state === 'error') startListening(); else stopListening() }
  const submit = (event: FormEvent) => { event.preventDefault(); void ask(input, 'text') }
  useEffect(() => () => stopListening(), [stopListening])

  const statusLabel = state === 'ready' ? 'READY' : state.toUpperCase()
  const helperLabel = supported ? (state === 'ready' ? 'VOICE MODE' : 'TAP TO INTERRUPT') : 'TYPE MODE'

  return <main className="shagnex-shell"><div className="atmosphere atmosphere--one" /><div className="atmosphere atmosphere--two" /><div className="grid-floor" /><header className="brand-mark" aria-label="SHAGNEX assistant"><span className="brand-glyph">S</span><span className="brand-name">SHAGNEX</span></header><div className="signal-readout" aria-hidden="true"><span>SYS // 07</span><span className="signal-dot" /><span>NEURAL LINK</span></div><section className="assistant-console" aria-labelledby="assistant-title"><p className="eyebrow">PERSONAL INTELLIGENCE</p><h1 id="assistant-title" className="sr-only">SHAGNEX voice assistant</h1><Face state={state} /><div className="status-block" aria-live="polite"><p className="status-label">{statusLabel}<span className="status-pulse" /></p><p className="transcript">{transcript || (state === 'thinking' ? 'Thinking…' : 'Your signal is clear.')}</p></div><button className={`voice-control voice-control--${state}`} type="button" onClick={toggleListening} aria-pressed={state === 'listening'} aria-label={state === 'listening' ? 'Stop listening' : 'Start voice mode'}><span className="control-ring" /><span className="control-icon" /></button><p className="helper-label">{helperLabel}</p></section><section className="chat-panel" aria-label="Conversation"><div className="chat-history" aria-live="polite">{messages.length === 0 && <p className="chat-empty">Ask anything to begin a secure conversation.</p>}{messages.map((message) => <div className={`chat-message chat-message--${message.role}`} key={message.id}><span className="chat-role">{message.role === 'assistant' ? 'SHAGNEX' : 'YOU'}</span><p>{message.content}</p></div>)}</div><form className="chat-form" onSubmit={submit}><input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Type a question…" aria-label="Type a question" disabled={state === 'thinking'} /><button type="submit" disabled={!input.trim() || state === 'thinking'}>SEND</button></form></section><footer className="footer-line"><span>© 2024 SHAGNEX SYSTEMS</span><span className="footer-center">DESIGNED FOR THE IN-BETWEEN</span><span>V.1.0.7</span></footer></main>
}
