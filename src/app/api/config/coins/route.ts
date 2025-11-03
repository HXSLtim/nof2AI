import { NextResponse } from 'next/server';
import { getEnabledCoins, saveCoinToggles } from '@/lib/db';

export const runtime = 'nodejs';

/**
 * GET /api/config/coins
 * 获取启用的币种列表
 */
export async function GET() {
  try {
    const enabledCoins = getEnabledCoins();
    return NextResponse.json({ success: true, enabledCoins });
  } catch (error: any) {
    return NextResponse.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
}

/**
 * POST /api/config/coins
 * 保存启用的币种列表
 * Body: { enabledCoins: ['BTC', 'ETH', ...] }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const enabledCoins = body.enabledCoins;
    
    if (!Array.isArray(enabledCoins)) {
      return NextResponse.json({ 
        success: false, 
        error: 'enabledCoins must be an array' 
      }, { status: 400 });
    }
    
    saveCoinToggles(enabledCoins);
    console.log('[config/coins] 币种配置已保存:', enabledCoins);
    
    return NextResponse.json({ success: true, enabledCoins });
  } catch (error: any) {
    return NextResponse.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
}

