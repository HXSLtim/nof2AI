# 修复：止损后重复平仓问题

## 问题描述

当仓位被止损（Stop Loss）或止盈（Take Profit）自动打掉后，AI仍然会尝试重复平仓该仓位，导致错误。

### 问题根源

1. **数据不同步**：
   - `queryActiveOpenDecisions()` 函数从数据库查询"活跃"的开仓决策
   - 该函数只检查数据库中是否有对应的CLOSE决策，不检查交易所实际仓位
   
2. **止损场景**：
   - AI发出 OPEN_LONG 决策 → 执行成功
   - 仓位触发止损，OKX自动平仓
   - 数据库中没有 CLOSE 决策记录（因为是交易所自动止损）
   - `queryActiveOpenDecisions()` 仍认为该仓位"活跃"
   
3. **AI行为**：
   - AI看到"活跃决策"显示有仓位
   - 但在"实际仓位"中找不到
   - AI可能会误认为需要平仓，发出 CLOSE 指令
   - 导致尝试平掉不存在的仓位

## 解决方案

### 1. 修改 `/api/ai/prompt/route.ts` - 过滤已被止损的决策

**核心改进**：在生成提示词时，将历史决策与交易所实际仓位进行对比，只显示真正存在的仓位。

```typescript
// 拉取当前实际仓位（来自OKX）
const positions = await fetchPositions().catch(() => [] as any[]);

// 获取活跃的开仓决策（还未平仓的）- 需要与实际仓位对比
const activeDecisions = queryActiveOpenDecisions();

// 🔧 修复：只保留在实际交易所仓位中存在的决策（过滤掉已被止损的）
const actualActiveDecisions = activeDecisions.filter(d => {
  const parsed = parseDecisionFromText(d.reply || '');
  if (!parsed) return false;
  
  const symbol = parsed.symbol;
  const isLong = parsed.action.includes('LONG');
  
  // 检查是否在实际仓位中存在匹配的仓位
  return positions.some((p: any) => {
    const posCoin = String(p.coin || (p.symbol ? String(p.symbol).split('-')[0] : ''));
    const posSide = String(p.side || '').toLowerCase();
    const posQty = Math.abs(Number(p.contracts ?? p.quantity ?? 0));
    
    return posCoin === symbol && 
           ((isLong && posSide === 'long') || (!isLong && posSide === 'short')) &&
           posQty > 0;
  });
});
```

**改进点**：
- ✅ 将历史决策与实际仓位进行交叉验证
- ✅ 只显示真正存在于交易所的仓位
- ✅ 自动过滤掉已被止损/止盈的仓位
- ✅ 提示文字改为 "verified to still exist on exchange"

### 2. 强化提示词规则

在提示词的 footer 部分添加了明确的 CRITICAL RULES：

```
⚠️ CRITICAL RULES FOR CLOSE ACTIONS:
1. ONLY close positions that exist in "CURRENT LIVE POSITIONS" section above
2. If "CURRENT LIVE POSITIONS" shows "None", DO NOT issue any CLOSE action
3. If a position was in your history but NOT in current live positions, it means:
   - Already closed by Take Profit (TP)
   - Already closed by Stop Loss (SL)
   - The open order failed or was cancelled
4. DO NOT try to close a position that doesn't exist - this will cause an error
5. Before any CLOSE_LONG or CLOSE_SHORT action, VERIFY the position exists in live positions

Example check:
- If you see BTC LONG in live positions → OK to issue CLOSE_LONG for BTC
- If you DON'T see BTC LONG in live positions → DO NOT issue CLOSE_LONG for BTC (already closed)
```

### 3. 修改 `ai-trading-prompt.ts` - 更新交易规则

在 CLOSING POSITIONS 规则的开头添加：

```
2. CLOSING POSITIONS - STRICT THRESHOLDS (DO NOT close positions prematurely):
   - ⚠️ CRITICAL: ONLY close positions that exist in "CURRENT LIVE POSITIONS" section
   - If position is NOT in live positions, it's already closed (by TP/SL) - DO NOT try to close it again
   - Check the "QUICK SUMMARY" section which shows profit AFTER FEES
   ...
```

## 预期效果

### 修复前
```
历史决策: BTC LONG (opened 30 min ago)
实际仓位: None (已被止损打掉)
AI行为: 看到历史决策 → 尝试 CLOSE_LONG BTC → 错误
```

### 修复后
```
历史决策: BTC LONG (opened 30 min ago)
实际仓位: None (已被止损打掉)
过滤后的活跃决策: [] (空 - 因为实际不存在)
AI看到的提示: "CURRENT LIVE POSITIONS: None"
AI行为: 不会尝试平仓 ✅
```

## 优势

1. **数据一致性**：确保AI看到的仓位信息与交易所实际仓位一致
2. **防止错误**：避免尝试平掉不存在的仓位
3. **多层保护**：
   - 代码层：过滤掉已止损的决策
   - 提示词层：明确规则和示例
   - AI理解层：提供清晰的判断标准
4. **可维护性**：逻辑清晰，易于理解和调试

## 文件修改

- ✅ `src/app/api/ai/prompt/route.ts` - 添加仓位过滤逻辑
- ✅ `src/lib/ai-trading-prompt.ts` - 强化平仓规则

## 测试建议

1. 开一个仓位，设置较紧的止损
2. 等待止损触发
3. 观察AI的下一次决策
4. 确认AI不会尝试平掉已被止损的仓位

## 日期

2025-11-03

