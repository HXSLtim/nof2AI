import { NextResponse } from 'next/server';

/**
 * AI配置测试接口
 * GET /api/ai/test
 * 
 * 返回环境变量中的AI配置信息（用于设置页面）
 */
export async function GET() {
  try {
    const baseUrl = process.env.AI_BASE_URL || 'http://localhost:8000';
    const model = process.env.AI_MODEL || 'gpt-5-high';
    const apiKey = process.env.AI_API_KEY;
    
    return NextResponse.json({
      ok: true,
      info: {
        baseUrl,
        model,
        hasKey: !!apiKey
      }
    });
  } catch (error) {
    console.error('[ai/test] 读取配置失败:', error);
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : '读取配置失败'
    }, { status: 500 });
  }
}

/**
 * 指定 Node.js 运行时
 */
export const runtime = 'nodejs';


