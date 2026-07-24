import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, MoreThan, Repository } from 'typeorm';
import { UserStatus } from '../users/user-status.enum';
import { AuthSessionEntity } from './auth-session.entity';
import { AuthenticatedUser } from './auth.types';
import { IS_PUBLIC_KEY } from './public.decorator';
import { TokenService } from './token.service';

interface GuardedRequest {
  headers: {
    authorization?: string;
  };
  user?: AuthenticatedUser;
}

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: TokenService,
    @InjectRepository(AuthSessionEntity)
    private readonly sessions: Repository<AuthSessionEntity>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<GuardedRequest>();
    const token = this.extractBearerToken(request.headers.authorization);
    if (!token) {
      throw this.unauthorized();
    }

    const payload = await this.tokens.verifyAccessToken(token);
    const session = await this.sessions.findOne({
      where: {
        id: payload.sid,
        userId: payload.sub,
        revokedAt: IsNull(),
        expiresAt: MoreThan(new Date()),
      },
      relations: { user: true },
    });
    if (!session || session.user.status === UserStatus.Blocked) {
      throw this.unauthorized();
    }

    request.user = {
      userId: session.userId,
      sessionId: session.id,
      role: session.user.role,
    };
    return true;
  }

  private extractBearerToken(header?: string): string | undefined {
    const [type, token] = header?.split(' ') ?? [];
    return type === 'Bearer' && token ? token : undefined;
  }

  private unauthorized(): UnauthorizedException {
    return new UnauthorizedException({
      code: 'AUTHENTICATION_REQUIRED',
      message: 'Authentication required',
    });
  }
}
