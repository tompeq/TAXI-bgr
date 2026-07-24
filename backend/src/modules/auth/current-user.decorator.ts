import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedUser } from './auth.types';

interface RequestWithUser {
  user: AuthenticatedUser;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    return context.switchToHttp().getRequest<RequestWithUser>().user;
  },
);
