import { NextRequest, NextResponse } from 'next/server';
import { insertDecision, updateDecisionStatusInDb, queryAllDecisions, type DecisionRow } from '@/lib/db';

/**
 * 获取所有决策
 * GET /api/decisions
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = searchParams.get('limit');
    
    const decisions = queryAllDecisions(limit ? parseInt(limit) : undefined);
    
    return NextResponse.json({ 
      success: true, 
      data: decisions 
    });
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

