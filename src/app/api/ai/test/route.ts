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
    const baseUrl: string | undefined = body.baseUrl ?? process.env.AI_SERVICE_URL;
    const apiKey: string | undefined = body.apiKey ?? process.env.AI_API_KEY;
    const model: string | undefined = body.model ?? process.env.AI_MODEL_ID ?? 'deepseek-chat';

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
  const baseUrl = process.env.AI_SERVICE_URL;
  const apiKey = process.env.AI_API_KEY;
  const model = process.env.AI_MODEL_ID ?? 'deepseek-chat';
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