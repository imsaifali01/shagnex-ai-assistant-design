import { gateway } from 'ai'
import { generateText } from 'ai'
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

    const result = await generateText({
      model: gateway('openai/gpt-5-mini'),
      system: 'You are SHAGNEX, a concise, helpful voice-first AI assistant. Answer clearly and naturally for spoken audio. If the user asks for current information, say what you know and avoid inventing live facts.',
      messages: [
        ...safeConversation,
        { role: 'user', content: message },
      ],
      temperature: 0.7,
    })

    const answer = result.text?.trim()
    if (!answer) {
      return NextResponse.json({ success: false, error: 'Unable to get a response right now.' }, { status: 502 })
    }

    return NextResponse.json({ success: true, message: answer })
  } catch (error) {
    console.error('[v0] AI Gateway chat error:', error)
    return NextResponse.json({ success: false, error: 'The assistant is temporarily unavailable. Please try again.' }, { status: 502 })
  }
}
