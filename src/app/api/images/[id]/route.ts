import { db } from '@/lib/db'
import { Buffer } from 'node:buffer'

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Params) {
  try {
    const { id } = await params
    if (!id || id.length > 64) {
      return new Response('Invalid id', { status: 400 })
    }

    const raw = await db.get(`image:${id}`)
    if (!raw) {
      return new Response('Not found', { status: 404 })
    }

    const parsed = (typeof raw === 'string' ? JSON.parse(raw) : raw) as {
      mime?: string
      data?: string
    }

    const mime = typeof parsed?.mime === 'string' ? parsed.mime : 'application/octet-stream'
    const base64 = typeof parsed?.data === 'string' ? parsed.data : ''
    if (!base64) {
      return new Response('Not found', { status: 404 })
    }

    const buf = Buffer.from(base64, 'base64')

    return new Response(buf, {
      status: 200,
      headers: {
        'Content-Type': mime,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Internal Server Error'
    return new Response(msg, { status: 500 })
  }
}