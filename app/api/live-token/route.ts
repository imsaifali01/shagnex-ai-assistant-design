import { GoogleGenAI, Modality } from '@google/genai'
import { NextResponse } from 'next/server'

export async function POST() {
  const apiKey = process.env.GEMINI_API_KEY

  if (!apiKey) {
    return NextResponse.json({ success: false, error: 'Gemini is not configured.' }, { status: 500 })
  }

  try {
    const ai = new GoogleGenAI({ apiKey, httpOptions: { apiVersion: 'v1alpha' } })
    const token = await ai.authTokens.create({
      config: {
        uses: 1,
        expireTime: new Date(Date.now() + 60_000).toISOString(),
        liveConnectConstraints: {
          model: process.env.GEMINI_LIVE_MODEL ?? 'gemini-2.0-flash-live-001',
          config: {
            responseModalities: [Modality.AUDIO],
            systemInstruction: 'You are SHAGNEX, a concise, warm personal voice assistant. Answer naturally and briefly.',
          },
        },
      },
    })

    return NextResponse.json({ success: true, token: token.name })
  } catch (error) {
    console.error('[SHAGNEX] Live token creation failed:', error)
    return NextResponse.json({ success: false, error: 'Live voice is temporarily unavailable.' }, { status: 502 })
  }
}
