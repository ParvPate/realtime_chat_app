import { HttpException } from './HttpException'

export class NotFoundException extends HttpException {
  constructor(message = 'Resource not found', details?: string[]) {
    super(message, 404, 'NOT_FOUND', details)
  }
}