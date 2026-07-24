import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test, TestingModule } from '@nestjs/testing';
import { randomBytes, randomUUID } from 'node:crypto';
import request from 'supertest';
import sharp from 'sharp';
import { DataSource } from 'typeorm';
import { RedisService } from '../src/infrastructure/redis/redis.service';
import { StorageService } from '../src/modules/storage/storage.service';
import { AppModule } from './../src/app.module';
import { configureApp } from './../src/configure-app';

interface HealthResponse {
  status: string;
  info: {
    database: { status: string };
    redis: { status: string };
    storage: { status: string };
  };
}

interface OtpResponse {
  challengeId: string;
  debugCode: string;
}

interface RegistrationRequiredResponse {
  status: 'registration_required';
  registrationToken: string;
}

interface SessionResponse {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    phone: string;
    role: string;
    status: string;
    driverVerificationStatus?: string;
  };
}

interface DriverAvailabilityResponse {
  availableDrivers: number;
  hasAvailableDrivers: boolean;
  waitMinutes: number;
}

describe('API (e2e)', () => {
  let app: NestFastifyApplication;
  let database: DataSource;
  let redis: RedisService;
  let storage: StorageService;
  let approvedDriverSession: SessionResponse;
  let approvedDriverProfileId: string;
  const testStartedAt = new Date();
  const suffix = Date.now().toString().slice(-8);
  const passengerPhone = `+7914${suffix}`;
  const driverPhone = `+7924${suffix}`;
  const adminPhone = `+7934${suffix}`;
  const secondDriverPhone = `+7944${suffix}`;
  const dualRolePhone = `+7954${suffix}`;
  const testPhones = [
    passengerPhone,
    driverPhone,
    adminPhone,
    secondDriverPhone,
    dualRolePhone,
  ];
  const uploadedObjectKeys: string[] = [];

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    await configureApp(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    database = app.get(DataSource);
    redis = app.get(RedisService);
    storage = app.get(StorageService);
    await database.query(
      `
        INSERT INTO users (phone, name, role, status)
        VALUES ($1, 'Test Administrator', 'admin', 'active')
      `,
      [adminPhone],
    );
    await database.query(
      `
        WITH driver AS (
          INSERT INTO users (phone, name, role, status)
          VALUES ($1, 'Second Test Driver', 'driver', 'active')
          RETURNING id
        )
        INSERT INTO driver_profiles (
          user_id,
          full_name,
          license_photo_key,
          car_photo_keys,
          verification_status
        )
        SELECT
          id,
          'Second Test Driver',
          'tests/license.jpg',
          '["front", "rear", "left", "right"]'::jsonb,
          'approved'
        FROM driver
      `,
      [secondDriverPhone],
    );
    await database.query(
      `
        INSERT INTO driver_work_settings (driver_user_id)
        SELECT id FROM users WHERE phone = $1
      `,
      [secondDriverPhone],
    );
    await database.query(
      `
        INSERT INTO users (phone, name, role, status)
        VALUES ($1, 'Dual Role Passenger', 'passenger', 'active')
      `,
      [dualRolePhone],
    );
    await database.query(
      `
        WITH driver AS (
          INSERT INTO users (phone, name, role, status)
          VALUES ($1, 'Dual Role Driver', 'driver', 'active')
          RETURNING id
        )
        INSERT INTO driver_profiles (
          user_id,
          full_name,
          license_photo_key,
          car_photo_keys,
          verification_status
        )
        SELECT
          id,
          'Dual Role Driver',
          'tests/license.jpg',
          '["front", "rear", "left", "right"]'::jsonb,
          'approved'
        FROM driver
      `,
      [dualRolePhone],
    );
    await database.query(
      `
        INSERT INTO driver_work_settings (driver_user_id)
        SELECT id FROM users WHERE phone = $1 AND role = 'driver'
      `,
      [dualRolePhone],
    );
    await clearOtpKeys(redis);
  });

  it('/api/v1/health (GET)', () => {
    return request(app.getHttpServer())
      .get('/api/v1/health')
      .expect(200)
      .expect((response) => {
        const body = response.body as HealthResponse;
        expect(body.status).toBe('ok');
        expect(body.info.database.status).toBe('up');
        expect(body.info.redis.status).toBe('up');
        expect(body.info.storage.status).toBe('up');
      });
  });

  it('allows browser PATCH requests from the admin panel origin', () => {
    return request(app.getHttpServer())
      .options(
        '/api/v1/admin/drivers/00000000-0000-0000-0000-000000000000/review',
      )
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'PATCH')
      .set('Access-Control-Request-Headers', 'authorization,content-type')
      .expect(204)
      .expect(({ headers }) => {
        expect(headers['access-control-allow-origin']).toBe(
          'http://localhost:5173',
        );
        expect(headers['access-control-allow-methods']).toContain('PATCH');
        expect(headers['access-control-allow-headers']).toContain(
          'Authorization',
        );
      });
  });

  it('allows repeated OTP requests while mock SMS is active', async () => {
    const requests = await Promise.all(
      Array.from({ length: 8 }, () => requestOtp(app, passengerPhone)),
    );

    expect(requests).toHaveLength(8);
    expect(requests.every((item) => item.debugCode.length === 6)).toBe(true);
  });

  it('authenticates the selected profile when a phone has both roles', async () => {
    const passengerSession = await signInExistingUser(
      app,
      dualRolePhone,
      'passenger',
    );
    const driverSession = await signInExistingUser(
      app,
      dualRolePhone,
      'driver',
    );

    expect(passengerSession.user).toMatchObject({
      phone: dualRolePhone,
      role: 'passenger',
    });
    expect(driverSession.user).toMatchObject({
      phone: dualRolePhone,
      role: 'driver',
      driverVerificationStatus: 'approved',
    });
    expect(driverSession.user.id).not.toBe(passengerSession.user.id);
  });

  it('registers a passenger, rotates tokens and revokes the session', async () => {
    const otp = await requestOtp(app, passengerPhone);

    await request(app.getHttpServer())
      .post('/api/v1/auth/otp/verify')
      .send({
        challengeId: otp.challengeId,
        code: '000000',
        role: 'passenger',
      })
      .expect(401)
      .expect(({ body }) => {
        expect((body as { code: string }).code).toBe('OTP_INVALID');
      });

    const verification = await request(app.getHttpServer())
      .post('/api/v1/auth/otp/verify')
      .send({
        challengeId: otp.challengeId,
        code: otp.debugCode,
        role: 'passenger',
      })
      .expect(200);
    const registration = verification.body as RegistrationRequiredResponse;
    expect(registration.status).toBe('registration_required');

    const registered = await request(app.getHttpServer())
      .post('/api/v1/auth/register/passenger')
      .send({
        registrationToken: registration.registrationToken,
        name: 'Test Passenger',
        deviceName: 'e2e',
      })
      .expect(201);
    const session = registered.body as SessionResponse;
    expect(session.user).toMatchObject({
      phone: passengerPhone,
      role: 'passenger',
      status: 'active',
    });

    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .expect(200)
      .expect(({ body }) => {
        expect((body as SessionResponse['user']).phone).toBe(passengerPhone);
      });

    const refreshed = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: session.refreshToken })
      .expect(200);
    const rotatedSession = refreshed.body as SessionResponse;
    expect(rotatedSession.refreshToken).not.toBe(session.refreshToken);

    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: session.refreshToken })
      .expect(401);

    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Authorization', `Bearer ${rotatedSession.accessToken}`)
      .expect(204);

    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${rotatedSession.accessToken}`)
      .expect(401);
  });

  it('registers a driver in pending verification state', async () => {
    const otp = await requestOtp(app, driverPhone);
    const verification = await request(app.getHttpServer())
      .post('/api/v1/auth/otp/verify')
      .send({
        challengeId: otp.challengeId,
        code: otp.debugCode,
        role: 'driver',
      })
      .expect(200);
    const registration = verification.body as RegistrationRequiredResponse;

    await request(app.getHttpServer())
      .post('/api/v1/auth/registration/images/license')
      .set('Authorization', `Bearer ${registration.registrationToken}`)
      .attach('file', Buffer.alloc(256, 0x89), {
        filename: 'fake.png',
        contentType: 'image/png',
      })
      .expect(400)
      .expect(({ body }) => {
        expect((body as { code: string }).code).toBe(
          'IMAGE_FORMAT_UNSUPPORTED',
        );
      });

    const licensePhotoKey = await uploadRegistrationImage(
      app,
      registration.registrationToken,
      'license',
    );
    const licensePhotoBackKey = await uploadRegistrationImage(
      app,
      registration.registrationToken,
      'license_back',
    );
    const carPhotoKeys = await Promise.all(
      ['car_front', 'car_rear', 'car_left', 'car_right'].map((kind) =>
        uploadRegistrationImage(app, registration.registrationToken, kind),
      ),
    );
    uploadedObjectKeys.push(
      licensePhotoKey,
      licensePhotoBackKey,
      ...carPhotoKeys,
    );

    const registered = await request(app.getHttpServer())
      .post('/api/v1/auth/register/driver')
      .send({
        registrationToken: registration.registrationToken,
        fullName: 'Test Driver Full Name',
        licensePhotoKey,
        licensePhotoBackKey,
        vehicleMakeModel: 'Toyota Corolla',
        vehicleColor: 'Белый',
        vehiclePlate: 'А123ВС27',
        carPhotoKeys,
        deviceName: 'e2e',
      })
      .expect(201);
    approvedDriverSession = registered.body as SessionResponse;
    expect(approvedDriverSession.user).toMatchObject({
      phone: driverPhone,
      role: 'driver',
      status: 'pending_verification',
      driverVerificationStatus: 'pending',
    });

    const adminSession = await signInExistingUser(app, adminPhone, 'admin');
    const applications = await request(app.getHttpServer())
      .get('/api/v1/admin/drivers?status=pending')
      .set('Authorization', `Bearer ${adminSession.accessToken}`)
      .expect(200);
    const application = (
      applications.body as {
        items: Array<{ id: string; phone: string }>;
      }
    ).items.find((item) => item.phone === driverPhone);
    expect(application).toBeDefined();
    approvedDriverProfileId = application!.id;

    await request(app.getHttpServer())
      .get(`/api/v1/admin/drivers/${application!.id}`)
      .set('Authorization', `Bearer ${adminSession.accessToken}`)
      .expect(200)
      .expect(({ body }) => {
        const detail = body as {
          licensePhotoUrl: string;
          licensePhotoBackUrl: string;
          carPhotoUrls: string[];
          vehiclePlate: string;
        };
        expect(detail.licensePhotoUrl).toContain('http');
        expect(detail.licensePhotoBackUrl).toContain('http');
        expect(detail.carPhotoUrls).toHaveLength(4);
        expect(detail.vehiclePlate).toBe('А123ВС27');
      });

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/drivers/${application!.id}/review`)
      .set('Authorization', `Bearer ${adminSession.accessToken}`)
      .send({ decision: 'approve' })
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          verificationStatus: 'approved',
          userStatus: 'active',
        });
        expect((body as { history: unknown[] }).history).toHaveLength(1);
      });

    await request(app.getHttpServer())
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${approvedDriverSession.accessToken}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          status: 'active',
          driverVerificationStatus: 'approved',
        });
      });
  });

  it('persists a passenger support conversation and an administrator reply', async () => {
    await redis.connection.del(
      `auth:otp:cooldown:${adminPhone}`,
      `auth:otp:cooldown:${passengerPhone}`,
    );
    const adminSession = await signInExistingUser(app, adminPhone, 'admin');
    const passengerSession = await signInExistingUser(
      app,
      passengerPhone,
      'passenger',
    );
    const passengerAuthorization = `Bearer ${passengerSession.accessToken}`;
    const adminAuthorization = `Bearer ${adminSession.accessToken}`;

    await request(app.getHttpServer())
      .get('/api/v1/support/conversation')
      .set('Authorization', passengerAuthorization)
      .expect(200)
      .expect(({ body }) => {
        expect(body).toBeNull();
      });

    const created = await request(app.getHttpServer())
      .post('/api/v1/support/messages')
      .set('Authorization', passengerAuthorization)
      .send({ body: 'Нужна помощь с заказом' })
      .expect(200);
    const conversation = created.body as { id: string; messages: unknown[] };
    expect(conversation.messages).toHaveLength(1);

    await request(app.getHttpServer())
      .get('/api/v1/admin/support/conversations')
      .set('Authorization', adminAuthorization)
      .expect(200)
      .expect(({ body }) => {
        const ids = (body as { items: Array<{ id: string }> }).items.map(
          (item) => item.id,
        );
        expect(ids).toContain(conversation.id);
      });

    await request(app.getHttpServer())
      .post(`/api/v1/admin/support/conversations/${conversation.id}/messages`)
      .set('Authorization', adminAuthorization)
      .send({ body: 'Мы уже разбираемся' })
      .expect(200)
      .expect(({ body }) => {
        expect((body as { messages: unknown[] }).messages).toHaveLength(2);
      });

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/support/conversations/${conversation.id}`)
      .set('Authorization', adminAuthorization)
      .send({ status: 'closed' })
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({ status: 'closed' });
      });

    await request(app.getHttpServer())
      .post('/api/v1/support/messages')
      .set('Authorization', passengerAuthorization)
      .send({ body: 'Спасибо, вопрос решен' })
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({ status: 'open' });
        expect((body as { messages: unknown[] }).messages).toHaveLength(3);
      });
  });

  it('uses administrator tariffs and protects the driver order lifecycle', async () => {
    await redis.connection.del(
      `auth:otp:cooldown:${adminPhone}`,
      `auth:otp:cooldown:${passengerPhone}`,
    );
    const adminSession = await signInExistingUser(app, adminPhone, 'admin');
    const passengerSession = await signInExistingUser(
      app,
      passengerPhone,
      'passenger',
    );
    const secondDriverSession = await signInExistingUser(
      app,
      secondDriverPhone,
      'driver',
    );
    const authorization = {
      passenger: `Bearer ${passengerSession.accessToken}`,
      driver: `Bearer ${approvedDriverSession.accessToken}`,
      secondDriver: `Bearer ${secondDriverSession.accessToken}`,
      admin: `Bearer ${adminSession.accessToken}`,
    };
    const scheduledFor = nextVladivostokNoon();

    await request(app.getHttpServer())
      .get('/api/v1/admin/tariffs')
      .set('Authorization', authorization.admin)
      .expect(200)
      .expect(({ body }) => {
        expect((body as { items: unknown[] }).items).toHaveLength(10);
      });

    await request(app.getHttpServer())
      .patch('/api/v1/admin/tariffs/taxi/kombinat')
      .set('Authorization', authorization.admin)
      .send({ dayFare: 275, eveningFare: 350, nightFare: 500 })
      .expect(200)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          kind: 'taxi',
          zone: 'kombinat',
          dayFare: 275,
        });
      });

    try {
      await request(app.getHttpServer())
        .get('/api/v1/orders/board')
        .set('Authorization', authorization.driver)
        .expect(409)
        .expect(({ body }) => {
          expect((body as { code: string }).code).toBe('DRIVER_NOT_ONLINE');
        });

      const availabilityBeforeStart = await request(app.getHttpServer())
        .get('/api/v1/orders/availability?kind=taxi')
        .set('Authorization', authorization.passenger)
        .expect(200);
      const availabilityBeforeStartBody =
        availabilityBeforeStart.body as DriverAvailabilityResponse;
      expect(typeof availabilityBeforeStartBody.hasAvailableDrivers).toBe(
        'boolean',
      );
      expect(typeof availabilityBeforeStartBody.waitMinutes).toBe('number');
      const availableDriversBeforeStart =
        availabilityBeforeStartBody.availableDrivers;

      await request(app.getHttpServer())
        .patch('/api/v1/driver/work/settings')
        .set('Authorization', authorization.driver)
        .send({
          acceptsTaxi: true,
          acceptsDelivery: false,
          backgroundNotifications: true,
          nightNotifications: true,
        })
        .expect(200)
        .expect(({ body }) => {
          expect(body).toMatchObject({
            status: 'offline',
            settings: {
              acceptsTaxi: true,
              acceptsDelivery: false,
              backgroundNotifications: true,
              nightNotifications: true,
            },
          });
        });

      for (const token of [authorization.driver, authorization.secondDriver]) {
        await request(app.getHttpServer())
          .post('/api/v1/driver/work/start')
          .set('Authorization', token)
          .expect(200)
          .expect(({ body }) => {
            expect(body).toMatchObject({ status: 'online' });
          });
      }

      await request(app.getHttpServer())
        .get('/api/v1/orders/availability?kind=taxi')
        .set('Authorization', authorization.passenger)
        .expect(200)
        .expect(({ body }) => {
          expect(body).toMatchObject({ hasAvailableDrivers: true });
          expect(
            (body as { availableDrivers: number }).availableDrivers,
          ).toBeGreaterThanOrEqual(availableDriversBeforeStart + 2);
        });

      await request(app.getHttpServer())
        .post('/api/v1/driver/work/break')
        .set('Authorization', authorization.driver)
        .send({ minutes: 10 })
        .expect(200)
        .expect(({ body }) => {
          expect(body).toMatchObject({ status: 'break' });
        });
      await request(app.getHttpServer())
        .get('/api/v1/orders/board')
        .set('Authorization', authorization.driver)
        .expect(409)
        .expect(({ body }) => {
          expect((body as { code: string }).code).toBe('DRIVER_ON_BREAK');
        });
      await request(app.getHttpServer())
        .post('/api/v1/driver/work/resume')
        .set('Authorization', authorization.driver)
        .expect(200)
        .expect(({ body }) => {
          expect(body).toMatchObject({ status: 'online' });
        });

      const orderBody = {
        pickup: {
          address: 'Кирова, 12',
          latitude: 52.3661,
          longitude: 140.4358,
        },
        destination: {
          address: 'Комбинат',
          latitude: 52.3585,
          longitude: 140.4217,
        },
        kind: 'taxi',
        paymentMethod: 'cash',
        passengerCount: 2,
        roundTrip: false,
      };
      const scheduledBody = {
        ...orderBody,
        scheduledFor,
      };

      await request(app.getHttpServer())
        .post('/api/v1/orders/quote')
        .set('Authorization', authorization.passenger)
        .send({
          ...scheduledBody,
          destination: {
            address: 'Нижняя Гавань',
            latitude: 52.43778,
            longitude: 140.42528,
          },
        })
        .expect(200)
        .expect(({ body }) => {
          expect(body).toMatchObject({
            fareAmount: 700,
            tariffPeriod: 'day',
            pricingMode: 'fixed',
            destinationZone: 'lower_harbor',
          });
        });

      await request(app.getHttpServer())
        .post('/api/v1/orders/quote')
        .set('Authorization', authorization.passenger)
        .send({
          ...scheduledBody,
          destination: {
            address: 'Точка за пределами зон',
            latitude: 52.45,
            longitude: 140.47,
          },
          routeDistanceMeters: 12100,
        })
        .expect(200)
        .expect(({ body }) => {
          expect(body).toMatchObject({
            fareAmount: 780,
            tariffPeriod: 'day',
            pickupZone: 'upper_bgr',
            destinationZone: 'custom',
            pricingMode: 'distance',
            routeDistanceMeters: 12100,
            distanceRatePerKm: 60,
          });
        });

      await request(app.getHttpServer())
        .post('/api/v1/orders/quote')
        .set('Authorization', authorization.passenger)
        .send(scheduledBody)
        .expect(200)
        .expect(({ body }) => {
          expect(body).toMatchObject({
            fareAmount: 275,
            tariffPeriod: 'day',
          });
        });

      await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Authorization', authorization.passenger)
        .send({ ...scheduledBody, fareAmount: 1 })
        .expect(400);

      const scheduledCreated = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Authorization', authorization.passenger)
        .send(scheduledBody)
        .expect(201);
      const scheduledOrder = scheduledCreated.body as {
        id: string;
        status: string;
        fareAmount: number;
        tariffPeriod: string;
      };
      expect(scheduledOrder).toMatchObject({
        status: 'open',
        fareAmount: 275,
        tariffPeriod: 'day',
      });

      await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Authorization', authorization.passenger)
        .send(orderBody)
        .expect(409)
        .expect(({ body }) => {
          expect((body as { code: string }).code).toBe(
            'PASSENGER_ALREADY_HAS_ACTIVE_ORDER',
          );
        });

      await request(app.getHttpServer())
        .get('/api/v1/orders/board')
        .set('Authorization', authorization.passenger)
        .expect(403);

      await request(app.getHttpServer())
        .get('/api/v1/orders/board')
        .set('Authorization', authorization.driver)
        .expect(200)
        .expect(({ body }) => {
          const ids = (body as { items: Array<{ id: string }> }).items.map(
            (item) => item.id,
          );
          expect(ids).not.toContain(scheduledOrder.id);
        });

      await request(app.getHttpServer())
        .post(`/api/v1/orders/${scheduledOrder.id}/accept`)
        .set('Authorization', authorization.driver)
        .expect(409)
        .expect(({ body }) => {
          expect((body as { code: string }).code).toBe(
            'SCHEDULED_ORDER_NOT_AVAILABLE',
          );
        });

      await database.query(
        "UPDATE orders SET created_at = NOW() - INTERVAL '7 minutes' WHERE id = $1",
        [scheduledOrder.id],
      );
      await request(app.getHttpServer())
        .post(`/api/v1/orders/${scheduledOrder.id}/cancel`)
        .set('Authorization', authorization.passenger)
        .send({ reason: 'Изменились планы' })
        .expect(200)
        .expect(({ body }) => {
          expect(body).toMatchObject({
            status: 'canceled',
            cancellationFeeAmount: 100,
          });
        });

      const quoted = await request(app.getHttpServer())
        .post('/api/v1/orders/quote')
        .set('Authorization', authorization.passenger)
        .send(orderBody)
        .expect(200);
      const immediateQuote = quoted.body as {
        fareAmount: number;
        tariffPeriod: string;
      };
      const created = await request(app.getHttpServer())
        .post('/api/v1/orders')
        .set('Authorization', authorization.passenger)
        .send(orderBody)
        .expect(201);
      const order = created.body as {
        id: string;
        status: string;
        fareAmount: number;
        tariffPeriod: string;
      };
      expect(order).toMatchObject({
        status: 'open',
        fareAmount: immediateQuote.fareAmount,
        tariffPeriod: immediateQuote.tariffPeriod,
      });

      await request(app.getHttpServer())
        .get('/api/v1/orders/board')
        .set('Authorization', authorization.driver)
        .expect(200)
        .expect(({ body }) => {
          const ids = (body as { items: Array<{ id: string }> }).items.map(
            (item) => item.id,
          );
          expect(ids).toContain(order.id);
        });

      const acceptRequests = await Promise.all([
        request(app.getHttpServer())
          .post(`/api/v1/orders/${order.id}/accept`)
          .set('Authorization', authorization.driver),
        request(app.getHttpServer())
          .post(`/api/v1/orders/${order.id}/accept`)
          .set('Authorization', authorization.driver),
      ]);
      expect(acceptRequests.map((response) => response.status).sort()).toEqual([
        200, 409,
      ]);

      for (const path of ['break', 'end']) {
        const call = request(app.getHttpServer())
          .post(`/api/v1/driver/work/${path}`)
          .set('Authorization', authorization.driver);
        if (path === 'break') {
          call.send({ minutes: 10 });
        }
        await call.expect(409).expect(({ body }) => {
          expect((body as { code: string }).code).toBe(
            'DRIVER_HAS_ACTIVE_ORDER',
          );
        });
      }

      await request(app.getHttpServer())
        .patch(`/api/v1/orders/${order.id}/status`)
        .set('Authorization', authorization.driver)
        .send({ status: 'completed' })
        .expect(409)
        .expect(({ body }) => {
          expect((body as { code: string }).code).toBe(
            'ORDER_STATUS_TRANSITION_INVALID',
          );
        });

      for (const status of ['driver_en_route', 'arrived', 'started']) {
        await request(app.getHttpServer())
          .patch(`/api/v1/orders/${order.id}/status`)
          .set('Authorization', authorization.driver)
          .send({ status })
          .expect(200);
      }
      await request(app.getHttpServer())
        .patch(`/api/v1/orders/${order.id}/status`)
        .set('Authorization', authorization.driver)
        .send({ status: 'completed' })
        .expect(409)
        .expect(({ body }) => {
          expect((body as { code: string }).code).toBe(
            'ORDER_COMPLETION_LOCATION_REQUIRED',
          );
        });
      await setDriverTrackingLocation(
        redis,
        order.id,
        approvedDriverSession.user.id,
        52.3661,
        140.4358,
      );
      await request(app.getHttpServer())
        .patch(`/api/v1/orders/${order.id}/status`)
        .set('Authorization', authorization.driver)
        .send({ status: 'completed' })
        .expect(409)
        .expect(({ body }) => {
          expect((body as { code: string }).code).toBe(
            'ORDER_COMPLETION_TOO_FAR',
          );
        });
      await setDriverTrackingLocation(
        redis,
        order.id,
        approvedDriverSession.user.id,
        52.3585,
        140.4217,
      );
      await request(app.getHttpServer())
        .patch(`/api/v1/orders/${order.id}/status`)
        .set('Authorization', authorization.driver)
        .send({ status: 'completed' })
        .expect(200);

      await request(app.getHttpServer())
        .get('/api/v1/orders/active')
        .set('Authorization', authorization.driver)
        .expect(200)
        .expect(({ body }) => {
          expect(body).toBeNull();
        });

      await request(app.getHttpServer())
        .get('/api/v1/driver/work')
        .set('Authorization', authorization.driver)
        .expect(200)
        .expect(({ body }) => {
          expect(body).toMatchObject({
            status: 'online',
            earnings24h: order.fareAmount,
            visibilityDelaySeconds: 25,
          });
        });
      await request(app.getHttpServer())
        .get('/api/v1/driver/work')
        .set('Authorization', authorization.secondDriver)
        .expect(200)
        .expect(({ body }) => {
          expect(body).toMatchObject({
            status: 'online',
            earnings24h: 0,
            visibilityDelaySeconds: 0,
          });
        });

      for (const token of [authorization.driver, authorization.secondDriver]) {
        await request(app.getHttpServer())
          .post('/api/v1/driver/work/end')
          .set('Authorization', token)
          .expect(200)
          .expect(({ body }) => {
            expect(body).toMatchObject({ status: 'offline' });
          });
      }

      await request(app.getHttpServer())
        .patch(
          `/api/v1/admin/drivers/${approvedDriverProfileId}/commission-debt`,
        )
        .set('Authorization', authorization.admin)
        .send({ targetDebt: 5000, note: 'Debt limit regression test' })
        .expect(200)
        .expect(({ body }) => {
          expect(body).toMatchObject({
            finance: { commissionDebt: 5000 },
          });
        });

      await request(app.getHttpServer())
        .get('/api/v1/driver/work')
        .set('Authorization', authorization.driver)
        .expect(200)
        .expect(({ body }) => {
          expect(body).toMatchObject({
            status: 'offline',
            commissionDebt: 5000,
            commissionDebtStatus: 'blocked',
          });
        });

      await request(app.getHttpServer())
        .post('/api/v1/driver/work/start')
        .set('Authorization', authorization.driver)
        .expect(409)
        .expect(({ body }) => {
          expect((body as { code: string }).code).toBe(
            'COMMISSION_DEBT_LIMIT_REACHED',
          );
        });
    } finally {
      await request(app.getHttpServer())
        .patch(
          `/api/v1/admin/drivers/${approvedDriverProfileId}/commission-debt`,
        )
        .set('Authorization', authorization.admin)
        .send({ targetDebt: 0, note: 'Reset e2e test debt' })
        .expect(200);
      await request(app.getHttpServer())
        .patch('/api/v1/admin/tariffs/taxi/kombinat')
        .set('Authorization', authorization.admin)
        .send({ dayFare: 250, eveningFare: 350, nightFare: 500 })
        .expect(200);
    }
  });

  it('accepts one due road survey response and rejects duplicate or spoofed submissions', async () => {
    const driverSession = await signInExistingUser(app, driverPhone, 'driver');
    const authorization = `Bearer ${driverSession.accessToken}`;

    const responses = await Promise.all([
      request(app.getHttpServer())
        .post('/api/v1/driver/surveys/road_bgr/responses')
        .set('Authorization', authorization)
        .send({ answer: 'good' }),
      request(app.getHttpServer())
        .post('/api/v1/driver/surveys/road_bgr/responses')
        .set('Authorization', authorization)
        .send({ answer: 'bad' }),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 409,
    ]);
    expect(
      (
        responses.find((response) => response.status === 409)?.body as {
          code: string;
        }
      ).code,
    ).toBe('SURVEY_NOT_DUE');

    await request(app.getHttpServer())
      .post('/api/v1/driver/surveys/road_harbor/responses')
      .set('Authorization', authorization)
      .send({ answer: 'bad', orderId: randomUUID() })
      .expect(409)
      .expect(({ body }) => {
        expect((body as { code: string }).code).toBe('SURVEY_NOT_DUE');
      });
  });

  it('enforces delayed direct acceptance and serializes commission settlements', async () => {
    await redis.connection.del(
      `auth:otp:cooldown:${adminPhone}`,
      `auth:otp:cooldown:${passengerPhone}`,
      `auth:otp:cooldown:${driverPhone}`,
      `auth:otp:cooldown:${secondDriverPhone}`,
    );
    const adminSession = await signInExistingUser(app, adminPhone, 'admin');
    const passengerSession = await signInExistingUser(
      app,
      passengerPhone,
      'passenger',
    );
    const driverSession = await signInExistingUser(app, driverPhone, 'driver');
    const secondDriverSession = await signInExistingUser(
      app,
      secondDriverPhone,
      'driver',
    );
    const authorization = {
      admin: `Bearer ${adminSession.accessToken}`,
      passenger: `Bearer ${passengerSession.accessToken}`,
      driver: `Bearer ${driverSession.accessToken}`,
      secondDriver: `Bearer ${secondDriverSession.accessToken}`,
    };
    const orderBody = {
      pickup: {
        address: 'Кирова, 12',
        latitude: 52.3661,
        longitude: 140.4358,
      },
      destination: {
        address: 'Комбинат',
        latitude: 52.3585,
        longitude: 140.4217,
      },
      kind: 'taxi',
      paymentMethod: 'cash',
      passengerCount: 1,
      roundTrip: false,
    };

    for (const token of [authorization.driver, authorization.secondDriver]) {
      await request(app.getHttpServer())
        .post('/api/v1/driver/work/start')
        .set('Authorization', token)
        .expect(200);
    }

    const firstOrder = await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set('Authorization', authorization.passenger)
      .send(orderBody)
      .expect(201);
    const firstOrderId = (firstOrder.body as { id: string }).id;
    await database.query(
      "UPDATE orders SET created_at = NOW() - INTERVAL '1 minute' WHERE id = $1",
      [firstOrderId],
    );
    await request(app.getHttpServer())
      .post(`/api/v1/orders/${firstOrderId}/accept`)
      .set('Authorization', authorization.driver)
      .expect(200);
    for (const status of [
      'driver_en_route',
      'arrived',
      'started',
      'completed',
    ]) {
      if (status === 'completed') {
        await setDriverTrackingLocation(
          redis,
          firstOrderId,
          driverSession.user.id,
          52.3585,
          140.4217,
        );
      }
      await request(app.getHttpServer())
        .patch(`/api/v1/orders/${firstOrderId}/status`)
        .set('Authorization', authorization.driver)
        .send({ status })
        .expect(200);
    }

    const delayedOrder = await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set('Authorization', authorization.passenger)
      .send(orderBody)
      .expect(201);
    const delayedOrderId = (delayedOrder.body as { id: string }).id;
    await request(app.getHttpServer())
      .post(`/api/v1/orders/${delayedOrderId}/accept`)
      .set('Authorization', authorization.driver)
      .expect(409)
      .expect(({ body }) => {
        expect((body as { code: string }).code).toBe('ORDER_NOT_YET_VISIBLE');
      });
    await request(app.getHttpServer())
      .post(`/api/v1/orders/${delayedOrderId}/accept`)
      .set('Authorization', authorization.secondDriver)
      .expect(200);
    for (const status of [
      'driver_en_route',
      'arrived',
      'started',
      'completed',
    ]) {
      if (status === 'completed') {
        await setDriverTrackingLocation(
          redis,
          delayedOrderId,
          secondDriverSession.user.id,
          52.3585,
          140.4217,
        );
      }
      await request(app.getHttpServer())
        .patch(`/api/v1/orders/${delayedOrderId}/status`)
        .set('Authorization', authorization.secondDriver)
        .send({ status })
        .expect(200);
    }

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/drivers/${approvedDriverProfileId}/commission-debt`)
      .set('Authorization', authorization.admin)
      .send({ targetDebt: 100, note: 'Concurrent settlement regression test' })
      .expect(200);
    const settlements = await Promise.all([
      request(app.getHttpServer())
        .post(
          `/api/v1/admin/drivers/${approvedDriverProfileId}/commission-settlements`,
        )
        .set('Authorization', authorization.admin)
        .send({ amount: 100 }),
      request(app.getHttpServer())
        .post(
          `/api/v1/admin/drivers/${approvedDriverProfileId}/commission-settlements`,
        )
        .set('Authorization', authorization.admin)
        .send({ amount: 100 }),
    ]);
    expect(settlements.map((response) => response.status).sort()).toEqual([
      201, 409,
    ]);
    await request(app.getHttpServer())
      .get('/api/v1/admin/driver-finance')
      .set('Authorization', authorization.admin)
      .expect(200)
      .expect(({ body }) => {
        const item = (
          body as {
            items: Array<{ profileId: string; commissionDebt: number }>;
          }
        ).items.find((value) => value.profileId === approvedDriverProfileId);
        expect(item).toMatchObject({ commissionDebt: 0 });
      });

    for (const token of [authorization.driver, authorization.secondDriver]) {
      await request(app.getHttpServer())
        .post('/api/v1/driver/work/end')
        .set('Authorization', token)
        .expect(200);
    }
  });

  afterAll(async () => {
    await storage.removeObjects(uploadedObjectKeys);
    await database.query(
      `
        DELETE FROM activity_events
        WHERE actor_user_id IN (SELECT id FROM users WHERE phone = ANY($1))
      `,
      [testPhones],
    );
    await database.query(
      `
        DELETE FROM outbox_events
        WHERE aggregate_id IN (SELECT id FROM users WHERE phone = ANY($1))
           OR aggregate_id IN (
             SELECT id FROM driver_profiles
             WHERE user_id IN (SELECT id FROM users WHERE phone = ANY($1))
           )
           OR (
             aggregate_type = 'order'
             AND aggregate_id IN (
               SELECT id FROM orders
               WHERE passenger_user_id IN (
                 SELECT id FROM users WHERE phone = ANY($1)
               )
             )
           )
           OR (
             aggregate_type = 'tariff_setting'
             AND occurred_at >= $2
           )
           OR (
             aggregate_type = 'driver_shift'
             AND aggregate_id IN (
               SELECT id FROM driver_shifts
               WHERE driver_user_id IN (
                 SELECT id FROM users WHERE phone = ANY($1)
               )
             )
           )
      `,
      [testPhones, testStartedAt],
    );
    await database.query(
      `
        DELETE FROM auth_sessions
        WHERE user_id IN (SELECT id FROM users WHERE phone = ANY($1))
      `,
      [testPhones],
    );
    await database.query(
      `
        DELETE FROM driver_verification_reviews
        WHERE driver_profile_id IN (
          SELECT id FROM driver_profiles
          WHERE user_id IN (SELECT id FROM users WHERE phone = ANY($1))
        )
      `,
      [testPhones],
    );
    await database.query(
      `
        DELETE FROM driver_shifts
        WHERE driver_user_id IN (
          SELECT id FROM users WHERE phone = ANY($1)
        )
      `,
      [testPhones],
    );
    await database.query(
      `
        DELETE FROM support_messages
        WHERE conversation_id IN (
          SELECT id FROM support_conversations
          WHERE user_id IN (SELECT id FROM users WHERE phone = ANY($1))
        )
        OR sender_user_id IN (SELECT id FROM users WHERE phone = ANY($1))
      `,
      [testPhones],
    );
    await database.query(
      `
        DELETE FROM support_conversations
        WHERE user_id IN (SELECT id FROM users WHERE phone = ANY($1))
      `,
      [testPhones],
    );
    await database.query(
      `
        DELETE FROM driver_commission_ledger_entries
        WHERE driver_user_id IN (
          SELECT id FROM users WHERE phone = ANY($1)
        )
        OR order_id IN (
          SELECT id FROM orders
          WHERE passenger_user_id IN (
            SELECT id FROM users WHERE phone = ANY($1)
          )
          OR driver_user_id IN (
            SELECT id FROM users WHERE phone = ANY($1)
          )
        )
      `,
      [testPhones],
    );
    await database.query(
      `
        DELETE FROM orders
        WHERE passenger_user_id IN (
          SELECT id FROM users WHERE phone = ANY($1)
        )
        OR driver_user_id IN (
          SELECT id FROM users WHERE phone = ANY($1)
        )
      `,
      [testPhones],
    );
    await database.query(
      `
        DELETE FROM driver_profiles
        WHERE user_id IN (SELECT id FROM users WHERE phone = ANY($1))
      `,
      [testPhones],
    );
    await database.query(
      `
        DELETE FROM driver_work_settings
        WHERE driver_user_id IN (
          SELECT id FROM users WHERE phone = ANY($1)
        )
      `,
      [testPhones],
    );
    await database.query('DELETE FROM users WHERE phone = ANY($1)', [
      testPhones,
    ]);
    await clearOtpKeys(redis);
    await app.close();
  });
});

async function requestOtp(
  app: NestFastifyApplication,
  phone: string,
): Promise<OtpResponse> {
  const response = await request(app.getHttpServer())
    .post('/api/v1/auth/otp/request')
    .send({ phone })
    .expect(200);
  const otp = response.body as OtpResponse;
  expect(otp.challengeId).toBeTruthy();
  expect(otp.debugCode).toMatch(/^[0-9]{6}$/);
  return otp;
}

async function signInExistingUser(
  app: NestFastifyApplication,
  phone: string,
  role: 'passenger' | 'driver' | 'admin',
): Promise<SessionResponse> {
  const otp = await requestOtp(app, phone);
  const response = await request(app.getHttpServer())
    .post('/api/v1/auth/otp/verify')
    .send({ challengeId: otp.challengeId, code: otp.debugCode, role })
    .expect(200);
  expect(response.body).toMatchObject({ status: 'authenticated' });
  return response.body as SessionResponse;
}

async function uploadRegistrationImage(
  app: NestFastifyApplication,
  registrationToken: string,
  kind: string,
): Promise<string> {
  const image =
    kind === 'license'
      ? await sharp(randomBytes(1600 * 1200 * 3), {
          raw: { width: 1600, height: 1200, channels: 3 },
        })
          .jpeg({ quality: 92 })
          .toBuffer()
      : await sharp({
          create: {
            width: 16,
            height: 16,
            channels: 3,
            background: '#f4c900',
          },
        })
          .png()
          .toBuffer();
  if (kind === 'license') {
    expect(image.length).toBeGreaterThan(1024 * 1024);
  }
  const response = await request(app.getHttpServer())
    .post(`/api/v1/auth/registration/images/${kind}`)
    .set('Authorization', `Bearer ${registrationToken}`)
    .attach('file', image, {
      filename: `${kind}.png`,
      contentType: 'image/png',
    })
    .expect(201);
  return (response.body as { objectKey: string }).objectKey;
}

async function clearOtpKeys(redis: RedisService): Promise<void> {
  const keys = await redis.connection.keys('auth:otp:*');
  if (keys.length > 0) {
    await redis.connection.del(...keys);
  }
}

async function setDriverTrackingLocation(
  redis: RedisService,
  orderId: string,
  driverUserId: string,
  latitude: number,
  longitude: number,
): Promise<void> {
  await redis.connection.set(
    `tracking:order:${orderId}:driver`,
    JSON.stringify({
      latitude,
      longitude,
      driverUserId,
      heading: 0,
      speedMps: 0,
      accuracyMeters: 10,
      recordedAt: new Date().toISOString(),
    }),
    'EX',
    30,
  );
}

function nextVladivostokNoon(): string {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() + 1);
  value.setUTCHours(2, 0, 0, 0);
  return value.toISOString();
}
