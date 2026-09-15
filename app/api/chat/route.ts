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

    console.log('[SHAGNEX] Chat request started')
    const client = new GoogleGenerativeAI(apiKey)
    let searchContext = ''
    const serpApiKey = process.env.SERPAPI_API_KEY
    const shouldSearch = /\b(latest|today|current|recent|news|weather|price|prices|gold|silver|oil|stock|stocks|research|search|look up|who is|what is happening|how much)\b/i.test(message)
    const searchQuery = /\b(gold|xau|bullion)\b/i.test(message)
      ? `${message} latest live gold spot price USD per troy ounce`
      : message

    if (serpApiKey && shouldSearch) {
      try {
        console.log('[SHAGNEX] Searching SerpAPI:', searchQuery)
        const searchUrl = new URL('https://serpapi.com/search.json')
        searchUrl.searchParams.set('engine', 'google')
        searchUrl.searchParams.set('q', searchQuery)
        searchUrl.searchParams.set('api_key', serpApiKey)
        searchUrl.searchParams.set('num', '5')
        const searchResponse = await fetch(searchUrl, { signal: AbortSignal.timeout(8000) })
        if (searchResponse.ok) {
          const searchData = await searchResponse.json() as { answer_box?: { answer?: string; snippet?: string; title?: string; link?: string }; knowledge_graph?: { title?: string; description?: string; source?: { name?: string; link?: string } }; organic_results?: Array<{ title?: string; snippet?: string; link?: string }> }
          const answerBox = searchData.answer_box
          const knowledgeGraph = searchData.knowledge_graph
          const results = (searchData.organic_results ?? []).map((result) => `- ${result.title ?? 'Source'}: ${result.snippet ?? ''} (${result.link ?? ''})`).join('\n')
          searchContext = [
            answerBox ? `Direct result: ${answerBox.answer ?? answerBox.snippet ?? ''} (${answerBox.link ?? ''})` : '',
            knowledgeGraph ? `Knowledge result: ${knowledgeGraph.title ?? ''} — ${knowledgeGraph.description ?? ''} (${knowledgeGraph.source?.link ?? ''})` : '',
            results ? `Web sources:\n${results}` : '',
          ].filter(Boolean).join('\n\n')
          if (!searchContext) searchContext = `SerpAPI returned no usable results for: ${searchQuery}`
          console.log('[SHAGNEX] SerpAPI search returned:', Boolean(searchContext))
        } else {
          console.error('[SHAGNEX] SerpAPI search failed:', searchResponse.status)
        }
      } catch (error) {
        console.error('[v0] SerpAPI search unavailable:', error)
      }
    }

    const systemInstruction = `You are SHAGNEX, a fast personal AI assistant. Answer naturally and concisely for spoken conversation. For normal questions, use 1–4 short sentences. Do not repeat the question, add long introductions, or reveal providers, APIs, keys, or implementation details. Preserve context across follow-ups. Give more detail only when requested. If current facts are uncertain, say so rather than inventing them.${searchContext ? `\n\nUse this web search context for current factual questions. Prefer it over memory and mention sources naturally when useful:\n${searchContext}` : ''}`
    const models = [...new Set([process.env.GEMINI_MODEL, process.env.GEMINI_MODEL_2, 'gemini-2.5-flash', 'gemini-2.0-flash'].filter((model): model is string => Boolean(model)))]
    let answer = ''
    let lastError: unknown

    for (const modelName of models) {
      try {
        const model = client.getGenerativeModel({ model: modelName, systemInstruction })
        const chat = model.startChat({
          history: geminiHistory,
          generationConfig: { temperature: 0.65, maxOutputTokens: 500 },
        })
        console.time(`[SHAGNEX] Gemini ${modelName}`)
        const result = await Promise.race([
          chat.sendMessage(message),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Gemini request timed out')), 9000)),
        ])
        console.timeEnd(`[SHAGNEX] Gemini ${modelName}`)
        console.log('[SHAGNEX] Gemini complete response received')
        answer = result.response.text().trim()
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
