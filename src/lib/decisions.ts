/**
 * 决策管理模块（客户端）
 * 
 * 通过API与数据库交互，实现决策的持久化存储
 */

export type Decision = {
  id: string;
  title: string;
  desc: string;
  ts: number;
  status: 'pending' | 'approved' | 'rejected';
  prompt?: string;
  reply?: string;
};

type Listener = (items: Decision[]) => void;
const listeners: Listener[] = [];
let cachedDecisions: Decision[] = [];

/**
 * 从服务端获取所有决策
 */
async function fetchDecisionsFromServer(): Promise<Decision[]> {
  try {
    const res = await fetch('/api/decisions', { cache: 'no-store' });
    const json = await res.json();
    if (json.success && Array.isArray(json.data)) {
      return json.data;
    }
    return [];
  } catch (error) {
    console.error('[decisions] 获取决策失败:', error);
    return [];
  }
}

/**
 * 获取决策列表（从缓存）
 */
export function getDecisions(): Decision[] {
  return cachedDecisions.slice();
}

/**
 * 刷新决策列表（从服务端）
 */
export async function refreshDecisions(): Promise<void> {
  const decisions = await fetchDecisionsFromServer();
  cachedDecisions = decisions;
  for (const fn of listeners) fn(decisions);
}

/**
 * 发布新决策
 */
export async function publishDecision(d: Decision): Promise<void> {
  try {
    // 先更新到服务端
    const res = await fetch('/api/decisions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(d)
    });
    
    if (!res.ok) {
      throw new Error('保存决策失败');
    }
    
    // 刷新缓存
    await refreshDecisions();
  } catch (error) {
    console.error('[decisions] 发布决策失败:', error);
    throw error;
  }
}

/**
 * 更新决策状态
 */
export async function updateDecisionStatus(id: string, status: 'approved' | 'rejected'): Promise<void> {
  try {
    // 更新到服务端
    const res = await fetch('/api/decisions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status })
    });
    
    if (!res.ok) {
      throw new Error('更新决策状态失败');
    }
    
    // 刷新缓存
    await refreshDecisions();
  } catch (error) {
    console.error('[decisions] 更新状态失败:', error);
    throw error;
  }
}

/**
 * 订阅决策变化
 */
export function subscribeDecisions(fn: Listener): () => void {
  listeners.push(fn);
  
  // 初次加载：从服务端获取数据
  refreshDecisions().then(() => {
    try { fn(cachedDecisions.slice()); } catch {}
  });
  
  return () => {
    const idx = listeners.indexOf(fn);
    if (idx >= 0) listeners.splice(idx, 1);
  };
}

/**
 * 从 AI 回复文本中粗略解析决策标题与描述
 * @remarks 依据关键词（开仓/平仓/止损/止盈/多/空/buy/sell/long/short）进行抽取；若未命中则返回空数组。
 */
export function extractDecisionsFromText(text: string): Array<{ title: string; desc: string }> {
  const lines = text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const keywords = ['开仓', '平仓', '止损', '止盈', '加仓', '减仓', '做多', '做空', 'buy', 'sell', 'long', 'short'];
  const hit = lines.find((l) => keywords.some((k) => l.toLowerCase().includes(k)));
  if (!hit) return [];
  const title = hit.length > 36 ? hit.slice(0, 36) + '…' : hit;
  const desc = text.length > 400 ? text.slice(0, 400) + '…' : text;
  return [{ title, desc }];
}