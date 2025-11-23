export default ({ env }) => ({
  auth: {
    secret: env('ADMIN_JWT_SECRET'),
    sessions: {
      enabled: true,
      maxSessionLifespan: env.int('ADMIN_SESSION_MAX_LIFESPAN', 24 * 60 * 60 * 1000),
      maxRefreshTokenLifespan: env.int('ADMIN_SESSION_MAX_REFRESH_LIFESPAN', 7 * 24 * 60 * 60 * 1000),
    },
  },
  apiToken: {
    salt: env('API_TOKEN_SALT'),
  },
  transfer: {
    token: {
      salt: env('TRANSFER_TOKEN_SALT'),
    },
  },
  secrets: {
    encryptionKey: env('ENCRYPTION_KEY'),
  },
  flags: {
    nps: env.bool('FLAG_NPS', true),
    promoteEE: env.bool('FLAG_PROMOTE_EE', true),
  },
});
