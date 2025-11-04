import { NextRequest, NextResponse } from 'next/server';
import { insertDecision, updateDecisionStatusInDb, queryAllDecisions, type DecisionRow } from '@/lib/db';
import { decisionsCache } from '@/services/CacheService';

/**
 * 获取所有决策（带缓存优化）
 * GET /api/decisions
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = searchParams.get('limit');
    const limitNum = limit ? parseInt(limit) : undefined;
    
    const cacheKey = `decisions:${limitNum || 'all'}`;
    
    // 尝试从缓存获取
    const cached = decisionsCache.get<DecisionRow[]>(cacheKey);
    if (cached) {
      console.log('[api/decisions] ✅ 从缓存获取决策 (缓存命中)');
      return NextResponse.json(
        { 
          success: true, 
          data: cached 
        },
        {
          headers: {
            'X-Cache': 'HIT',
            'X-Cache-Age': '10000', // 10秒缓存
          },
        }
      );
    }
    
    // 缓存未命中，查询数据库
    console.log('[api/decisions] 🔄 从数据库查询决策');
    const decisions = queryAllDecisions(limitNum);
    
    // 缓存结果（10秒）
    decisionsCache.set(cacheKey, decisions, 10000);
    
    return NextResponse.json(
      { 
        success: true, 
        data: decisions 
      },
      {
        headers: {
          'X-Cache': 'MISS',
        },
      }
    );
  } catch (error) {
    const err = error as Error;
    console.error('[api/decisions] GET失败:', error);
    return NextResponse.json({ 
      success: false, 
      error: err.message 
    }, { status: 500 });
  }
}

/**
 * 创建新决策
 * POST /api/decisions
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    const decision: DecisionRow = {
      id: body.id,
      title: body.title,
      desc: body.desc,
      ts: body.ts,
      status: body.status,
      prompt: body.prompt,
      reply: body.reply
    };
    
    insertDecision(decision);
    
    // 使决策缓存失效
    decisionsCache.invalidate('decisions:');
    console.log('[api/decisions] 💥 决策缓存已失效（新建决策）');
    
    return NextResponse.json({ 
      success: true,
      data: decision
    });
  } catch (error) {
    const err = error as Error;
    console.error('[api/decisions] POST失败:', error);
    return NextResponse.json({ 
      success: false, 
      error: err.message 
    }, { status: 500 });
  }
}

/**
 * 更新决策状态
 * PATCH /api/decisions
 */
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, status } = body;
    
    if (!id || !status) {
      return NextResponse.json({ 
        success: false, 
        error: '缺少必要参数: id, status' 
      }, { status: 400 });
    }
    
    updateDecisionStatusInDb(id, status);
    
    // 使决策缓存失效
    decisionsCache.invalidate('decisions:');
    console.log('[api/decisions] 💥 决策缓存已失效（更新决策）');
    
    return NextResponse.json({ 
      success: true 
    });
  } catch (error) {
    const err = error as Error;
    console.error('[api/decisions] PATCH失败:', error);
    return NextResponse.json({ 
      success: false, 
      error: err.message 
    }, { status: 500 });
  }
}

/**
 * 指定 Node.js 运行时
 */
export const runtime = 'nodejs';

