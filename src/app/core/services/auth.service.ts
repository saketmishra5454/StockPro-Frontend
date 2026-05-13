import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject, Observable, map, tap } from 'rxjs';
import { environment } from '@env/environment';
import { UserProfile } from '../models/inventory.models';
import { AuthResponse, AuthUser, JwtClaims, LoginRequest, RegisterRequest, UserRole } from '../models/auth.models';
import { TokenStorageService } from './token-storage.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly tokenStorage = inject(TokenStorageService);
  private readonly currentUserSubject = new BehaviorSubject<AuthUser | null>(this.restoreUser());

  readonly currentUser$ = this.currentUserSubject.asObservable();
  readonly isAuthenticated$ = this.currentUser$.pipe(map((user) => Boolean(user)));

  get currentUser(): AuthUser | null {
    return this.currentUserSubject.value;
  }

  get token(): string | null {
    return this.tokenStorage.getToken();
  }

  login(payload: LoginRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${environment.apiBaseUrl}/auth/login`, payload).pipe(
      tap((response) => this.setSession(response))
    );
  }

  register(payload: RegisterRequest): Observable<AuthResponse> {
    const backendPayload = {
      fullName: payload.fullName ?? payload.name,
      email: payload.email,
      passwordHash: payload.passwordHash ?? payload.password,
      role: payload.role,
      phone: payload.phone,
      department: payload.department
    };

    return this.http.post<AuthResponse>(`${environment.apiBaseUrl}/auth/register`, backendPayload);
  }

  resetPassword(email: string, newPassword: string): Observable<Record<string, string>> {
    return this.http.post<Record<string, string>>(`${environment.apiBaseUrl}/auth/forgot-password`, { email, newPassword });
  }

  getUsers(): Observable<UserProfile[]> {
    return this.http.get<UserProfile[]>(`${environment.apiBaseUrl}/auth/users`);
  }

  updateProfile(id: number, payload: Partial<UserProfile>): Observable<UserProfile> {
    return this.http.put<UserProfile>(`${environment.apiBaseUrl}/auth/profile/${id}`, payload);
  }

  deactivateUser(id: number): Observable<Record<string, string>> {
    return this.http.put<Record<string, string>>(`${environment.apiBaseUrl}/auth/deactivate/${id}`, {});
  }

  activateUser(id: number): Observable<Record<string, string>> {
    return this.http.put<Record<string, string>>(`${environment.apiBaseUrl}/auth/activate/${id}`, {});
  }

  hasAnyRole(roles: UserRole[]): boolean {
    const role = this.currentUser?.role;
    return Boolean(role && roles.includes(role));
  }

  logout(redirectToLogin = true): void {
    this.tokenStorage.clear();
    this.currentUserSubject.next(null);

    if (redirectToLogin) {
      void this.router.navigate(['/auth/login']);
    }
  }

  private setSession(response: AuthResponse): void {
    this.tokenStorage.setToken(response.token);
    this.currentUserSubject.next(response.user ?? this.userFromToken(response.token));
  }

  private restoreUser(): AuthUser | null {
    const token = this.tokenStorage.getToken();

    if (!token) {
      return null;
    }

    const user = this.userFromToken(token);

    if (!user) {
      this.tokenStorage.clear();
    }

    return user;
  }

  private userFromToken(token: string): AuthUser | null {
    try {
      const claims = this.decodeToken(token);

      if (claims.exp && Date.now() >= claims.exp * 1000) {
        return null;
      }

      return {
        id: String(claims.userId),
        name: claims.sub.split('@')[0] || 'StockPro User',
        email: claims.sub,
        role: claims.role
      };
    } catch {
      return null;
    }
  }

  private decodeToken(token: string): JwtClaims {
    const payload = token.split('.')[1];

    if (!payload) {
      throw new Error('Invalid JWT payload');
    }

    const normalizedPayload = payload.replace(/-/g, '+').replace(/_/g, '/');
    const decodedPayload = decodeURIComponent(
      atob(normalizedPayload)
        .split('')
        .map((char) => `%${(`00${char.charCodeAt(0).toString(16)}`).slice(-2)}`)
        .join('')
    );

    return JSON.parse(decodedPayload) as JwtClaims;
  }
}
