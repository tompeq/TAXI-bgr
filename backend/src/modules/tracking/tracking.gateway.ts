import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import { AuthService } from '../auth/auth.service';
import type { AuthenticatedUser } from '../auth/auth.types';
import { Public } from '../auth/public.decorator';
import { TrackingService } from './tracking.service';
import type {
  DriverLocationInput,
  DriverLocationSnapshot,
} from './tracking.service';

interface TrackingSocketData {
  user?: AuthenticatedUser;
  orderId?: string;
}

interface ClientToServerEvents {
  'tracking:join': (body: { orderId?: unknown }) => void;
  'driver:location': (body: DriverLocationInput) => void;
}

interface ServerToClientEvents {
  'driver:location': (snapshot: DriverLocationSnapshot) => void;
  'tracking:error': (error: { message: string }) => void;
}

type TrackingSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  TrackingSocketData
>;

@WebSocketGateway({
  namespace: '/tracking',
  cors: { origin: true, credentials: true },
  transports: ['websocket'],
})
@Public()
export class TrackingGateway implements OnGatewayConnection {
  private readonly logger = new Logger(TrackingGateway.name);

  @WebSocketServer()
  private server!: Server<
    ClientToServerEvents,
    ServerToClientEvents,
    Record<string, never>,
    TrackingSocketData
  >;

  constructor(
    private readonly auth: AuthService,
    private readonly tracking: TrackingService,
  ) {}

  async handleConnection(client: TrackingSocket): Promise<void> {
    const token = this.extractToken(client);
    if (!token) {
      client.disconnect(true);
      return;
    }
    try {
      client.data.user = await this.auth.authenticateAccessToken(token);
    } catch (error) {
      this.logger.debug(`Rejected tracking socket: ${String(error)}`);
      client.disconnect(true);
    }
  }

  @SubscribeMessage('tracking:join')
  async joinOrder(
    @ConnectedSocket() client: TrackingSocket,
    @MessageBody() body: { orderId?: unknown },
  ): Promise<void> {
    const user = client.data.user;
    const orderId = typeof body?.orderId === 'string' ? body.orderId : '';
    if (!user) {
      client.disconnect(true);
      return;
    }
    try {
      const snapshot = await this.tracking.joinOrder(orderId, user);
      if (client.data.orderId) {
        await client.leave(this.room(client.data.orderId));
      }
      client.data.orderId = orderId;
      await client.join(this.room(orderId));
      if (snapshot) {
        client.emit('driver:location', snapshot);
      }
    } catch (error) {
      client.emit('tracking:error', this.errorMessage(error));
    }
  }

  @SubscribeMessage('driver:location')
  async updateDriverLocation(
    @ConnectedSocket() client: TrackingSocket,
    @MessageBody() body: DriverLocationInput,
  ): Promise<void> {
    const user = client.data.user;
    if (!user) {
      client.disconnect(true);
      return;
    }
    try {
      const snapshot = await this.tracking.publishDriverLocation(body, user);
      client.data.orderId = snapshot.orderId;
      await client.join(this.room(snapshot.orderId));
      this.server
        .to(this.room(snapshot.orderId))
        .emit('driver:location', snapshot);
    } catch (error) {
      client.emit('tracking:error', this.errorMessage(error));
    }
  }

  private extractToken(client: TrackingSocket): string | null {
    const handshakeAuth = client.handshake.auth as Record<string, unknown>;
    const authToken = handshakeAuth.token;
    if (typeof authToken === 'string' && authToken.length > 0) {
      return authToken;
    }
    const authorization = client.handshake.headers.authorization;
    const [type, token] = authorization?.split(' ') ?? [];
    return type === 'Bearer' && token ? token : null;
  }

  private errorMessage(error: unknown): { message: string } {
    return {
      message:
        error instanceof Error ? error.message : 'Tracking request failed',
    };
  }

  private room(orderId: string): string {
    return `order:${orderId}`;
  }
}
