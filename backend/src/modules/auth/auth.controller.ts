import {
  Body,
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Param,
  ParseEnumPipe,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import { RegistrationUploadKind } from '../storage/registration-upload-kind.enum';
import { AuthService } from './auth.service';
import type { AuthenticatedUser } from './auth.types';
import { CurrentUser } from './current-user.decorator';
import { RefreshSessionDto } from './dto/refresh-session.dto';
import { RegisterDriverDto } from './dto/register-driver.dto';
import { RegisterPassengerDto } from './dto/register-passenger.dto';
import { RequestOtpDto } from './dto/request-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { Public } from './public.decorator';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('otp/request')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request an SMS verification code' })
  requestOtp(@Body() input: RequestOtpDto, @Req() request: FastifyRequest) {
    return this.auth.requestOtp(input.phone, request.ip);
  }

  @Public()
  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify SMS code and sign in or continue registration',
  })
  verifyOtp(@Body() input: VerifyOtpDto, @Req() request: FastifyRequest) {
    return this.auth.verifyOtp(input, this.requestContext(request));
  }

  @Public()
  @Post('register/passenger')
  @ApiOperation({ summary: 'Register a passenger after phone verification' })
  registerPassenger(
    @Body() input: RegisterPassengerDto,
    @Req() request: FastifyRequest,
  ) {
    return this.auth.registerPassenger(input, this.requestContext(request));
  }

  @Public()
  @Post('register/driver')
  @ApiOperation({ summary: 'Register a driver for manual verification' })
  registerDriver(
    @Body() input: RegisterDriverDto,
    @Req() request: FastifyRequest,
  ) {
    return this.auth.registerDriver(input, this.requestContext(request));
  }

  @Public()
  @Post('registration/images/:kind')
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiOperation({
    summary: 'Upload an image using a phone registration token',
  })
  async uploadRegistrationImage(
    @Param('kind', new ParseEnumPipe(RegistrationUploadKind))
    kind: RegistrationUploadKind,
    @Req() request: FastifyRequest,
  ) {
    const file = await request.file();
    if (!file) {
      throw new BadRequestException({
        code: 'IMAGE_REQUIRED',
        message: 'Image file is required',
      });
    }
    return this.auth.uploadRegistrationImage(
      this.extractBearerToken(request.headers.authorization),
      kind,
      file,
    );
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Rotate refresh token and issue a new access token',
  })
  refresh(@Body() input: RefreshSessionDto, @Req() request: FastifyRequest) {
    return this.auth.refresh(input, request.ip);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke the current session' })
  logout(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.logout(user);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get the current user' })
  getCurrentUser(@CurrentUser() user: AuthenticatedUser) {
    return this.auth.getCurrentUser(user);
  }

  private requestContext(request: FastifyRequest) {
    const userAgent = request.headers['user-agent'];
    return {
      ipAddress: request.ip,
      deviceName:
        typeof userAgent === 'string' ? userAgent.slice(0, 160) : undefined,
    };
  }

  private extractBearerToken(header?: string): string {
    const [type, token] = header?.split(' ') ?? [];
    if (type !== 'Bearer' || !token) {
      throw new UnauthorizedException({
        code: 'REGISTRATION_TOKEN_REQUIRED',
        message: 'Registration token is required',
      });
    }
    return token;
  }
}
