// Base HTTP error types for Next.js API routes

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
    this.name = new.target.name
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