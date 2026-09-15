import { GoogleGenerativeAI } from '@google/generative-ai'
import { NextResponse } from 'next/server'

type ConversationMessage = { role: 'user' | 'assistant'; content: string }
type GeminiHistoryMessage = { role: 'user' | 'model'; parts: Array<{ text: string }> }

function buildGeminiHistory(messages: ConversationMessage[]): GeminiHistoryMessage[] {
  const normalized = messages
    .filter((item) => item.content.trim())
    .map((item) => ({
      role: item.role === 'assistant' ? 'model' as const : 'user' as const,
      parts: [{ text: item.content.trim() }],
    }))

  while (normalized.length > 0 && normalized[0].role !== 'user') {
    normalized.shift()
  }

  const alternating: GeminiHistoryMessage[] = []
  for (const item of normalized) {
    if (alternating.at(-1)?.role === item.role) continue
    alternating.push(item)
  }

  return alternating
}

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

    const previousMessages = history.at(-1)?.role === 'user' && history.at(-1)?.content.trim() === message
      ? history.slice(0, -1)
      : history
    const geminiHistory = buildGeminiHistory(previousMessages)

    const client = new GoogleGenerativeAI(apiKey)
    let searchContext = ''
    const tavilyKey = process.env.TAVILY_API_KEY
    const shouldSearch = /\b(latest|today|current|recent|news|weather|price|prices|stock|research|search|look up|who is|what is happening|how much)\b/i.test(message)

    if (tavilyKey && shouldSearch) {
      try {
        const searchResponse = await fetch('https://api.tavily.com/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ api_key: tavilyKey, query: message, search_depth: 'basic', topic: 'general', max_results: 5, include_answer: true }),
          signal: AbortSignal.timeout(8000),
        })
        if (searchResponse.ok) {
          const searchData = await searchResponse.json() as { answer?: string; results?: Array<{ title?: string; content?: string; url?: string }> }
          const results = (searchData.results ?? []).map((result) => `- ${result.title ?? 'Source'}: ${result.content ?? ''} (${result.url ?? ''})`).join('\n')
          searchContext = [searchData.answer ? `Tavily summary: ${searchData.answer}` : '', results ? `Web sources:\n${results}` : ''].filter(Boolean).join('\n\n')
        }
      } catch (error) {
        console.error('[v0] Tavily search unavailable:', error)
      }
    }

    const systemInstruction = `You are SHAGNEX, a concise, warm personal AI assistant. Answer clearly and naturally for both text and spoken audio. Preserve context across follow-up questions. Never mention internal providers, APIs, keys, or implementation details. If you are unsure about current facts, say so rather than inventing them.${searchContext ? `\n\nUse the following web search context for current factual questions. Prefer it over memory, do not invent details, and mention the source naturally when useful:\n${searchContext}` : ''}`
    const models = [...new Set([process.env.GEMINI_MODEL, 'gemini-3.6-flash', 'gemini-2.0-flash'].filter((model): model is string => Boolean(model)))]
    let answer = ''
    let lastError: unknown

    for (const modelName of models) {
      try {
        const model = client.getGenerativeModel({ model: modelName, systemInstruction })
        const chat = model.startChat({
          history: geminiHistory,
          generationConfig: { temperature: 0.7, maxOutputTokens: 1200 },
        })
        answer = (await chat.sendMessage(message)).response.text().trim()
        if (answer) break
      } catch (error) {
        lastError = error
        const status = typeof error === 'object' && error !== null && 'status' in error ? error.status : undefined
        if (status !== 404 && status !== 429 && status !== 500 && status !== 503) throw error
      }
    }

    if (!answer) {
      console.error('[v0] Gemini models unavailable:', lastError)
      return NextResponse.json({ success: false, error: 'The assistant is busy right now. Please try again in a moment.' }, { status: 503 })
    }

    if (!answer) {
      return NextResponse.json({ success: false, error: "Sorry, I couldn't process that right now." }, { status: 502 })
    }

    return NextResponse.json({ success: true, message: answer })
  } catch (error) {
    console.error('[v0] Gemini chat error:', error)
    return NextResponse.json({ success: false, error: 'I\'m temporarily unavailable. Please try again.' }, { status: 502 })
  }
}
