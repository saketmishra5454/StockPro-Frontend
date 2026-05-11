export interface ApiError {
  status: number;
  message: string;
  details?: unknown;
}

export interface PageResult<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  size: number;
  number: number;
}
