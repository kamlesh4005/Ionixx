import { AppErrorDetails } from '../models/order.model';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: AppErrorDetails[];

  constructor(statusCode: number, code: string, message: string, details?: AppErrorDetails[]) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}
