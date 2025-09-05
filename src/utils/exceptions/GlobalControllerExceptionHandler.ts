// Global controller-style error handling utilities for Next.js App Router
// Usage in a route:
//   import { withErrorHandling, NotFoundException } from '@/utils/exceptions'
//   export const GET = withErrorHandling(async (req) => {
//     throw new NotFoundException('Item not found')
//   })

import { NextResponse } from 'next/server'
import { HttpException } from './HttpException'
import { InvalidInputException } from './index'
import { InternalServerErrorException } from './index'
import { NotFoundException } from './NotFoundException'

export function toHttpException(err: unknown): HttpException {
  if (err instanceof HttpException) return err
  if (err instanceof Error) return new InternalServerErrorException(err.message)
  return new InternalServerErrorException()
}

export function fromZodError(err: any, message = 'Validation failed'): HttpException {
  try {
    if (err && Array.isArray(err.issues)) {
      const details = err.issues.map((i: any) => {
        const path = Array.isArray(i.path) ? i.path.join('.') : i.path
        return path ? `${path}: ${i.message}` : String(i.message ?? '')
      })
      return new InvalidInputException(message, details)
    }
  } catch {
    // ignore
  }
  return new InvalidInputException(message)
}

export function assertFound<T>(value: T | null | undefined, message = 'Resource not found'): T {
  if (value === null || value === undefined) {
    throw new NotFoundException(message)
  }
  if (typeof value === 'string' && value.length === 0) {
    throw new NotFoundException(message)
  }
  if (Array.isArray(value) && value.length === 0) {
    throw new NotFoundException(message)
  }
  return value as T
}

export function toErrorResponse(req: Request, error: unknown): Response {
  const path = safePathname(req.url)
  const ex = toHttpException(error)
  const body = ex.toJSON(path)
  return NextResponse.json(body, { status: ex.status })
}

type RouteHandler = (req: Request, ctx?: any) => Promise<Response> | Response

export function withErrorHandling(handler: RouteHandler): RouteHandler {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx)
    } catch (error) {
      // Optional: centralize logging
      console.error('[API_ERROR]', error)
      return toErrorResponse(req, error)
    }
  }
}

function safePathname(url: string): string {
  try {
    return new URL(url).pathname
  } catch {
    return url || '/'
  }
}