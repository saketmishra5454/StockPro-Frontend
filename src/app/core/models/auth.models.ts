export type UserRole = 'ADMIN' | 'MANAGER' | 'STAFF' | 'OFFICER';

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  name?: string;
  fullName?: string;
  email: string;
  password?: string;
  passwordHash?: string;
  role: UserRole;
  phone?: string;
  department?: string;
}

export interface AuthResponse {
  token: string;
  user?: AuthUser;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

export interface JwtClaims {
  sub: string;
  userId: number;
  role: UserRole;
  exp?: number;
  iat?: number;
}
