import { NextRequest, NextResponse } from 'next/server';
import { insertChatMessage } from '@/lib/db';

/**
 * AI 聊天代理路由
 * @route POST /api/ai/chat
 * @description 将前端会话消息代理到后端配置的 AI 服务（OpenAI/兼容接口），返回助手回复文本。
 * @remarks 环境变量：AI_SERVICE_URL（基础地址）、AI_API_KEY（密钥）、AI_MODEL_ID（模型ID，默认 deepseek-chat）。
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    /**
     * 读取 Base URL / API Key / Model（兼容多种环境变量名）
     * @remarks 优先使用请求体，其次在以下变量中依次回退：
     * - Base URL: AI_SERVICE_URL | OPENAI_BASE_URL | OPENAI_API_HOST | DEEPSEEK_API_BASE | AZURE_OPENAI_ENDPOINT
     * - API Key : AI_API_KEY | OPENAI_API_KEY | DEEPSEEK_API_KEY | AZURE_OPENAI_API_KEY
     * - Model   : AI_MODEL_ID | OPENAI_MODEL_NAME | DEEPSEEK_MODEL_ID | AZURE_OPENAI_DEPLOYMENT
     */
    const baseUrl: string | undefined = body.baseUrl
      ?? process.env.AI_SERVICE_URL
      ?? process.env.OPENAI_BASE_URL
      ?? process.env.OPENAI_API_HOST
      ?? process.env.DEEPSEEK_API_BASE
      ?? process.env.AZURE_OPENAI_ENDPOINT;
    const apiKey: string | undefined = body.apiKey
      ?? process.env.AI_API_KEY
      ?? process.env.OPENAI_API_KEY
      ?? process.env.DEEPSEEK_API_KEY
      ?? process.env.AZURE_OPENAI_API_KEY;
    const model: string = body.model
      ?? process.env.AI_MODEL_ID
      ?? process.env.OPENAI_MODEL_NAME
      ?? process.env.DEEPSEEK_MODEL_ID
      ?? process.env.AZURE_OPENAI_DEPLOYMENT
      ?? 'deepseek-chat';
    const messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }> = Array.isArray(body.messages) ? body.messages : [];

    if (!baseUrl) throw new Error('缺少 AI_SERVICE_URL（请在 .env 或请求体中设置）');
    if (!apiKey) throw new Error('缺少 AI_API_KEY（请在 .env 或请求体中设置）');

    // 解析并规范化聊天端点（兼容多种基础地址写法）
    /**
     * 规范化 AI 聊天接口地址：
     * - 若 baseUrl 结尾已为 /chat/completions 则直接使用；
     * - 若 baseUrl 结尾为 /v1 或 /v1/ 则补全 /chat/completions；
     * - 其他情况默认拼接为 /v1/chat/completions。
     */
    let endpoint = baseUrl;
    try {
      const u = new URL(baseUrl);
      const p = u.pathname.replace(/\/+$/, '');
      if (p.endsWith('/chat/completions')) {
        endpoint = baseUrl;
      } else if (/\/v1\/?$/.test(p)) {
        endpoint = baseUrl.replace(/\/+$/, '') + '/chat/completions';
      } else {
        endpoint = baseUrl.replace(/\/+$/, '') + '/v1/chat/completions';
      }
    } catch {
      // 若 URL 无法解析，则按字符串拼接兜底
      endpoint = baseUrl.replace(/\/+$/, '') + '/v1/chat/completions';
    }

    /**
     * 构造请求负载（OpenAI 兼容）
     * @remarks 默认非流式；可根据需要添加 temperature / max_tokens 等参数。
     */
    const payload = { model, messages, stream: false };
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        /**
         * 兼容多种服务的鉴权头：
         * - Authorization: Bearer <key>（OpenAI/DeepSeek 常用）
         * - X-API-KEY / X-Api-Key（部分兼容服务使用）
         */
        'Authorization': `Bearer ${apiKey}`,
        'X-API-KEY': apiKey,
        'X-Api-Key': apiKey,
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = (data && (data.error?.message || data.error || data.message)) || `AI 服务返回错误（HTTP ${res.status}）`;
      // 打印详细错误上下文便于排查（不包含密钥）
      console.error('[ai/chat] fetch error', {
        status: res.status,
        endpoint,
        payloadSummary: { model, messagesLen: Array.isArray(messages) ? messages.length : 0 },
        responseSample: typeof data === 'string' ? data.slice(0, 200) : JSON.stringify(data).slice(0, 200)
      });
      throw new Error(String(msg));
    }

    /**
     * 解析常见响应格式：
     * - OpenAI 风格：data.choices[0].message.content
     * - 一些兼容服务：data.output_text
     */
    const content: string | undefined = data?.choices?.[0]?.message?.content
      ?? data?.choices?.[0]?.delta?.content
      ?? data?.choices?.[0]?.message?.reasoning_content
      ?? data?.output_text
      ?? (typeof data === 'string' ? data : undefined);
    if (!content) throw new Error('未从 AI 服务响应中解析到文本内容');
    // 入库：记录最新一条用户消息与本次助手回复
    try {
      const now = Date.now();
      const last = Array.isArray(messages) && messages.length ? messages[messages.length - 1] : undefined;
      if (last && last.role && last.content) {
        insertChatMessage(now - 1, (last.role as any) || 'user', String(last.content));
      }
      insertChatMessage(now, 'assistant', String(content));
    } catch (e) {
      // 静默入库错误，避免影响聊天流程
      console.error('[ai/chat] log to db failed', e);
    }
    return NextResponse.json({ ok: true, content });
  } catch (err: unknown) {
    return NextResponse.json({ ok: false, error: (err as Error).message || 'AI 聊天失败' }, { status: 400 });
  }
}

/**
 * 指定 Node.js 运行时
 * @remarks 需使用服务端环境变量与 Node fetch 能力，明确为 nodejs。
 */
export const runtime = 'nodejs';