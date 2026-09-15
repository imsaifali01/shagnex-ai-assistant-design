import { NextResponse } from 'next/server'

type ConversationMessage = {
  role: 'user' | 'assistant'
  content: string
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const message = typeof body.message === 'string' ? body.message.trim() : ''
    const conversation = Array.isArray(body.conversation) ? body.conversation : []

    if (!message || message.length > 2000) {
      return NextResponse.json({ success: false, error: 'Please enter a question.' }, { status: 400 })
    }

    const apiKey = process.env.OPENAI_API_KEY?.trim()
    if (!apiKey) {
      return NextResponse.json({ success: false, error: 'OpenAI is not configured for this preview.' }, { status: 503 })
    }

    const safeConversation: ConversationMessage[] = conversation
      .filter((item: unknown): item is ConversationMessage => {
        if (!item || typeof item !== 'object') return false
        const candidate = item as Record<string, unknown>
        return (candidate.role === 'user' || candidate.role === 'assistant') && typeof candidate.content === 'string'
      })
      .slice(-10)
      .map((item: ConversationMessage) => ({ role: item.role, content: item.content.slice(0, 4000) }))

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        temperature: 0.7,
        messages: [
          { role: 'system', content: 'You are SHAGNEX, a concise, helpful voice-first AI assistant. Answer clearly and naturally for spoken audio. If the user asks for current information, say what you know and avoid inventing live facts.' },
          ...safeConversation,
          { role: 'user', content: message },
        ],
      }),
    })

    if (!response.ok) {
      const upstream = await response.json().catch(() => null)
      const upstreamMessage = typeof upstream?.error?.message === 'string' ? upstream.error.message : ''
      const error = response.status === 401
        ? 'OpenAI rejected the API key. Check that it is active and copied without extra spaces.'
        : response.status === 429
          ? 'OpenAI rate limit or billing limit reached.'
          : upstreamMessage || 'OpenAI could not answer right now.'
      return NextResponse.json({ success: false, error }, { status: response.status === 401 ? 502 : 502 })
    }

    const data = await response.json()
    const answer = data?.choices?.[0]?.message?.content
    if (typeof answer !== 'string' || !answer.trim()) {
      return NextResponse.json({ success: false, error: 'Unable to get a response right now.' }, { status: 502 })
    }

    return NextResponse.json({ success: true, message: answer.trim() })
  } catch {
    return NextResponse.json({ success: false, error: 'Unable to get a response right now.' }, { status: 400 })
  }
}
