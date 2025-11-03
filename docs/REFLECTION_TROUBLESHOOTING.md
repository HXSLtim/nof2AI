# 🔧 反思系统故障排查指南

## 问题：交易完成但反思报告没有记录

### 根本原因

**decisionId 未正确传递给 execute-decision API**

在之前的实现中，所有调用 `/api/ai/execute-decision` 的地方都没有传递 `decisionId`：

```typescript
// ❌ 错误的调用方式
body: JSON.stringify({ decision: parsedDecision })
```

导致：
1. 开仓时使用临时生成的 ID (`decision-${Date.now()}`)
2. 平仓时无法找到对应的开仓记录
3. 反思记录无法完成完整的生命周期

---

## 解决方案

### 修复 1: 传递 decisionId

已修复所有调用点，现在会正确传递 decisionId：

```typescript
// ✅ 正确的调用方式
body: JSON.stringify({ 
  decision: parsedDecision,
  decisionId: decision.id  // 传递决策ID
})
```

**修复的文件：**
1. `src/app/components/DecisionHistory.tsx` - 4处调用
2. `src/app/components/Positions.tsx` - 1处调用（一键平仓）

---

## 工作流程

### 完整的反思记录流程

```
1. AI 生成决策
   ↓
2. 用户批准/自动执行
   ↓
3. 调用 /api/ai/execute-decision
   传递: { decision, decisionId }
   ↓
4. 开仓成功
   ↓
5. recordTradeOpen() 记录
   - decision_id = decisionId
   - outcome = 'pending'
   - entry_price, entry_ts 等
   ↓
6. 持仓中...
   ↓
7. 平仓（自动/手动）
   ↓
8. 调用 /api/ai/execute-decision
   传递: { decision: CLOSE_XXX, decisionId }
   ↓
9. 查找对应的开仓决策
   从 decisions 表查找 OPEN_XXX
   ↓
10. recordTradeClose() 更新
    - outcome = 'profit'/'loss'/'breakeven'
    - exit_price, exit_ts
    - pnl_amount, pnl_percentage
    - 生成 AI 反思分析
```

---

## 诊断步骤

### 步骤 1: 检查数据库表

```bash
npm run check-reflections
# 或
npx tsx scripts/check-reflections.ts
```

应该看到：
```
✅ 找到 3 个表: trade_reflections, prompt_versions, decisions
```

### 步骤 2: 检查日志

执行开仓时，控制台应该显示：

```
[execute-decision] 📊 记录开仓反思: decision-1234567890
[trade-reflection] ✅ 开仓记录已创建: decision-1234567890
```

执行平仓时，控制台应该显示：

```
[execute-decision] 📊 记录平仓反思: decision-1234567890
[trade-reflection] ✅ 平仓记录已更新: decision-1234567890
  - 结果: profit
  - 盈亏: $15.50 (3.10%)
  - 持仓时间: 45分钟
```

### 步骤 3: 手动查询数据库

```typescript
// 在浏览器控制台
fetch('/api/reflections?limit=10')
  .then(r => r.json())
  .then(d => console.log(d));
```

或者在终端：

```bash
# 查看所有反思记录
curl http://localhost:3000/api/reflections?limit=10

# 查看统计数据
curl http://localhost:3000/api/reflections?action=stats

# 查看摘要报告
curl http://localhost:3000/api/reflections?action=summary
```

---

## 常见问题

### Q1: 看到"记录开仓反思"但数据库没有记录

**可能原因：**
- 数据库写入失败
- 权限问题

**解决方案：**
```bash
# 检查数据目录权限
ls -la data/

# 确保 quant.db 可写
chmod 644 data/quant.db
```

### Q2: 开仓有记录，但平仓后没有更新

**可能原因：**
- 无法找到对应的开仓决策
- decisionId 不匹配

**解决方案：**

查看日志，如果显示：
```
⚠️ 未找到对应的开仓决策，无法记录完整反思
```

说明 decisions 表中没有匹配的 OPEN 记录。检查：

```typescript
// 查询 decisions 表
fetch('/api/decisions')
  .then(r => r.json())
  .then(d => console.log(d.data.filter(item => 
    item.title.includes('OPEN')
  )));
```

### Q3: 手动平仓（一键平仓）没有记录

**说明：**

一键平仓使用临时 ID：
```typescript
decisionId: `manual-close-${position.coin}-${Date.now()}`
```

这是因为手动平仓没有对应的 AI 决策记录。

**解决方案：**

如果需要记录手动平仓，需要：
1. 在平仓前创建一个临时决策记录
2. 使用该决策ID进行平仓
3. 反思系统会自动关联

### Q4: 反思页面显示"暂无交易记录"

**检查清单：**

1. ✅ 是否已执行过交易？
2. ✅ 执行交易时是否看到"记录开仓反思"日志？
3. ✅ 数据库中是否有记录？（运行 `npm run check-reflections`）
4. ✅ API 是否返回数据？（访问 `/api/reflections?limit=10`）
5. ✅ 浏览器控制台是否有错误？

---

## 测试反思系统

### 测试流程

1. **清空旧数据（可选）**
```sql
-- 在 SQLite 中执行
DELETE FROM trade_reflections;
DELETE FROM decisions;
```

2. **执行测试交易**
   - 开启自动执行模式
   - 手动触发一次 AI 分析
   - 等待 AI 生成决策
   - 观察控制台日志

3. **检查开仓记录**
```bash
curl http://localhost:3000/api/reflections?limit=1
```

应该返回：
```json
{
  "success": true,
  "data": [{
    "decision_id": "decision-xxx",
    "symbol": "BTC",
    "action": "OPEN_LONG",
    "outcome": "pending",
    "entry_price": 107500,
    "created_at": 1234567890000
  }]
}
```

4. **执行平仓**
   - 等待止盈止损触发
   - 或手动平仓

5. **检查完整记录**
```bash
curl http://localhost:3000/api/reflections?action=summary
```

应该看到更新的统计数据。

---

## 监控和日志

### 关键日志位置

1. **开仓记录**
   - 文件：`src/app/api/ai/execute-decision/route.ts`
   - 日志：`[execute-decision] 📊 记录开仓反思`

2. **平仓记录**
   - 文件：`src/app/api/ai/execute-decision/route.ts`
   - 日志：`[execute-decision] 📊 记录平仓反思`

3. **反思模块**
   - 文件：`src/lib/trade-reflection.ts`
   - 日志：`[trade-reflection] ✅ 开仓记录已创建`
   - 日志：`[trade-reflection] ✅ 平仓记录已更新`

### 启用详细日志

如果需要更详细的日志，可以在反思模块中添加：

```typescript
// src/lib/trade-reflection.ts
export function recordTradeOpen(params) {
  console.log('[trade-reflection] DEBUG recordTradeOpen:', params);
  // ... 原有代码
}
```

---

## 成功标志

当系统正常工作时，你应该看到：

✅ 控制台有"记录开仓反思"和"记录平仓反思"日志  
✅ `/api/reflections` 返回交易记录  
✅ `/reflections` 页面显示统计和交易列表  
✅ 统计数据准确（胜率、盈亏等）  
✅ 每笔交易都有完整的反思分析  

---

## 预防措施

为了确保反思系统持续正常工作：

1. **始终传递 decisionId**
   - 所有调用 execute-decision 的地方
   - 使用决策表中的真实 ID

2. **定期备份数据库**
```bash
cp data/quant.db data/quant.db.backup.$(date +%Y%m%d)
```

3. **定期检查**
```bash
# 每天运行一次
npm run check-reflections
```

4. **监控日志**
   - 关注反思相关的日志
   - 出现警告及时处理

---

## 相关文档

- [反思系统使用指南](./REFLECTION_SYSTEM_GUIDE.md)
- [数据库设计](./ARCHITECTURE.md)
- [API 文档](../README.md)

---

## 总结

通过此次修复，反思系统现在应该能够：

✅ 自动记录每笔交易的开仓  
✅ 自动更新平仓后的结果  
✅ 生成完整的反思分析  
✅ 提供准确的统计数据  

**如果仍然有问题，请：**
1. 运行 `npm run check-reflections` 诊断
2. 检查控制台日志
3. 查看本文档的故障排查步骤

