'use client'

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react'

type AssistantState = 'ready' | 'listening' | 'user-speaking' | 'thinking' | 'speaking' | 'error'
type Message = { id: string; role: 'user' | 'assistant'; content: string; timestamp: number; source: 'text' | 'voice' }

declare global {
  interface Window { webkitSpeechRecognition?: new () => SpeechRecognition; SpeechRecognition?: new () => SpeechRecognition }
  interface SpeechRecognition extends EventTarget { continuous: boolean; interimResults: boolean; lang: string; start: () => void; stop: () => void; abort: () => void; onresult: ((event: SpeechRecognitionEvent) => void) | null; onend: (() => void) | null; onerror: ((event: SpeechRecognitionErrorEvent) => void) | null }
  interface SpeechRecognitionEvent extends Event { resultIndex: number; results: SpeechRecognitionResultList }
  interface SpeechRecognitionErrorEvent extends Event { error: string }
}

function Face({ state }: { state: AssistantState }) {
  return <div className={`face-stage face-stage--${state}`} aria-hidden="true"><div className="orbit orbit--outer" /><div className="orbit orbit--inner" /><div className="face-glow" /><div className="scan-lines" /><div className="head"><div className="head-top" /><div className="temple temple--left" /><div className="temple temple--right" /><div className="brow brow--left" /><div className="brow brow--right" /><div className="eye eye--left"><span /></div><div className="eye eye--right"><span /></div><div className="nose" /><div className="mouth"><span /></div><div className="chin" /><div className="face-highlight" /></div><div className="particle particle--one" /><div className="particle particle--two" /><div className="particle particle--three" /><div className="particle particle--four" /></div>
}

export default function Page() {
  const [state, setState] = useState<AssistantState>('ready')
  const [continuousVoiceMode, setContinuousVoiceMode] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [supported, setSupported] = useState(true)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const continuousVoiceModeRef = useRef(false)
  const isListeningRef = useRef(false)
  const isProcessingRef = useRef(false)
  const isSpeakingRef = useRef(false)
  const stateRef = useRef<AssistantState>('ready')
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const speechRef = useRef<SpeechSynthesisUtterance | null>(null)
  const conversationRef = useRef<Message[]>([])
  const requestRef = useRef<AbortController | null>(null)
  const speakingIdRef = useRef(0)
  const restartTimerRef = useRef<number | null>(null)
  const startListeningRef = useRef<() => void>(() => {})

  const setAssistantState = useCallback((next: AssistantState) => { stateRef.current = next; setState(next) }, [])

  useEffect(() => { continuousVoiceModeRef.current = continuousVoiceMode }, [continuousVoiceMode])

  const clearRestartTimer = useCallback(() => {
    if (restartTimerRef.current !== null) { window.clearTimeout(restartTimerRef.current); restartTimerRef.current = null }
  }, [])

  const stopPlayback = useCallback(() => {
    speakingIdRef.current += 1
    isSpeakingRef.current = false
    audioRef.current?.pause()
    audioRef.current = null
    if ('speechSynthesis' in window) window.speechSynthesis.cancel()
    speechRef.current = null
  }, [])

  const finishSpeaking = useCallback(() => {
    isSpeakingRef.current = false
    if (continuousVoiceModeRef.current) { setAssistantState('listening'); startListeningRef.current() } else setAssistantState('ready')
  }, [setAssistantState])

  const speak = useCallback(async (text: string) => {
    stopPlayback()
    clearRestartTimer()
    isSpeakingRef.current = true
    recognitionRef.current?.abort()
    isListeningRef.current = false
    const speakingId = speakingIdRef.current
    setAssistantState('speaking')
    try {
      console.log('[SHAGNEX] Voice request started')
      const voiceController = new AbortController()
      const voiceTimeout = window.setTimeout(() => voiceController.abort(), 12000)
      const response = await fetch('/api/voice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: voiceController.signal, body: JSON.stringify({ text }) })
      window.clearTimeout(voiceTimeout)
      if (!response.ok) throw new Error('voice')
      const url = URL.createObjectURL(await response.blob())
      console.log('[SHAGNEX] Audio received')
      const audio = new Audio(url)
      audioRef.current = audio
      audio.onended = () => { console.log('[SHAGNEX] Audio playback ended'); URL.revokeObjectURL(url); if (speakingId === speakingIdRef.current) finishSpeaking() }
      audio.onerror = () => { URL.revokeObjectURL(url); if (speakingId === speakingIdRef.current) finishSpeaking() }
      await audio.play()
      console.log('[SHAGNEX] Audio playback started')
    } catch {
      if (speakingId !== speakingIdRef.current) return
      if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(text)
        speechRef.current = utterance
        utterance.rate = 0.96
        utterance.onend = () => { if (speakingId === speakingIdRef.current) finishSpeaking() }
        utterance.onerror = () => { if (speakingId === speakingIdRef.current) finishSpeaking() }
        window.speechSynthesis.speak(utterance)
      } else finishSpeaking()
    }
  }, [clearRestartTimer, finishSpeaking, setAssistantState, stopPlayback])

  const ask = useCallback(async (text: string, source: 'text' | 'voice') => {
    const clean = text.trim()
    if (!clean || isProcessingRef.current) return
    clearRestartTimer()
    recognitionRef.current?.abort()
    isListeningRef.current = false
    isProcessingRef.current = true
    const userMessage: Message = { id: crypto.randomUUID(), role: 'user', content: clean, timestamp: Date.now(), source }
    conversationRef.current = [...conversationRef.current, userMessage]
    setMessages((current) => [...current, userMessage])
    console.log('[SHAGNEX] Speech final received:', clean)
    setTranscript(clean); setInput(''); setAssistantState('thinking')
    requestRef.current?.abort()
    const controller = new AbortController()
    requestRef.current = controller
    try {
      const timeout = window.setTimeout(() => controller.abort(), 30000)
      try {
        const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: controller.signal, body: JSON.stringify({ message: clean, conversation: conversationRef.current.slice(0, -1).map(({ role, content }) => ({ role, content })) }) })
        const data = await response.json() as { success?: boolean; message?: string; error?: string }
        if (!response.ok || !data.success || !data.message) throw new Error(data.error || "Sorry, I couldn't process that right now.")
        const assistantMessage: Message = { id: crypto.randomUUID(), role: 'assistant', content: data.message, timestamp: Date.now(), source: 'voice' }
        conversationRef.current = [...conversationRef.current, assistantMessage]
        setMessages((current) => [...current, assistantMessage])
        console.log('[SHAGNEX] Gemini response received; showing text immediately')
        void speak(data.message)
      } finally { window.clearTimeout(timeout) }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: 'assistant', content: error instanceof Error ? error.message : "Sorry, I couldn't process that right now.", timestamp: Date.now(), source: 'text' }])
      setAssistantState('error')
    } finally { isProcessingRef.current = false; requestRef.current = null }
  }, [clearRestartTimer, setAssistantState, speak])

  const startListening = useCallback(() => {
    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition
    if (!Recognition) { setSupported(false); setAssistantState('ready'); return }
    if (!continuousVoiceModeRef.current || isProcessingRef.current || isSpeakingRef.current || isListeningRef.current) return
    clearRestartTimer()
    const recognition = new Recognition()
    recognition.continuous = false; recognition.interimResults = true; recognition.lang = 'en-US'
    recognition.onresult = (event) => {
      let finalText = ''
      let interimText = ''
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index]
        if (result.isFinal) finalText += result[0].transcript
        else interimText += result[0].transcript
      }
      if (interimText.trim()) { setTranscript(interimText.trim()); setAssistantState('user-speaking') }
      if (finalText.trim()) {
        const text = finalText.trim()
        isListeningRef.current = false
        recognition.stop()
        setTranscript(text)
        void ask(text, 'voice')
      }
    }
    recognition.onend = () => {
      if (recognitionRef.current === recognition) recognitionRef.current = null
      isListeningRef.current = false
      if (continuousVoiceModeRef.current && !isProcessingRef.current && !isSpeakingRef.current) {
        setAssistantState('listening')
        restartTimerRef.current = window.setTimeout(() => startListeningRef.current(), 150)
      }
    }
    recognition.onerror = (event) => {
      isListeningRef.current = false
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        continuousVoiceModeRef.current = false; setContinuousVoiceMode(false); setSupported(false); setAssistantState('ready'); return
      }
      if (continuousVoiceModeRef.current && !isProcessingRef.current && !isSpeakingRef.current) {
        restartTimerRef.current = window.setTimeout(() => startListeningRef.current(), 300)
      }
    }
    recognitionRef.current = recognition
    isListeningRef.current = true
    setAssistantState('listening')
    try { recognition.start() } catch { isListeningRef.current = false; recognitionRef.current = null }
  }, [ask, clearRestartTimer, setAssistantState])
  startListeningRef.current = startListening

  const stopListening = useCallback(() => {
    continuousVoiceModeRef.current = false
    setContinuousVoiceMode(false)
    clearRestartTimer()
    recognitionRef.current?.abort()
    recognitionRef.current = null
    isListeningRef.current = false
    requestRef.current?.abort()
    stopPlayback()
    setAssistantState('ready')
  }, [clearRestartTimer, setAssistantState, stopPlayback])

  const toggleListening = () => {
    if (continuousVoiceModeRef.current) { stopListening(); return }
    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition
    if (!Recognition) { setSupported(false); return }
    setContinuousVoiceMode(true)
    continuousVoiceModeRef.current = true
    setAssistantState('listening')
    startListeningRef.current()
  }
  const submit = (event: FormEvent) => { event.preventDefault(); void ask(input, 'text') }
  useEffect(() => () => stopListening(), [stopListening])


  const statusLabel = state === 'ready' ? 'READY' : state === 'user-speaking' ? 'USER SPEAKING' : state.toUpperCase()
  const helperLabel = supported ? (state === 'ready' ? 'VOICE MODE' : 'TAP TO INTERRUPT') : 'TYPE MODE'

  return <main className="shagnex-shell"><div className="atmosphere atmosphere--one" /><div className="atmosphere atmosphere--two" /><div className="grid-floor" /><header className="brand-mark" aria-label="SHAGNEX assistant"><span className="brand-glyph">S</span><span className="brand-name">SHAGNEX</span></header><div className="signal-readout" aria-hidden="true"><span>SYS // 07</span><span className="signal-dot" /><span>NEURAL LINK</span></div><section className="assistant-console" aria-labelledby="assistant-title"><p className="eyebrow">PERSONAL INTELLIGENCE</p><h1 id="assistant-title" className="sr-only">SHAGNEX voice assistant</h1><Face state={state} /><div className="status-block" aria-live="polite"><p className="status-label">{statusLabel}<span className="status-pulse" /></p><p className="transcript">{transcript || (state === 'thinking' ? 'Thinking…' : 'Your signal is clear.')}</p></div><button className={`voice-control voice-control--${state}`} type="button" onClick={toggleListening} aria-pressed={continuousVoiceMode} aria-label={continuousVoiceMode ? 'Stop voice mode' : 'Start voice mode'}><span className="control-ring" /><span className="control-icon" /></button><p className="helper-label">{helperLabel}</p></section><section className="chat-panel" aria-label="Conversation"><div className="chat-history" aria-live="polite">{messages.length === 0 && <p className="chat-empty">Ask anything to begin a secure conversation.</p>}{messages.map((message) => <div className={`chat-message chat-message--${message.role}`} key={message.id}><span className="chat-role">{message.role === 'assistant' ? 'SHAGNEX' : 'YOU'}</span><p>{message.content}</p></div>)}</div><form className="chat-form" onSubmit={submit}><input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Type a question…" aria-label="Type a question" disabled={state === 'thinking'} /><button type="submit" disabled={!input.trim() || state === 'thinking'}>SEND</button></form></section><footer className="system-footer"><span>ENCRYPTED SESSION</span><span>LOCAL AUDIO LINK</span><span>BUILD 2.4.1</span></footer></main>
}
