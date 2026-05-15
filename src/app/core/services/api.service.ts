import { HttpClient, HttpContext, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '@env/environment';
import { SILENT_HTTP_ERRORS } from '../interceptors/http-context.tokens';

type QueryValue = string | number | boolean | readonly (string | number | boolean)[];
interface ApiRequestOptions {
  silentErrors?: boolean;
  headers?: Record<string, string>;
}

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);

  get<T>(path: string, query?: Record<string, QueryValue | null | undefined>, options?: ApiRequestOptions): Observable<T> {
    return this.http.get<T>(this.url(path), {
      params: this.params(query),
      context: this.context(options)
    });
  }

  post<T>(path: string, body: unknown, options?: ApiRequestOptions): Observable<T> {
    return this.http.post<T>(this.url(path), body, { context: this.context(options), headers: this.headers(options) });
  }

  put<T>(path: string, body: unknown, options?: ApiRequestOptions): Observable<T> {
    return this.http.put<T>(this.url(path), body, { context: this.context(options), headers: this.headers(options) });
  }

  patch<T>(path: string, body: unknown, options?: ApiRequestOptions): Observable<T> {
    return this.http.patch<T>(this.url(path), body, { context: this.context(options) });
  }

  delete<T>(path: string, options?: ApiRequestOptions): Observable<T> {
    return this.http.delete<T>(this.url(path), { context: this.context(options) });
  }

  private url(path: string): string {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return `${environment.apiBaseUrl}${normalizedPath}`;
  }

  private params(query?: Record<string, QueryValue | null | undefined>): HttpParams {
    let params = new HttpParams();

    Object.entries(query ?? {}).forEach(([key, value]) => {
      if (value === null || value === undefined) {
        return;
      }

      if (Array.isArray(value)) {
        // Repeat query keys for multi-value filters
        value.forEach((item) => {
          params = params.append(key, String(item));
        });
        return;
      }

      params = params.set(key, String(value));
    });

    return params;
  }

  private context(options?: ApiRequestOptions): HttpContext {
    return new HttpContext().set(SILENT_HTTP_ERRORS, Boolean(options?.silentErrors));
  }

  private headers(options?: ApiRequestOptions): HttpHeaders | undefined {
    return options?.headers ? new HttpHeaders(options.headers) : undefined;
  }
}
