import { NextRequest, NextResponse } from 'next/server';
import { 
  queryTradeReflections, 
  getTradeReflectionByDecisionId,
  getTradeStatistics,
  TradeReflectionRow 
} from '@/lib/db';
import { generateReflectionSummary, getReflectionsForPromptOptimization } from '@/lib/trade-reflection';

/**
 * 获取交易反思记录
 * GET /api/reflections?symbol=BTC&outcome=profit&limit=20
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    
    const symbol = searchParams.get('symbol') || undefined;
    const outcome = searchParams.get('outcome') as 'profit' | 'loss' | 'breakeven' | 'pending' | undefined;
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : undefined;
    const decisionId = searchParams.get('decisionId');
    const action = searchParams.get('action'); // 特殊操作：summary, stats, prompt-optimization
    
    // 特殊操作：获取摘要报告
    if (action === 'summary') {
      const days = searchParams.get('days') ? parseInt(searchParams.get('days')!) : 7;
      const summary = generateReflectionSummary({ symbol, days });
      
      return NextResponse.json({
        success: true,
        data: summary
      });
    }
    
    // 特殊操作：获取统计数据
    if (action === 'stats') {
      const days = searchParams.get('days') ? parseInt(searchParams.get('days')!) : undefined;
      const stats = getTradeStatistics({ symbol, days });
      
      return NextResponse.json({
        success: true,
        data: stats
      });
    }
    
    // 特殊操作：获取提示词优化数据
    if (action === 'prompt-optimization') {
      const optimizationData = getReflectionsForPromptOptimization();
      
      return NextResponse.json({
        success: true,
        data: optimizationData
      });
    }
    
    // 根据决策ID获取单条记录
    if (decisionId) {
      const reflection = getTradeReflectionByDecisionId(decisionId);
      
      if (!reflection) {
        return NextResponse.json({
          success: false,
          error: '未找到反思记录'
        }, { status: 404 });
      }
      
      return NextResponse.json({
        success: true,
        data: reflection
      });
    }
    
    // 查询多条记录
    const since = searchParams.get('since') ? parseInt(searchParams.get('since')!) : undefined;
    
    const reflections = queryTradeReflections({
      symbol,
      outcome,
      limit,
      since
    });
    
    return NextResponse.json({
      success: true,
      data: reflections,
      count: reflections.length
    });
  } catch (error) {
    console.error('[reflections API] 查询失败:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '查询失败'
    }, { status: 500 });
  }
}

/**
 * 创建或更新反思记录（通常由系统自动调用）
 * POST /api/reflections
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, data } = body;
    
    if (action === 'auto-update') {
      // 自动更新待定交易结果
      const { autoUpdateTradeOutcomes } = await import('@/lib/trade-reflection');
      await autoUpdateTradeOutcomes();
      
      return NextResponse.json({
        success: true,
        message: '自动更新完成'
      });
    }
    
    return NextResponse.json({
      success: false,
      error: '不支持的操作'
    }, { status: 400 });
  } catch (error) {
    console.error('[reflections API] 操作失败:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '操作失败'
    }, { status: 500 });
  }
}

/**
 * 指定 Node.js 运行时
 */
export const runtime = 'nodejs';


