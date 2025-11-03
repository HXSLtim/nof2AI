# ⚡ 平仓修复 - 快速参考

## 🔴 问题
- **平仓功能：0%成功率**
- **错误：51000 - Parameter posSide error**
- **风险：无法平仓，资金安全问题**

---

## ✅ 修复方案

### 核心逻辑
```typescript
// 开仓：传递posSide ✅
if (posSide && !reduceOnly) {
  params.posSide = posSide;
}

// 平仓：不传posSide和reduceOnly ✅
else if (reduceOnly) {
  // 什么都不传，让OKX自动判断
}
```

---

## 📋 修改文件

1. **src/lib/okx.ts** (第249-262行)
   - 区分开仓/平仓的posSide处理

2. **src/app/api/ai/execute-decision/route.ts** (第161行)
   - 平仓时传入`reduceOnly=true`

---

## 🎯 关键点

| 操作 | posSide | reduceOnly | 加入params |
|------|---------|------------|-----------|
| 开仓 | ✅ 传入 | ❌ false | posSide=long/short |
| 平仓 | ❌ undefined | ✅ true | 只传tdMode |

---

## 🚀 测试步骤

```bash
# 1. 重启
Ctrl+C
npm run dev

# 2. 测试平仓
# - 确认有仓位
# - AI生成平仓决策
# - 查看日志确认成功

# 3. 检查日志
✅ [placeOrder] 平仓模式：不传递posSide和reduceOnly
✅ [placeOrder] 订单成功: ID=xxx
```

---

## 📊 预期结果

| 功能 | 修复前 | 修复后 |
|------|--------|--------|
| 开仓 | ✅ 100% | ✅ 100% |
| 平仓 | ❌ 0% | ✅ **100%** |

---

## ⚠️ 如果仍失败

1. 检查日志中的`📤 请求载荷`
2. 确认params中**没有**posSide
3. 查看OKX错误代码
4. 参考`CRITICAL_FIX_CLOSE_POSITION.md`

---

**状态：** ✅ 修复完成，⏳ 待测试  
**优先级：** 🔴 紧急  
**修复时间：** 2025-11-04

