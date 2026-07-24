import Joi from 'joi';

export const environmentValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().port().default(3000),
  BUSINESS_TIME_ZONE: Joi.string().default('Asia/Vladivostok'),
  CORS_ORIGINS: Joi.string().allow('').default('http://localhost:5173'),
  TRUSTED_PROXY_CIDRS: Joi.string().allow('').default(''),
  DB_HOST: Joi.string().hostname().default('localhost'),
  DB_PORT: Joi.number().port().default(5432),
  DB_NAME: Joi.string().default('taxi_bgr'),
  DB_USER: Joi.string().default('taxi_bgr'),
  DB_PASSWORD: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string().min(12).required(),
    otherwise: Joi.string().min(8).default('taxi_bgr_dev'),
  }),
  DB_SSL: Joi.boolean().default(false),
  DB_SSL_REJECT_UNAUTHORIZED: Joi.boolean().default(true),
  DB_POOL_MAX: Joi.number().integer().min(1).max(100).default(10),
  REDIS_URL: Joi.string()
    .uri({ scheme: ['redis', 'rediss'] })
    .default('redis://localhost:6379'),
  S3_ENDPOINT: Joi.string().hostname().default('localhost'),
  S3_PORT: Joi.number().port().default(9000),
  S3_USE_SSL: Joi.boolean().default(false),
  S3_PUBLIC_BASE_URL: Joi.string()
    .uri({ scheme: ['http', 'https'] })
    .allow('')
    .default(''),
  S3_ACCESS_KEY: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string().min(3).required(),
    otherwise: Joi.string().min(3).default('taxi_bgr_minio'),
  }),
  S3_SECRET_KEY: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string().min(16).required(),
    otherwise: Joi.string().min(16).default('taxi_bgr_minio_dev_secret'),
  }),
  S3_BUCKET: Joi.string()
    .pattern(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/)
    .default('taxi-bgr-documents'),
  SMS_MODE: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string().valid('disabled', 'smspilot').default('disabled'),
    otherwise: Joi.string()
      .valid('mock', 'disabled', 'smspilot')
      .default('mock'),
  }),
  SMSPILOT_API_KEY: Joi.when('SMS_MODE', {
    is: 'smspilot',
    then: Joi.string().alphanum().length(64).required(),
    otherwise: Joi.string().allow('').default(''),
  }),
  // Leave empty to use the provider's shared sender without a monthly fee.
  SMSPILOT_SENDER: Joi.string().trim().max(20).allow('').default(''),
  OTP_HASH_SECRET: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string().min(32).required(),
    otherwise: Joi.string()
      .min(32)
      .default('dev-otp-secret-change-me-32-characters'),
  }),
  OTP_TTL_SECONDS: Joi.number().integer().min(60).max(900).default(300),
  OTP_RESEND_SECONDS: Joi.number().integer().min(30).max(300).default(60),
  OTP_MAX_ATTEMPTS: Joi.number().integer().min(3).max(10).default(5),
  OTP_MAX_REQUESTS_PER_HOUR: Joi.number().integer().min(1).max(20).default(5),
  JWT_ACCESS_SECRET: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string().min(32).required(),
    otherwise: Joi.string()
      .min(32)
      .default('dev-access-secret-change-me-32-characters'),
  }),
  JWT_REGISTRATION_SECRET: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.string().min(32).required(),
    otherwise: Joi.string()
      .min(32)
      .default('dev-registration-secret-change-me-32-chars'),
  }),
  ACCESS_TOKEN_TTL_SECONDS: Joi.number()
    .integer()
    .min(300)
    .max(3600)
    .default(900),
  REGISTRATION_TOKEN_TTL_SECONDS: Joi.number()
    .integer()
    .min(300)
    .max(1800)
    .default(1800),
  REGISTRATION_UPLOAD_RETENTION_HOURS: Joi.number()
    .integer()
    .min(1)
    .max(168)
    .default(24),
  REFRESH_TOKEN_TTL_DAYS: Joi.number().integer().min(1).max(90).default(30),
  ORDER_COMPLETION_RADIUS_METERS: Joi.number()
    .integer()
    .min(50)
    .max(1000)
    .default(300),
  FCM_SERVICE_ACCOUNT_BASE64: Joi.string().allow('').default(''),
});
