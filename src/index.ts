/**
 * Portkey AI Gateway
 *
 * @module index
 */

import { Context, Hono } from 'hono';
import { prettyJSON } from 'hono/pretty-json';
import { HTTPException } from 'hono/http-exception';
import { compress } from 'hono/compress';
import { cors } from 'hono/cors';
import { getRuntimeKey } from 'hono/adapter';
// import { env } from 'hono/adapter' // Have to set this up for multi-environment deployment

// Middlewares
import { requestValidator } from './middlewares/requestValidator';
import { hooks } from './middlewares/hooks';
import { memoryCache } from './middlewares/cache';

// Handlers
import { proxyHandler } from './handlers/proxyHandler';
import { chatCompletionsHandler } from './handlers/chatCompletionsHandler';
import { agentChatHandler } from './handlers/agentChatHandler';
import { completionsHandler } from './handlers/completionsHandler';
import { embeddingsHandler } from './handlers/embeddingsHandler';
import { logHandler } from './middlewares/log';
import { imageGenerationsHandler } from './handlers/imageGenerationsHandler';
import { createSpeechHandler } from './handlers/createSpeechHandler';
import { createTranscriptionHandler } from './handlers/createTranscriptionHandler';
import { createTranslationHandler } from './handlers/createTranslationHandler';
import { modelsHandler } from './handlers/modelsHandler';
import { realTimeHandler } from './handlers/realtimeHandler';
import filesHandler from './handlers/filesHandler';
import batchesHandler from './handlers/batchesHandler';
import finetuneHandler from './handlers/finetuneHandler';
import { messagesHandler } from './handlers/messagesHandler';
import { imageEditsHandler } from './handlers/imageEditsHandler';
import { messagesCountTokensHandler } from './handlers/messagesCountTokensHandler';
import modelResponsesHandler from './handlers/modelResponsesHandler';

// utils
import { logger } from './apm';
// Config
import conf from '../conf.json';
import { createCacheBackendsRedis } from './shared/services/cache';

// Create a new Hono server instance
const app = new Hono();
const runtime = getRuntimeKey();

// ===================== 新增：CORS，允许浏览器端客户端（NextChat 等）跨域调用 =====================
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'x-portkey-config'],
}));
// ====================================================================================

// ===================== 新增：内置全局默认 Portkey 配置（支持两套 fallback 顺序） =====================
// DEFAULT_TARGETS：日常调试用，deepseek 优先（速度快、便宜，但 function calling 不够稳）。
// SEARCH_TARGETS：需要可靠搜索时用，Gemini 优先（之前测试中工具调用一直稳定触发）。
// 在 NextChat（或其他客户端）里把"模型"切换成 gemini-search，就会自动用这套；
// 其他任何 model 值（包括 deepseek）都走 DEFAULT_TARGETS，行为跟现在完全一样。

const DEFAULT_TARGETS = [
  { provider: 'deepseek', override_params: { model: 'deepseek-v4-flash' } },
  { provider: 'google', override_params: { model: 'gemini-2.5-flash-lite' } },
  { provider: 'google', override_params: { model: 'gemini-3.5-flash' } },
  { provider: 'openrouter', override_params: { model: 'openrouter/free' } },
];

const SEARCH_TARGETS = [
  { provider: 'google', override_params: { model: 'gemini-2.5-flash-lite' } },
  { provider: 'google', override_params: { model: 'gemini-3.5-flash' } },
  { provider: 'deepseek', override_params: { model: 'deepseek-v4-flash' } },
  { provider: 'openrouter', override_params: { model: 'openrouter/free' } },
];

function resolveApiKey(provider: string, env: any) {
  if (provider === 'deepseek') return env.DP_KEY;
  if (provider === 'google') return env.GEMINI_KEY;
  if (provider === 'openrouter') return env.OPENROUTER_KEY;
  return '';
}

// 全局前置中间件：修复immutable headers报错 + 根据请求的 model 字段选 targets 顺序
app.use('*', async (c: Context, next) => {
  // 只有Cloudflare Worker运行时才执行注入逻辑
  if (runtime !== "workerd") {
    return next();
  }

  // 提前 clone 一份 body 读 model 字段，不影响原始请求体往后传递
  let requestedModel = '';
  try {
    const cloned = c.req.raw.clone();
    const parsed: any = await cloned.json();
    requestedModel = parsed?.model || '';
  } catch {
    // 不是 JSON body，或者读取失败，忽略，走默认配置
  }

  const baseTargets = requestedModel === 'gemini-search' ? SEARCH_TARGETS : DEFAULT_TARGETS;

  const finalConfig = {
    retry: { attempts: 3 },
    strategy: { mode: "fallback" },
    targets: baseTargets.map((t) => ({
      ...t,
      api_key: resolveApiKey(t.provider, c.env),
    })),
  };

  // 复制headers为可写实例
  const newHeaders = new Headers(c.req.raw.headers);
  if (!newHeaders.has("x-portkey-config")) {
    newHeaders.set("x-portkey-config", JSON.stringify(finalConfig));
  }
  // 构造新request替换原始只读request
  c.req.raw = new Request(c.req.raw, { headers: newHeaders });

  await next();
});
// ==========================================================================

if (runtime === 'node' && process.env.REDIS_CONNECTION_STRING) {
  createCacheBackendsRedis(process.env.REDIS_CONNECTION_STRING);
}
/**
 * Middleware that conditionally applies compression middleware based on the runtime.
 * Compression is automatically handled for lagon and workerd runtimes
 * This check if its not any of the 2 and then applies the compress middleware to avoid double compression.
 */
app.use('*', (c, next) => {
  const runtimesThatDontNeedCompression = ['lagon', 'workerd', 'node'];
  if (runtimesThatDontNeedCompression.includes(runtime)) {
    return next();
  }
  return compress()(c, next);
});

if (runtime === 'node') {
  app.use('*', async (c: Context, next) => {
    if (!c.req.url.includes('/realtime')) {
      return next();
    }

    await next();

    if (
      c.req.url.includes('/realtime') &&
      c.req.header('upgrade') === 'websocket' &&
      (c.res.status >= 400 || c.get('websocketError') === true)
    ) {
      const finalStatus = c.get('websocketError') === true ? 500 : c.res.status;
      const socket = c.env.incoming.socket;
      if (socket) {
        socket.write(`HTTP/1.1 ${finalStatus} ${c.res.statusText}\r\n\r\n`);
        socket.destroy();
      }
    }
  });
}

/**
 * GET route for the root path.
 * Returns a greeting message.
 */
app.get('/', (c) => c.text('AI Gateway says hey!'));

// Use prettyJSON middleware for all routes
app.use('*', prettyJSON());

// Use logger middleware for all routes
if (getRuntimeKey() === 'node') {
  app.use(logHandler());
}

// Support the /v1/models endpoint
app.get('/v1/models', modelsHandler);

// Use hooks middleware for all routes
app.use('*', hooks);

if (conf.cache === true) {
  app.use('*', memoryCache());
}

/**
 * Default route when no other route matches.
 * Returns a JSON response with a message and status code 404.
 */
app.notFound((c) => c.json({ message: 'Not Found', ok: false }, 404));

/**
 * Global error handler.
 * If error is instance of HTTPException, returns the custom response.
 * Otherwise, logs the error and returns a JSON response with status code 500.
 */
app.onError((err, c) => {
  logger.error('Global Error Handler: ', err.message, err.cause, err.stack);
  if (err instanceof HTTPException) {
    return err.getResponse();
  }
  c.status(500);
  return c.json({ status: 'failure', message: err.message });
});

/**
 * POST route for '/v1/messages' in anthropic format
 */
app.post('/v1/messages', requestValidator, messagesHandler);

app.post(
  '/v1/messages/count_tokens',
  requestValidator,
  messagesCountTokensHandler
);

/**
 * 真正的 OpenAI 兼容 completions 逻辑，只给内部 self-call 用，不直接对外暴露。
 */
app.post(
  '/v1/internal/chat/completions',
  requestValidator,
  chatCompletionsHandler
);

/**
 * POST route for '/v1/chat/completions'.
 * 对外的标准入口现在直接就是 agent 版本：自动支持 web_search 工具调用。
 */
app.post('/v1/chat/completions', requestValidator, agentChatHandler);

/**
 * 兼容某些客户端（如 NextChat）误拼出 /v1/v1 路径的情况
 */
app.post('/v1/v1/chat/completions', agentChatHandler);

/**
 * POST route for '/v1/agent/chat'.
 * 跟 /v1/chat/completions 是同一个 agentChatHandler，保留这条路径方便直接用 curl 调试。
 */
app.post('/v1/agent/chat', agentChatHandler); // agent loop, web_search tool

/**
 * POST route for '/v1/completions'.
 * Handles requests by passing them to the completionsHandler.
 */
app.post('/v1/completions', requestValidator, completionsHandler);

/**
 * POST route for '/v1/embeddings'.
 * Handles requests by passing them to the embeddingsHandler.
 */
app.post('/v1/embeddings', requestValidator, embeddingsHandler);

/**
 * POST route for '/v1/images/generations'.
 * Handles requests by passing them to the imageGenerations handler.
 */
app.post('/v1/images/generations', requestValidator, imageGenerationsHandler);

/**
 * POST route for '/v1/images/edits'.
 * Handles requests by passing them to the imageGenerations handler.
 */
app.post('/v1/images/edits', requestValidator, imageEditsHandler);

/**
 * POST route for '/v1/audio/speech'.
 * Handles requests by passing them to the createSpeechHandler.
 */
app.post('/v1/audio/speech', requestValidator, createSpeechHandler);

/**
 * POST route for '/v1/audio/transcriptions'.
 * Handles requests by passing them to the createTranscriptionHandler.
 */
app.post(
  '/v1/audio/transcriptions',
  requestValidator,
  createTranscriptionHandler
);

/**
 * POST route for '/v1/audio/translations'.
 * Handles requests by passing them to the createTranslationHandler.
 */
app.post('/v1/audio/translations', requestValidator, createTranslationHandler);

// files
app.get('/v1/files', requestValidator, filesHandler('listFiles', 'GET'));
app.get('/v1/files/:id', requestValidator, filesHandler('retrieveFile', 'GET'));
app.get(
  '/v1/files/:id/content',
  requestValidator,
  filesHandler('retrieveFileContent', 'GET')
);
app.post('/v1/files', requestValidator, filesHandler('uploadFile', 'POST'));
app.delete(
  '/v1/files/:id',
  requestValidator,
  filesHandler('deleteFile', 'DELETE')
);

// batches
app.post(
  '/v1/batches',
  requestValidator,
  batchesHandler('createBatch', 'POST')
);
app.get(
  '/v1/batches/:id',
  requestValidator,
  batchesHandler('retrieveBatch', 'GET')
);
app.get(
  '/v1/batches/*/output',
  requestValidator,
  batchesHandler('getBatchOutput', 'GET')
);
app.post(
  '/v1/batches/:id/cancel',
  requestValidator,
  batchesHandler('cancelBatch', 'POST')
);
app.get('/v1/batches', requestValidator, batchesHandler('listBatches', 'GET'));

// responses
app.post(
  '/v1/responses',
  requestValidator,
  modelResponsesHandler('createModelResponse', 'POST')
);
app.get(
  '/v1/responses/:id',
  requestValidator,
  modelResponsesHandler('getModelResponse', 'GET')
);
app.delete(
  '/v1/responses/:id',
  requestValidator,
  modelResponsesHandler('deleteModelResponse', 'DELETE')
);
app.get(
  '/v1/responses/:id/input_items',
  requestValidator,
  modelResponsesHandler('listResponseInputItems', 'GET')
);

app.all(
  '/v1/fine_tuning/jobs/:jobId?/:cancel?',
  requestValidator,
  finetuneHandler
);

/**
 * POST route for '/v1/prompts/:id/completions'.
 * Handles portkey prompt completions route
 */
app.post('/v1/prompts/*', requestValidator, (c) => {
  if (c.req.url.endsWith('/v1/chat/completions')) {
    return chatCompletionsHandler(c);
  } else if (c.req.url.endsWith('/v1/completions')) {
    return completionsHandler(c);
  }
  c.status(500);
  return c.json({
    status: 'failure',
    message: 'prompt completions error: Something went wrong',
  });
});

// WebSocket route
if (runtime === 'workerd') {
  app.get('/v1/realtime', realTimeHandler);
}

/**
 * @deprecated
 * Support the /v1 proxy endpoint
 */
app.post('/v1/proxy/*', proxyHandler);

// Support the /v1 proxy endpoint after all defined endpoints so this does not interfere.
app.post('/v1/*', requestValidator, proxyHandler);

// Support the /v1 proxy endpoint after all defined endpoints so this does not interfere.
app.get('/v1/:path{(?!realtime).*}', requestValidator, proxyHandler);

app.delete('/v1/*', requestValidator, proxyHandler);

// Export the app
export default app;
