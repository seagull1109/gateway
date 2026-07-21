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

// ── CORS ──────────────────────────────────────────────────────────────
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'x-portkey-config'],
}))

// ── 鉴权：校验 Authorization Bearer token ────────────────────────────
// 跳过 OPTIONS 预检请求（CORS 握手）和根路径健康检查。
// 内部 Service Binding 调用（/v1/internal/*）也跳过，
// 因为它是 Worker 自己调自己，不经过公网，不需要鉴权。
app.use('*', async (c: Context, next) => {
  const path = new URL(c.req.url).pathname
  const method = c.req.method

  // 跳过 OPTIONS 预检
  if (method === 'OPTIONS') return next()

  // 跳过根路径
  if (path === '/') return next()

  // 跳过内部调用路径
  if (path.startsWith('/v1/internal/')) return next()

  // 没有配置 GATEWAY_TOKEN 时跳过鉴权（方便调试）
  const expectedToken = (c.env as any)?.GATEWAY_TOKEN
  if (!expectedToken) return next()

  // 校验 Authorization header
  const authHeader = c.req.header('Authorization') ?? ''
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : ''

  if (token !== expectedToken) {
    return c.json({ error: 'Unauthorized', message: 'Invalid or missing token' }, 401)
  }

  return next()
})

// ── 全局默认 Portkey config 注入 ─────────────────────────────────────
app.use('*', async (c: Context, next) => {
  if (runtime !== 'workerd') return next()

  if (!c.req.raw.headers.has('x-portkey-config')) {
    const defaultConfig = {
      strategy: { mode: 'fallback' },
      retry: { attempts: 1, on_status_codes: [429, 500, 502, 503] },
      targets: [
        {
          provider: 'groq',
          api_key: (c.env as any).GROQ,
          override_params: { model: 'llama-3.3-70b-versatile' },
        },
        {
          provider: 'google',
          api_key: (c.env as any).GEMINI_KEY,
          override_params: { model: 'gemini-2.5-flash-lite' },
        },
        {
          provider: 'openrouter',
          api_key: (c.env as any).OPENROUTER_KEY,
          override_params: { model: 'meta-llama/llama-3.3-70b-instruct:free' },
        },
      ],
    }
    const newHeaders = new Headers(c.req.raw.headers)
    newHeaders.set('x-portkey-config', JSON.stringify(defaultConfig))
    c.req.raw = new Request(c.req.raw, { headers: newHeaders })
  }

  await next()
})

if (runtime === 'node' && process.env.REDIS_CONNECTION_STRING) {
  createCacheBackendsRedis(process.env.REDIS_CONNECTION_STRING)
}

app.use('*', (c, next) => {
  if (['lagon', 'workerd', 'node'].includes(runtime)) return next()
  return compress()(c, next)
})

if (runtime === 'node') {
  app.use('*', async (c: Context, next) => {
    if (!c.req.url.includes('/realtime')) return next()
    await next()
    if (
      c.req.url.includes('/realtime') &&
      c.req.header('upgrade') === 'websocket' &&
      (c.res.status >= 400 || c.get('websocketError') === true)
    ) {
      const finalStatus = c.get('websocketError') === true ? 500 : c.res.status
      const socket = (c.env as any).incoming?.socket
      if (socket) {
        socket.write(`HTTP/1.1 ${finalStatus} ${c.res.statusText}\r\n\r\n`)
        socket.destroy()
      }
    }
  })
}

app.get('/', (c) => c.text('AI Gateway says hey!'))
app.use('*', prettyJSON())
if (getRuntimeKey() === 'node') app.use(logHandler())
app.get('/v1/models', modelsHandler)
app.use('*', hooks)
if (conf.cache === true) app.use('*', memoryCache())

app.notFound((c) => c.json({ message: 'Not Found', ok: false }, 404))
app.onError((err, c) => {
  logger.error('Global Error Handler: ', err.message, err.cause, err.stack)
  if (err instanceof HTTPException) return err.getResponse()
  c.status(500)
  return c.json({ status: 'failure', message: err.message })
})

app.post('/v1/messages', requestValidator, messagesConfig, messagesHandler)
app.post('/v1/messages/count_tokens', requestValidator, messagesCountTokensHandler)

// 内部专用：只给 callGatewaySelf 通过 Service Binding 调用
app.post('/v1/internal/chat/completions', requestValidator, chatCompletionsHandler)

// 对外标准入口：带模型别名路由
app.post('/v1/chat/completions', requestValidator, agentChatHandler)

// 兼容 NextChat 拼出 /v1/v1 的情况
app.post('/v1/v1/chat/completions', agentChatHandler)

// 调试用
app.post('/v1/agent/chat', agentChatHandler)

app.post('/v1/completions', requestValidator, completionsHandler)
app.post('/v1/embeddings', requestValidator, embeddingsHandler)
app.post('/v1/images/generations', requestValidator, imageGenerationsHandler)
app.post('/v1/images/edits', requestValidator, imageEditsHandler)
app.post('/v1/audio/speech', requestValidator, createSpeechHandler)
app.post('/v1/audio/transcriptions', requestValidator, createTranscriptionHandler)
app.post('/v1/audio/translations', requestValidator, createTranslationHandler)

app.get('/v1/files', requestValidator, filesHandler('listFiles', 'GET'))
app.get('/v1/files/:id', requestValidator, filesHandler('retrieveFile', 'GET'))
app.get('/v1/files/:id/content', requestValidator, filesHandler('retrieveFileContent', 'GET'))
app.post('/v1/files', requestValidator, filesHandler('uploadFile', 'POST'))
app.delete('/v1/files/:id', requestValidator, filesHandler('deleteFile', 'DELETE'))

app.post('/v1/batches', requestValidator, batchesHandler('createBatch', 'POST'))
app.get('/v1/batches/:id', requestValidator, batchesHandler('retrieveBatch', 'GET'))
app.get('/v1/batches/*/output', requestValidator, batchesHandler('getBatchOutput', 'GET'))
app.post('/v1/batches/:id/cancel', requestValidator, batchesHandler('cancelBatch', 'POST'))
app.get('/v1/batches', requestValidator, batchesHandler('listBatches', 'GET'))

app.post('/v1/responses', requestValidator, modelResponsesHandler('createModelResponse', 'POST'))
app.get('/v1/responses/:id', requestValidator, modelResponsesHandler('getModelResponse', 'GET'))
app.delete('/v1/responses/:id', requestValidator, modelResponsesHandler('deleteModelResponse', 'DELETE'))
app.get('/v1/responses/:id/input_items', requestValidator, modelResponsesHandler('listResponseInputItems', 'GET'))

app.all('/v1/fine_tuning/jobs/:jobId?/:cancel?', requestValidator, finetuneHandler)

app.post('/v1/prompts/*', requestValidator, (c) => {
  if (c.req.url.endsWith('/v1/chat/completions')) return chatCompletionsHandler(c)
  if (c.req.url.endsWith('/v1/completions')) return completionsHandler(c)
  c.status(500)
  return c.json({ status: 'failure', message: 'prompt completions error: Something went wrong' })
})

if (runtime === 'workerd') app.get('/v1/realtime', realTimeHandler)

app.post('/v1/proxy/*', proxyHandler)
app.post('/v1/*', requestValidator, proxyHandler)
app.get('/v1/:path{(?!realtime).*}', requestValidator, proxyHandler)
app.delete('/v1/*', requestValidator, proxyHandler)

export default app
