import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/auth.types';
import { UserRole } from '../users/user-role.enum';

interface AdminRequest {
  user?: AuthenticatedUser;
}

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AdminRequest>();
    if (request.user?.role !== UserRole.Admin) {
      throw new ForbiddenException({
        code: 'ADMIN_ACCESS_REQUIRED',
        message: 'Administrator access is required',
      });
    }
    return true;
  }
}
