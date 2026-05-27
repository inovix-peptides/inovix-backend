import 'lib/instrument';
import { loadEnv, Modules, defineConfig } from '@medusajs/utils';
import { DHL_BOXES_MODULE } from './src/modules/dhl-express-boxes';
import {
  ADMIN_CORS,
  AUTH_CORS,
  BACKEND_URL,
  COOKIE_SECRET,
  DATABASE_URL,
  JWT_SECRET,
  REDIS_URL,
  RESEND_API_KEY,
  RESEND_FROM_EMAIL,
  SENDGRID_API_KEY,
  SENDGRID_FROM_EMAIL,
  SHOULD_DISABLE_ADMIN,
  STORE_CORS,
  STRIPE_API_KEY,
  STRIPE_WEBHOOK_SECRET,
  MULTISAFEPAY_API_KEY,
  MULTISAFEPAY_ENVIRONMENT,
  BROKER_URL,
  BROKER_CLIENT_ID,
  BROKER_HMAC_SECRET,
  WORKER_MODE,
  MINIO_ENDPOINT,
  MINIO_ACCESS_KEY,
  MINIO_SECRET_KEY,
  MINIO_BUCKET,
  MINIO_PUBLIC_URL,
  MEILISEARCH_HOST,
  MEILISEARCH_ADMIN_KEY,
  DHL_EXPRESS_API_KEY,
  DHL_EXPRESS_API_SECRET,
  DHL_EXPRESS_ACCOUNT_NUMBER,
  DHL_EXPRESS_API_BASE_URL,
  DHL_EXPRESS_SHIPPER,
} from 'lib/constants';

loadEnv(process.env.NODE_ENV, process.cwd());

const medusaConfig = {
  projectConfig: {
    databaseUrl: DATABASE_URL,
    databaseLogging: false,
    redisUrl: REDIS_URL,
    workerMode: WORKER_MODE,
    http: {
      adminCors: ADMIN_CORS,
      authCors: AUTH_CORS,
      storeCors: STORE_CORS,
      jwtSecret: JWT_SECRET,
      cookieSecret: COOKIE_SECRET
    },
    build: {
      rollupOptions: {
        external: ["@medusajs/dashboard", "@medusajs/admin-shared"]
      }
    }
  },
  admin: {
    backendUrl: BACKEND_URL,
    disable: SHOULD_DISABLE_ADMIN,
  },
  modules: [
    {
      key: Modules.FILE,
      resolve: '@medusajs/file',
      options: {
        providers: [
          ...(MINIO_ENDPOINT && MINIO_ACCESS_KEY && MINIO_SECRET_KEY ? [{
            resolve: './src/modules/minio-file',
            id: 'minio',
            options: {
              endPoint: MINIO_ENDPOINT,
              accessKey: MINIO_ACCESS_KEY,
              secretKey: MINIO_SECRET_KEY,
              bucket: MINIO_BUCKET, // Optional, default: medusa-media
              publicUrl: MINIO_PUBLIC_URL // Optional, required for R2/S3-compatible providers where public-read host differs from S3 endpoint
            }
          }] : [{
            resolve: '@medusajs/file-local',
            id: 'local',
            options: {
              upload_dir: 'static',
              backend_url: `${BACKEND_URL}/static`
            }
          }])
        ]
      }
    },
    ...(REDIS_URL ? [{
      key: Modules.EVENT_BUS,
      resolve: '@medusajs/event-bus-redis',
      options: {
        redisUrl: REDIS_URL
      }
    },
    {
      key: Modules.WORKFLOW_ENGINE,
      resolve: '@medusajs/workflow-engine-redis',
      options: {
        redis: {
          url: REDIS_URL,
        }
      }
    },
    {
      key: Modules.CACHE,
      resolve: '@medusajs/cache-redis',
      options: {
        redisUrl: REDIS_URL
      }
    }] : []),
    ...(SENDGRID_API_KEY && SENDGRID_FROM_EMAIL || RESEND_API_KEY && RESEND_FROM_EMAIL ? [{
      key: Modules.NOTIFICATION,
      resolve: '@medusajs/notification',
      options: {
        providers: [
          ...(SENDGRID_API_KEY && SENDGRID_FROM_EMAIL ? [{
            resolve: '@medusajs/notification-sendgrid',
            id: 'sendgrid',
            options: {
              channels: ['email'],
              api_key: SENDGRID_API_KEY,
              from: SENDGRID_FROM_EMAIL,
            }
          }] : []),
          ...(RESEND_API_KEY && RESEND_FROM_EMAIL ? [{
            resolve: './src/modules/email-notifications',
            id: 'resend',
            options: {
              channels: ['email'],
              api_key: RESEND_API_KEY,
              from: RESEND_FROM_EMAIL,
            },
          }] : []),
        ]
      }
    }] : []),
    ...(
      (STRIPE_API_KEY && STRIPE_WEBHOOK_SECRET) ||
      MULTISAFEPAY_API_KEY ||
      (BROKER_URL && BROKER_CLIENT_ID && BROKER_HMAC_SECRET)
        ? [{
            key: Modules.PAYMENT,
            resolve: '@medusajs/payment',
            options: {
              providers: [
                ...(STRIPE_API_KEY && STRIPE_WEBHOOK_SECRET ? [{
                  resolve: '@medusajs/payment-stripe',
                  id: 'stripe',
                  options: {
                    apiKey: STRIPE_API_KEY,
                    webhookSecret: STRIPE_WEBHOOK_SECRET,
                  },
                }] : []),
                ...(MULTISAFEPAY_API_KEY ? [{
                  resolve: './src/modules/payment-multisafepay',
                  id: 'multisafepay',
                  options: {
                    apiKey: MULTISAFEPAY_API_KEY,
                    environment: MULTISAFEPAY_ENVIRONMENT,
                  },
                }] : []),
                ...(BROKER_URL && BROKER_CLIENT_ID && BROKER_HMAC_SECRET ? [{
                  resolve: './src/modules/payment-via-broker',
                  id: 'via_broker',
                  options: {
                    brokerUrl: BROKER_URL,
                    clientId: BROKER_CLIENT_ID,
                    hmacSecret: BROKER_HMAC_SECRET,
                  },
                }] : []),
              ],
            },
          }]
        : []
    ),
    {
      key: DHL_BOXES_MODULE,
      resolve: './src/modules/dhl-express-boxes',
    },
    {
      key: Modules.FULFILLMENT,
      resolve: '@medusajs/medusa/fulfillment',
      options: {
        providers: [
          {
            resolve: './src/modules/dhl-express',
            id: 'dhl-express',
            options: {
              apiKey: DHL_EXPRESS_API_KEY,
              apiSecret: DHL_EXPRESS_API_SECRET,
              accountNumber: DHL_EXPRESS_ACCOUNT_NUMBER,
              baseUrl: DHL_EXPRESS_API_BASE_URL,
              shipper: DHL_EXPRESS_SHIPPER,
            },
          },
          { resolve: '@medusajs/medusa/fulfillment-manual', id: 'manual' },
        ],
      },
    },
  ],
  plugins: [
  ...(MEILISEARCH_HOST && MEILISEARCH_ADMIN_KEY ? [{
      resolve: '@rokmohar/medusa-plugin-meilisearch',
      options: {
        config: {
          host: MEILISEARCH_HOST,
          apiKey: MEILISEARCH_ADMIN_KEY
        },
        settings: {
          products: {
            type: 'products',
            enabled: true,
            fields: ['id', 'title', 'description', 'handle', 'variant_sku', 'thumbnail'],
            indexSettings: {
              searchableAttributes: ['title', 'description', 'variant_sku'],
              displayedAttributes: ['id', 'handle', 'title', 'description', 'variant_sku', 'thumbnail'],
              filterableAttributes: ['id', 'handle'],
            },
            primaryKey: 'id',
          }
        }
      }
    }] : [])
  ]
};

if (process.env.MEDUSA_CONFIG_DEBUG === 'true') {
  console.log(JSON.stringify(medusaConfig, null, 2));
}
export default defineConfig(medusaConfig);
