import { NextRequest, NextResponse } from 'next/server';
import { 
  insertPromptVersion, 
  updatePromptVersionMetrics,
  setActivePromptVersion,
  getActivePromptVersion,
  queryPromptVersions,
  PromptVersionRow 
} from '@/lib/db';

/**
 * 获取提示词版本
 * GET /api/prompt-versions?limit=10
 * GET /api/prompt-versions?action=active (获取当前活跃版本)
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action');
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : undefined;
    
    // 获取活跃版本
    if (action === 'active') {
      const activeVersion = getActivePromptVersion();
      
      if (!activeVersion) {
        return NextResponse.json({
          success: false,
          error: '没有活跃的提示词版本'
        }, { status: 404 });
      }
      
      return NextResponse.json({
        success: true,
        data: activeVersion
      });
    }
    
    // 查询所有版本
    const versions = queryPromptVersions(limit);
    
    return NextResponse.json({
      success: true,
      data: versions,
      count: versions.length
    });
  } catch (error) {
    console.error('[prompt-versions API] 查询失败:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '查询失败'
    }, { status: 500 });
  }
}

/**
 * 创建新的提示词版本
 * POST /api/prompt-versions
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { version, prompt_content, is_active } = body;
    
    if (!version || !prompt_content) {
      return NextResponse.json({
        success: false,
        error: '缺少必要字段: version, prompt_content'
      }, { status: 400 });
    }
    
    const newVersion: PromptVersionRow = {
      version,
      prompt_content,
      is_active: is_active || false,
      created_at: Date.now()
    };
    
    insertPromptVersion(newVersion);
    
    // 如果设置为活跃，更新活跃状态
    if (is_active) {
      setActivePromptVersion(version);
    }
    
    return NextResponse.json({
      success: true,
      message: '提示词版本已创建',
      data: newVersion
    });
  } catch (error) {
    console.error('[prompt-versions API] 创建失败:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '创建失败'
    }, { status: 500 });
  }
}

/**
 * 更新提示词版本
 * PATCH /api/prompt-versions
 */
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { version, action, metrics } = body;
    
    if (!version) {
      return NextResponse.json({
        success: false,
        error: '缺少version参数'
      }, { status: 400 });
    }
    
    // 设置为活跃版本
    if (action === 'set-active') {
      setActivePromptVersion(version);
      
      return NextResponse.json({
        success: true,
        message: `版本 ${version} 已设置为活跃`
      });
    }
    
    // 更新性能指标
    if (action === 'update-metrics' && metrics) {
      updatePromptVersionMetrics(version, metrics);
      
      return NextResponse.json({
        success: true,
        message: '性能指标已更新'
      });
    }
    
    return NextResponse.json({
      success: false,
      error: '不支持的操作'
    }, { status: 400 });
  } catch (error) {
    console.error('[prompt-versions API] 更新失败:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '更新失败'
    }, { status: 500 });
  }
}

/**
 * 指定 Node.js 运行时
 */
export const runtime = 'nodejs';

