import { NextResponse } from 'next/server'

const ELEVENLABS_VOICE_ID = 'HH8sIQq8WOcER3Nu118i'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const text = typeof body.text === 'string' ? body.text.trim() : ''

    if (!text || text.length > 500) {
      return NextResponse.json({ error: 'Text must be between 1 and 500 characters.' }, { status: 400 })
    }

    const apiKey = process.env.ELEVENLABS_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'Voice service is not configured.' }, { status: 503 })
    }

    console.time('[SHAGNEX] Voice')
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}`, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.48, similarity_boost: 0.78, style: 0.2, use_speaker_boost: true },
      }),
    })

    console.timeEnd('[SHAGNEX] Voice')
    if (!response.ok) {
      return NextResponse.json({ error: 'Voice generation failed.' }, { status: 502 })
    }

    return new NextResponse(await response.arrayBuffer(), {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-store',
      },
    })
  } catch {
    return NextResponse.json({ error: 'Invalid voice request.' }, { status: 400 })
  }
}
