/**
 * Portkey AI Gateway — rubeus
 */

import { Context, Hono } from 'hono'
import { prettyJSON } from 'hono/pretty-json'
import { HTTPException } from 'hono/http-exception'
import { compress } from 'hono/compress'
import { cors } from 'hono/cors'
import { getRuntimeKey } from 'hono/adapter'

import { requestValidator } from './middlewares/requestValidator'
import { hooks } from './middlewares/hooks'
import { memoryCache } from './middlewares/cache'

import { proxyHandler } from './handlers/proxyHandler'
import { chatCompletionsHandler } from './handlers/chatCompletionsHandler'
import { agentChatHandler } from './handlers/agentChatHandler'
import { completionsHandler } from './handlers/completionsHandler'
import { embeddingsHandler } from './handlers/embeddingsHandler'
import { logHandler } from './middlewares/log'

import { imageGenerationsHandler } from './handlers/imageGenerationsHandler'
import { createSpeechHandler } from './handlers/createSpeechHandler'
import { createTranscriptionHandler } from './handlers/createTranscriptionHandler'
import { createTranslationHandler } from './handlers/createTranslationHandler'
import { modelsHandler } from './handlers/modelsHandler'
import { realTimeHandler } from './handlers/realtimeHandler'

import filesHandler from './handlers/filesHandler'
import batchesHandler from './handlers/batchesHandler'
import finetuneHandler from './handlers/finetuneHandler'

import { messagesHandler } from './handlers/messagesHandler'
import { messagesConfig } from './middlewares/messagesConfig'
import { imageEditsHandler } from './handlers/imageEditsHandler'
import { messagesCountTokensHandler } from './handlers/messagesCountTokensHandler'

import modelResponsesHandler from './handlers/modelResponsesHandler'

import { logger } from './apm'
import conf from '../conf.json'

import { createCacheBackendsRedis } from './shared/services/cache'

const app = new Hono()

const runtime = getRuntimeKey()

// ─────────────────────────────────────────────────────────────
// CORS
// ─────────────────────────────────────────────────────────────

app.use(
  '*',
  cors({
    origin: '*',

    allowMethods: [
      'GET',
      'POST',
      'PUT',
      'DELETE',
      'OPTIONS',
    ],

    allowHeaders: [
      'Content-Type',
      'Authorization',
      'x-portkey-config',
    ],
  }),
)

// ─────────────────────────────────────────────────────────────
// 鉴权
// ─────────────────────────────────────────────────────────────

app.use(
  '*',
  async (
    c: Context,
    next,
  ) => {
    const path =
      new URL(c.req.url).pathname

    const method = c.req.method

    // CORS 预检
    if (method === 'OPTIONS') {
      return next()
    }

    // 根路径健康检查
    if (path === '/') {
      return next()
    }

    // Worker 内部 Service Binding
    if (
      path.startsWith(
        '/v1/internal/',
      )
    ) {
      return next()
    }

    const expectedToken =
      (c.env as any)?.GATEWAY_TOKEN

    // 未配置 Token 时允许调试
    if (!expectedToken) {
      return next()
    }

    const authHeader =
      c.req.header(
        'Authorization',
      ) ?? ''

    const token =
      authHeader.startsWith(
        'Bearer ',
      )
        ? authHeader
            .slice(7)
            .trim()
        : ''

    if (token !== expectedToken) {
      return c.json(
        {
          error: 'Unauthorized',
          message:
            'Invalid or missing token',
        },
        401,
      )
    }

    return next()
  },
)

// ─────────────────────────────────────────────────────────────
// 注意：
// 不在这里注入默认 x-portkey-config。
// 模型路由统一由 agentChatHandler + modelTargets.ts 负责。
// ─────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────
// Compression
// ─────────────────────────────────────────────────────────────

app.use(
  '*',
  (c, next) => {
    if (
      [
        'lagon',
        'workerd',
        'node',
      ].includes(runtime)
    ) {
      return next()
    }

    return compress()(c, next)
  },
)

// ─────────────────────────────────────────────────────────────
// Node realtime websocket
// ─────────────────────────────────────────────────────────────

if (runtime === 'node') {
  app.use(
    '*',
    async (
      c: Context,
      next,
    ) => {
      if (
        !c.req.url.includes(
          '/realtime',
        )
      ) {
        return next()
      }

      await next()

      if (
        c.req.url.includes(
          '/realtime',
        ) &&
        c.req.header(
          'upgrade',
        ) === 'websocket' &&
        (
          c.res.status >= 400 ||
          c.get(
            'websocketError',
          ) === true
        )
      ) {
        const finalStatus =
          c.get(
            'websocketError',
          ) === true
            ? 500
            : c.res.status

        const socket =
          (c.env as any)
            .incoming?.socket

        if (socket) {
          socket.write(
            `HTTP/1.1 ${finalStatus} ${c.res.statusText}\r\n\r\n`,
          )

          socket.destroy()
        }
      }
    },
  )
}

// ─────────────────────────────────────────────────────────────
// Redis
// ─────────────────────────────────────────────────────────────

if (
  runtime === 'node' &&
  process.env
    .REDIS_CONNECTION_STRING
) {
  createCacheBackendsRedis(
    process.env
      .REDIS_CONNECTION_STRING,
  )
}

// ─────────────────────────────────────────────────────────────
// Basic middleware
// ─────────────────────────────────────────────────────────────

app.get(
  '/',
  (c) =>
    c.text(
      'AI Gateway says hey!',
    ),
)

app.use(
  '*',
  prettyJSON(),
)

if (runtime === 'node') {
  app.use(
    '*',
    logHandler(),
  )
}

app.get(
  '/v1/models',
  modelsHandler,
)

app.use(
  '*',
  hooks,
)

if (conf.cache === true) {
  app.use(
    '*',
    memoryCache(),
  )
}

// ─────────────────────────────────────────────────────────────
// 404
// ─────────────────────────────────────────────────────────────

app.notFound(
  (c) =>
    c.json(
      {
        message: 'Not Found',
        ok: false,
      },
      404,
    ),
)

// ─────────────────────────────────────────────────────────────
// Error Handler
// ─────────────────────────────────────────────────────────────

app.onError(
  (err, c) => {
    logger.error(
      'Global Error Handler: ',
      err.message,
      err.cause,
      err.stack,
    )

    if (
      err instanceof HTTPException
    ) {
      return err.getResponse()
    }

    c.status(500)

    return c.json({
      status: 'failure',
      message: err.message,
    })
  },
)

// ─────────────────────────────────────────────────────────────
// Anthropic Messages API
// ─────────────────────────────────────────────────────────────

app.post(
  '/v1/messages',
  requestValidator,
  messagesConfig,
  messagesHandler,
)

app.post(
  '/v1/messages/count_tokens',
  requestValidator,
  messagesCountTokensHandler,
)

// ─────────────────────────────────────────────────────────────
// Internal Chat Completions
// ─────────────────────────────────────────────────────────────
//
// 只给 callGatewaySelf / Service Binding 使用。
// 不作为客户端模型路由入口。
//
app.post(
  '/v1/internal/chat/completions',
  requestValidator,
  chatCompletionsHandler,
)

// ─────────────────────────────────────────────────────────────
// 对外 Chat Completions
// ─────────────────────────────────────────────────────────────
//
// 客户端通过 model 选择：
//   auto/cheap
//   auto/fast
//   auto/coding
//   auto/search
//   auto/image
//
// agentChatHandler 负责模型别名路由。
//
app.post(
  '/v1/chat/completions',
  requestValidator,
  agentChatHandler,
)

// 兼容 /v1/v1/chat/completions
app.post(
  '/v1/v1/chat/completions',
  agentChatHandler,
)

// 调试入口
app.post(
  '/v1/agent/chat',
  agentChatHandler,
)

// ─────────────────────────────────────────────────────────────
// OpenAI Compatible APIs
// ─────────────────────────────────────────────────────────────

app.post(
  '/v1/completions',
  requestValidator,
  completionsHandler,
)

app.post(
  '/v1/embeddings',
  requestValidator,
  embeddingsHandler,
)

app.post(
  '/v1/images/generations',
  requestValidator,
  imageGenerationsHandler,
)

app.post(
  '/v1/images/edits',
  requestValidator,
  imageEditsHandler,
)

app.post(
  '/v1/audio/speech',
  requestValidator,
  createSpeechHandler,
)

app.post(
  '/v1/audio/transcriptions',
  requestValidator,
  createTranscriptionHandler,
)

app.post(
  '/v1/audio/translations',
  requestValidator,
  createTranslationHandler,
)

// ─────────────────────────────────────────────────────────────
// Files
// ─────────────────────────────────────────────────────────────

app.get(
  '/v1/files',
  requestValidator,
  filesHandler(
    'listFiles',
    'GET',
  ),
)

app.get(
  '/v1/files/:id',
  requestValidator,
  filesHandler(
    'retrieveFile',
    'GET',
  ),
)

app.get(
  '/v1/files/:id/content',
  requestValidator,
  filesHandler(
    'retrieveFileContent',
    'GET',
  ),
)

app.post(
  '/v1/files',
  requestValidator,
  filesHandler(
    'uploadFile',
    'POST',
  ),
)

app.delete(
  '/v1/files/:id',
  requestValidator,
  filesHandler(
    'deleteFile',
    'DELETE',
  ),
)

// ─────────────────────────────────────────────────────────────
// Batches
// ─────────────────────────────────────────────────────────────

app.post(
  '/v1/batches',
  requestValidator,
  batchesHandler(
    'createBatch',
    'POST',
  ),
)

app.get(
  '/v1/batches/:id',
  requestValidator,
  batchesHandler(
    'retrieveBatch',
    'GET',
  ),
)

app.get(
  '/v1/batches/*/output',
  requestValidator,
  batchesHandler(
    'getBatchOutput',
    'GET',
  ),
)

app.post(
  '/v1/batches/:id/cancel',
  requestValidator,
  batchesHandler(
    'cancelBatch',
    'POST',
  ),
)

app.get(
  '/v1/batches',
  requestValidator,
  batchesHandler(
    'listBatches',
    'GET',
  ),
)

// ─────────────────────────────────────────────────────────────
// Responses API
// ─────────────────────────────────────────────────────────────

app.post(
  '/v1/responses',
  requestValidator,
  modelResponsesHandler(
    'createModelResponse',
    'POST',
  ),
)

app.get(
  '/v1/responses/:id',
  requestValidator,
  modelResponsesHandler(
    'getModelResponse',
    'GET',
  ),
)

app.delete(
  '/v1/responses/:id',
  requestValidator,
  modelResponsesHandler(
    'deleteModelResponse',
    'DELETE',
  ),
)

app.get(
  '/v1/responses/:id/input_items',
  requestValidator,
  modelResponsesHandler(
    'listResponseInputItems',
    'GET',
  ),
)

// ─────────────────────────────────────────────────────────────
// Fine tuning
// ─────────────────────────────────────────────────────────────

app.all(
  '/v1/fine_tuning/jobs/:jobId?/:cancel?',
  requestValidator,
  finetuneHandler,
)

// ─────────────────────────────────────────────────────────────
// Prompts
// ─────────────────────────────────────────────────────────────

app.post(
  '/v1/prompts/*',
  requestValidator,
  (c) => {
    if (
      c.req.url.endsWith(
        '/v1/chat/completions',
      )
    ) {
      return chatCompletionsHandler(c)
    }

    if (
      c.req.url.endsWith(
        '/v1/completions',
      )
    ) {
      return completionsHandler(c)
    }

    c.status(500)

    return c.json({
      status: 'failure',
      message:
        'prompt completions error: Something went wrong',
    })
  },
)

// ─────────────────────────────────────────────────────────────
// Realtime
// ─────────────────────────────────────────────────────────────

if (runtime === 'workerd') {
  app.get(
    '/v1/realtime',
    realTimeHandler,
  )
}

// ─────────────────────────────────────────────────────────────
// Proxy
// ─────────────────────────────────────────────────────────────

app.post(
  '/v1/proxy/*',
  proxyHandler,
)

app.post(
  '/v1/*',
  requestValidator,
  proxyHandler,
)

app.get(
  '/v1/:path{(?!realtime).*}',
  requestValidator,
  proxyHandler,
)

app.delete(
  '/v1/*',
  requestValidator,
  proxyHandler,
)

export default app