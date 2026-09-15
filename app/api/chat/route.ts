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

    const safeConversation: ConversationMessage[] = conversation
      .filter((item: unknown): item is ConversationMessage => {
        if (!item || typeof item !== 'object') return false
        const candidate = item as Record<string, unknown>
        return (candidate.role === 'user' || candidate.role === 'assistant') && typeof candidate.content === 'string'
      })
      .slice(-10)
      .map((item: ConversationMessage) => ({ role: item.role, content: item.content.slice(0, 4000) }))

    const apiKey = process.env.OPENAI_API_KEY_2
    if (!apiKey) {
      return NextResponse.json({ success: false, error: 'OpenAI is not configured.' }, { status: 500 })
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0.7,
        messages: [
          {
            role: 'system',
            content: 'You are SHAGNEX, a concise, helpful voice-first AI assistant. Answer clearly and naturally for spoken audio. If the user asks for current information, say what you know and avoid inventing live facts.',
          },
          ...safeConversation,
          { role: 'user', content: message },
        ],
      }),
    })

    if (!response.ok) {
      const details = await response.text()
      console.error('[v0] OpenAI response error:', response.status, details)
      return NextResponse.json({ success: false, error: 'OpenAI could not generate a response.' }, { status: 502 })
    }

    const result = await response.json() as { choices?: Array<{ message?: { content?: string } }> }
    const answer = result.choices?.[0]?.message?.content?.trim()
    if (!answer) {
      return NextResponse.json({ success: false, error: 'Unable to get a response right now.' }, { status: 502 })
    }

    return NextResponse.json({ success: true, message: answer })
  } catch (error) {
    console.error('[v0] AI Gateway chat error:', error)
    return NextResponse.json({ success: false, error: 'The assistant is temporarily unavailable. Please try again.' }, { status: 502 })
  }
}
