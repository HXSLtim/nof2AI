import { NextRequest, NextResponse } from 'next/server';

/**
 * AI 测试与环境读取路由
 * @route POST /api/ai/test
 * @route GET /api/ai/test
 * @description
 * - POST：接收可选的 `baseUrl`、`apiKey`、`model` 参数，缺省时从环境变量读取（AI_SERVICE_URL、AI_API_KEY、AI_MODEL_ID）。
 * - GET：返回环境变量读取结果（不泄露密钥具体值，仅给出是否存在）。
 * @remarks
 * 1) 该路由不再依赖外部 `/health` 探测，避免由于第三方无健康检查端点导致测试失败。
 * 2) 若请求体与环境变量均缺省，将返回 400 错误提示缺失。
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

    const model: string | undefined = body.model
      ?? process.env.AI_MODEL_ID
      ?? process.env.OPENAI_MODEL_NAME
      ?? process.env.DEEPSEEK_MODEL_ID
      ?? process.env.AZURE_OPENAI_DEPLOYMENT
      ?? 'deepseek-chat';

    if (!baseUrl) throw new Error('缺少 Base URL（请在请求或 .env 中设置 AI_SERVICE_URL）');

    // 最小化校验：URL 格式与 Key 存在性（不泄露具体值）
    let parsed: URL | null = null;
    try { parsed = new URL(baseUrl); } catch { parsed = null; }
    if (!parsed) throw new Error('Base URL 格式不合法');

    const hasKey = !!apiKey && apiKey.trim().length > 0;
    const info = { baseUrl: parsed.origin, model, hasKey };
    return NextResponse.json({ ok: true, info });
  } catch (err: unknown) {
    return NextResponse.json({ error: (err as Error).message || 'AI 服务配置读取失败' }, { status: 400 });
  }
}

/**
 * 读取环境变量（GET）
 * @returns `{ ok: true, info: { baseUrl, model, hasKey } }`；不返回密钥明文
 */
export async function GET() {
  /**
   * 读取环境变量（支持多种常用变量名）
   */
  const baseUrl = process.env.AI_SERVICE_URL
    ?? process.env.OPENAI_BASE_URL
    ?? process.env.OPENAI_API_HOST
    ?? process.env.DEEPSEEK_API_BASE
    ?? process.env.AZURE_OPENAI_ENDPOINT;
  const apiKey = process.env.AI_API_KEY
    ?? process.env.OPENAI_API_KEY
    ?? process.env.DEEPSEEK_API_KEY
    ?? process.env.AZURE_OPENAI_API_KEY;
  const model = process.env.AI_MODEL_ID
    ?? process.env.OPENAI_MODEL_NAME
    ?? process.env.DEEPSEEK_MODEL_ID
    ?? process.env.AZURE_OPENAI_DEPLOYMENT
    ?? 'deepseek-chat';
  const info = {
    baseUrl: baseUrl ? (() => { try { return new URL(baseUrl).origin; } catch { return baseUrl; } })() : undefined,
    model,
    hasKey: !!(apiKey && apiKey.trim().length > 0),
  };
  if (!info.baseUrl) {
    return NextResponse.json({ ok: false, error: '未配置 AI_SERVICE_URL（请设置 .env.local）' }, { status: 400 });
  }
  return NextResponse.json({ ok: true, info });
}

/**
 * 指定 Node.js 运行时
 * @remarks 使用服务端环境变量与 Node 能力，确保 Node 运行时。
 */
export const runtime = 'nodejs';