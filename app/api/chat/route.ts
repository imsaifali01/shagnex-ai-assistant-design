import { GoogleGenerativeAI } from '@google/generative-ai'
import { NextResponse } from 'next/server'

type ConversationMessage = { role: 'user' | 'assistant'; content: string }

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const message = typeof body.message === 'string' ? body.message.trim() : ''
    const conversation = Array.isArray(body.conversation) ? body.conversation : []

    if (!message || message.length > 2000) {
      return NextResponse.json({ success: false, error: 'Please enter a question.' }, { status: 400 })
    }

    const apiKey = process.env.GEMINI_API_KEY
    if (!apiKey) {
      console.error('[v0] Gemini is not configured')
      return NextResponse.json({ success: false, error: "Sorry, I couldn't process that right now." }, { status: 500 })
    }

    const history: ConversationMessage[] = conversation
      .filter((item: unknown): item is ConversationMessage => {
        if (!item || typeof item !== 'object') return false
        const candidate = item as Record<string, unknown>
        return (candidate.role === 'user' || candidate.role === 'assistant') && typeof candidate.content === 'string'
      })
      .slice(-12)
      .map((item: ConversationMessage) => ({ role: item.role, content: item.content.slice(0, 4000) }))

    const client = new GoogleGenerativeAI(apiKey)
    const model = client.getGenerativeModel({
      model: process.env.GEMINI_MODEL || 'gemini-3.6-flash',
      systemInstruction: 'You are SHAGNEX, a concise, warm personal AI assistant. Answer clearly and naturally for both text and spoken audio. Preserve context across follow-up questions. Never mention internal providers, APIs, keys, or implementation details. If you are unsure about current facts, say so rather than inventing them.',
    })
    const chat = model.startChat({
      history: history.slice(0, -1).map((item) => ({ role: item.role === 'assistant' ? 'model' : 'user', parts: [{ text: item.content }] })),
      generationConfig: { temperature: 0.7, maxOutputTokens: 1200 },
    })
    const result = await chat.sendMessage(message)
    const answer = result.response.text().trim()

    if (!answer) {
      return NextResponse.json({ success: false, error: "Sorry, I couldn't process that right now." }, { status: 502 })
    }

    return NextResponse.json({ success: true, message: answer })
  } catch (error) {
    console.error('[v0] Gemini chat error:', error)
    return NextResponse.json({ success: false, error: 'I\'m temporarily unavailable. Please try again.' }, { status: 502 })
  }
}
