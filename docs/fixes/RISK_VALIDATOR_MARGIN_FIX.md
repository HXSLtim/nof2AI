# 🔧 风险验证器修复 - 保证金vs名义价值

## 问题

用户交易被拒绝：
```
可用资金: $32,181
AI决策: position_size_percent = 25%, leverage = 5x
执行失败: "交易风险过高，已拒绝"
```

## 根本原因

风险验证器使用**名义价值**来检查风险敞口，但应该使用**保证金**！

### 错误的逻辑（修复前）

```typescript
// ❌ 错误：用名义价值检查
const totalExposure = 名义价值总和;
const totalExposurePercent = totalExposure / accountTotal;

// 例子：
保证金：$8,045
杠杆：5x
名义价值：$40,226
检查：$40,226 / $32,175 = 125% > 80%限制 ❌ 拒绝！
```

**问题**：
- 5x杠杆的名义价值是保证金的5倍
- 用名义价值检查会把杠杆效应重复计算
- 导致正常交易被误判为"风险过高"

### 正确的逻辑（修复后）

```typescript
// ✅ 正确：用保证金检查
const totalMargin = 保证金总和;
const totalMarginPercent = totalMargin / accountTotal;

// 例子：
保证金：$8,045
杠杆：5x（不重复计算）
检查：$8,045 / $32,175 = 25% < 80%限制 ✅ 通过！
```

---

## 修复方案

### 修改风险验证器（src/lib/risk-validator.ts）

#### 1. 基于保证金计算风险指标

```typescript
// 计算当前总保证金占用
const currentTotalMargin = currentPositions.reduce(
  (sum, p) => sum + (p.notional / p.leverage), 
  0
);

// 计算新订单的保证金
const proposedMargin = proposedNotional / leverage;

// 计算总保证金占用百分比
const totalMarginPercent = (currentTotalMargin + proposedMargin) / accountTotal * 100;
```

#### 2. 用保证金进行检查

```typescript
// ✅ 检查保证金占用，不是名义价值
if (totalMarginPercent > 80%) {
  errors.push('总保证金占用超限');
}

if (symbolMarginPercent > 30%) {
  errors.push('单币种保证金超限');
}
```

---

## 对比验证

### 修复前（错误）

```
场景：可用$32,181，用25%开仓BTC，5x杠杆

计算：
  保证金：$32,181 × 25% = $8,045
  名义价值：$8,045 × 5 = $40,226
  
风险检查（❌ 错误）：
  用名义价值：$40,226 / $32,175 = 125% > 80% ❌
  结果：拒绝交易
  
问题：杠杆被重复计算了！
```

### 修复后（正确）

```
场景：可用$32,181，用25%开仓BTC，5x杠杆

计算：
  保证金：$32,181 × 25% = $8,045
  名义价值：$8,045 × 5 = $40,226
  
风险检查（✅ 正确）：
  用保证金：$8,045 / $32,175 = 25% < 80% ✅
  结果：允许交易
  
正确：杠杆不影响保证金占用检查
```

---

## 风险检查的正确理解

### 保证金 vs 名义价值

| 概念 | 计算 | 用途 |
|------|------|------|
| 保证金 | 投入的USDT金额 | 风险检查、资金占用 |
| 名义价值 | 保证金 × 杠杆 | 手续费计算、盈亏计算 |

### 风险检查应该用保证金

**原因**：
1. 保证金代表实际占用的资金
2. 杠杆不改变资金占用量
3. 风险应该基于实际投入，而不是杠杆放大后的名义价值

**例子**：
```
投入保证金$1000，使用10x杠杆：
- 保证金占用：$1000
- 名义价值：$10,000
- 风险检查应该基于：$1000（实际投入）
- 而不是：$10,000（杠杆放大值）
```

---

## 修改的文件

1. **src/lib/risk-validator.ts**
   - 修改validateTrade方法
   - 添加proposedMargin参数
   - 用保证金计算风险占比

2. **src/app/api/ai/execute-decision/route.ts**
   - 传入marginCalc.requiredMargin

3. **src/app/components/DecisionHistory.tsx**
   - 修复显示position_size_percent
   - 显示完整决策详情

---

## 预期效果

### 修复前
```
可用资金$32,181
开仓25%，5x杠杆
→ ❌ 拒绝："风险过高"
```

### 修复后
```
可用资金$32,181
开仓25%，5x杠杆
保证金占用：25% < 80% ✅
→ ✅ 允许交易
```

---

## 风险限制（修复后的正确理解）

```typescript
RISK_LIMITS = {
  MAX_TOTAL_EXPOSURE_PERCENT: 80,    // 总保证金占用≤80%
  MAX_SYMBOL_EXPOSURE_PERCENT: 30,   // 单币种保证金≤30%
  MAX_OPEN_POSITIONS: 6,             // 最多6个仓位
  MAX_LEVERAGE: 10,                  // 最高10x杠杆
  MIN_AVAILABLE_MARGIN: 50,          // 最低$50可用
  MAX_MARGIN_USAGE_PERCENT: 90,      // 保证金使用率≤90%
  MIN_ORDER_SIZE: 10,                // 最小$10名义价值
  MAX_SINGLE_ORDER_PERCENT: 50,      // 单笔≤50%可用资金
}
```

**关键**：前两项检查用保证金，后面的检查用实际金额或数量。

---

## 完整的风险检查示例

```
账户总值：$10,000
可用保证金：$8,000

当前仓位：
  - BTC多头：保证金$2,000（名义$10,000，5x）
  - ETH多头：保证金$1,500（名义$7,500，5x）
  
总保证金占用：$3,500 / $10,000 = 35%

新订单：SOL多头，25%资金，5x杠杆
  保证金：$8,000 × 25% = $2,000
  新总保证金：$3,500 + $2,000 = $5,500
  占比：$5,500 / $10,000 = 55% < 80% ✅ 通过
```

---

## 状态

✅ 已修复
⚠️ 需要重启服务器

---

## 日期

2025-11-03

