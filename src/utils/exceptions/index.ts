// Centralized HTTP exceptions and API error handling for Next.js (App Router)

import { NextResponse } from 'next/server'

export interface HttpErrorInfo {
  status: number
  path: string
  message: string
  errors?: string[]
  code?: string
  timestamp: string
}

export type ApiErrorResponse = HttpErrorInfo

export class HttpException extends Error {
  status: number
  code?: string
  details?: string[]

  constructor(message: string, status = 500, code?: string, details?: string[]) {
    super(message)
    this.name = this.constructor.name
    this.status = status
    this.code = code
    this.details = details
  }

  toJSON(path: string): HttpErrorInfo {
    return {
      status: this.status,
      path,
      message: this.message,
      errors: this.details,
      code: this.code,
      timestamp: new Date().toISOString(),
    }
  }
}

// Common exceptions

export class NotFoundException extends HttpException {
  constructor(message = 'Resource not found', details?: string[]) {
    super(message, 404, 'NOT_FOUND', details)
  }
}

export class InvalidInputException extends HttpException {
  constructor(message = 'Invalid input', details?: string[]) {
    super(message, 422, 'INVALID_INPUT', details)
  }
}

export class UnauthorizedException extends HttpException {
  constructor(message = 'Unauthorized', details?: string[]) {
    super(message, 401, 'UNAUTHORIZED', details)
  }
}

export class ForbiddenException extends HttpException {
  constructor(message = 'Forbidden', details?: string[]) {
    super(message, 403, 'FORBIDDEN', details)
  }
}

export class ConflictException extends HttpException {
  constructor(message = 'Conflict', details?: string[]) {
    super(message, 409, 'CONFLICT', details)
  }
}

export class UnprocessableEntityException extends HttpException {
  constructor(message = 'Unprocessable entity', details?: string[]) {
    super(message, 422, 'UNPROCESSABLE_ENTITY', details)
  }
}

export class InternalServerErrorException extends HttpException {
  constructor(message = 'Internal server error', details?: string[]) {
    super(message, 500, 'INTERNAL_SERVER_ERROR', details)
  }
}

export class EmailInUseException extends HttpException {
  constructor(message = 'Email already in use', details?: string[]) {
    super(message, 409, 'EMAIL_IN_USE', details)
  }
}

// Helpers

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
    // fall through
  }
  return new InvalidInputException(message)
}

export function assertFound<T>(
  value: T | null | undefined,
  message = 'Resource not found'
): T {
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

// Global controller-style handler for API routes

type RouteHandler = (req: Request, ctx?: any) => Promise<Response> | Response

export function toErrorResponse(req: Request, error: unknown): Response {
  const path = safePathname(req.url)
  const ex = toHttpException(error)
  const body = ex.toJSON(path)
  return NextResponse.json(body, { status: ex.status })
}

export function withErrorHandling(handler: RouteHandler): RouteHandler {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx)
    } catch (error) {
      // Optionally log here (ensure secrets safe)
      console.error('[API_ERROR]', error)
      return toErrorResponse(req, error)
    }
  }
}

// Utility to safely extract pathname
function safePathname(url: string): string {
  try {
    return new URL(url).pathname
  } catch {
    return url || '/'
  }
}

// Example usage (reference - do not import in route files):
// import { withErrorHandling, NotFoundException } from '@/utils/exceptions'
// export const GET = withErrorHandling(async (req) => {
//   const data = await loadData()
//   if (!data) throw new NotFoundException('Item not found')
//   return NextResponse.json({ data })
// })