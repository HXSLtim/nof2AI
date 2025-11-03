import { NextResponse } from 'next/server';
import { fetchPositions } from '@/lib/okx';

export async function GET() {
  try {
    const list = await fetchPositions();
    return NextResponse.json({ success: true, data: list });
  } catch (err: any) {
    console.error('[api/positions] Error', err.constructor.name, err.message || err);
    
    // 检查是否是 OKX API 认证错误
    const errorMsg = err.message || String(err);
    if (errorMsg.includes('50101') || errorMsg.includes('APIKey does not match')) {
      return NextResponse.json({ 
        success: false, 
        error: 'OKX API 认证失败：请检查环境变量配置（API Key、Secret、Password）及环境设置（OKX_SANDBOX）',
        details: '错误代码 50101 - API Key 与当前环境不匹配。如使用模拟盘，请确保 OKX_SANDBOX=true；如使用实盘，请确保 OKX_SANDBOX=false 或未设置。',
        rawError: errorMsg
      }, { status: 401 });
    }
    
    return NextResponse.json({ 
      success: false, 
      error: err.message || '获取仓位失败',
      details: errorMsg
    }, { status: 500 });
  }
}