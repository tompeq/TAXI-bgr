import { environmentValidationSchema } from './environment.validation';

describe('environmentValidationSchema', () => {
  const productionEnvironment = {
    NODE_ENV: 'production',
    DB_PASSWORD: 'production-db-password',
    OTP_HASH_SECRET: 'production-otp-secret-with-32-characters',
    JWT_ACCESS_SECRET: 'production-access-secret-32-characters',
    JWT_REGISTRATION_SECRET: 'production-registration-secret-32-characters',
    S3_ACCESS_KEY: 'production-storage-key',
    S3_SECRET_KEY: 'production-storage-secret',
  };

  it('provides safe local defaults', () => {
    const result = environmentValidationSchema.validate({});

    expect(result.error).toBeUndefined();
    expect(result.value).toMatchObject({
      NODE_ENV: 'development',
      PORT: 3000,
      DB_NAME: 'taxi_bgr',
      DB_SSL: false,
      REDIS_URL: 'redis://localhost:6379',
      SMS_MODE: 'mock',
      ACCESS_TOKEN_TTL_SECONDS: 900,
      REGISTRATION_TOKEN_TTL_SECONDS: 1800,
    });
  });

  it('requires secrets in production', () => {
    const result = environmentValidationSchema.validate({
      NODE_ENV: 'production',
    });

    expect(result.error).toBeDefined();
  });

  it('disables mock SMS by default in production', () => {
    const result = environmentValidationSchema.validate(productionEnvironment);

    expect(result.error).toBeUndefined();
    expect(result.value).toMatchObject({ SMS_MODE: 'disabled' });
  });

  it('rejects mock SMS in production', () => {
    const result = environmentValidationSchema.validate({
      ...productionEnvironment,
      SMS_MODE: 'mock',
    });

    expect(result.error).toBeDefined();
  });

  it('allows SMSPILOT when its API key is configured', () => {
    const result = environmentValidationSchema.validate({
      ...productionEnvironment,
      SMS_MODE: 'smspilot',
      SMSPILOT_API_KEY: 'A'.repeat(64),
    });

    expect(result.error).toBeUndefined();
    expect(result.value).toMatchObject({
      SMS_MODE: 'smspilot',
      SMSPILOT_SENDER: '',
    });
  });

  it('requires an SMSPILOT key when the provider is enabled', () => {
    const result = environmentValidationSchema.validate({
      SMS_MODE: 'smspilot',
    });

    expect(result.error).toBeDefined();
  });
});
