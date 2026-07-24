import { UserRole } from '../users/user-role.enum';
import { UserStatus } from '../users/user-status.enum';

export type MobileUserRole = UserRole.Passenger | UserRole.Driver;

export interface AccessTokenPayload {
  sub: string;
  sid: string;
  role: UserRole;
  type: 'access';
  iat?: number;
  exp?: number;
}

export interface RegistrationTokenPayload {
  sub: string;
  jti: string;
  role: MobileUserRole;
  type: 'registration';
  iat?: number;
  exp?: number;
}

export interface AuthenticatedUser {
  userId: string;
  sessionId: string;
  role: UserRole;
}

export interface UserResponse {
  id: string;
  phone: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  driverVerificationStatus?: string;
  driverVerificationComment?: string | null;
}

export interface SessionResponse {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresInSeconds: number;
  user: UserResponse;
}
