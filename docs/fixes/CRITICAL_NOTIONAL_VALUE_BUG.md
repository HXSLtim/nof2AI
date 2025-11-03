# 🚨 严重Bug：名义价值计算错误（100倍误差）

## 问题描述

用户报告：
- BTC显示名义价值：$322,539
- 实际应该是：$3,224
- 误差：100倍！

DOGE正确，只有BTC/ETH/BNB等有合约乘数的币种出错。

## 根本原因

### OKX合约规格

```typescript
// src/lib/constants.ts
CONTRACT_MULTIPLIERS = {
  'BTC': 100,  // 1张 = 0.01 BTC
  'ETH': 10,   // 1张 = 0.1 ETH
  'SOL': 1,    // 1张 = 1 SOL
  'BNB': 100,  // 1张 = 0.01 BNB
  'XRP': 0.1,  // 1张 = 10 XRP
  'DOGE': 0.01 // 1张 = 100 DOGE
}
```

### OKX API返回数据含义

OKX `/account/positions` API返回的字段：
- `pos`: 持仓数量（币数量，不是张数！）
- `notional`: 名义价值（USDT）= pos × markPx × ctMult（合约乘数）

**关键发现**：
- `pos`字段是"币"的数量（如0.03 BTC）
- `notional`字段已经考虑了合约乘数

### 当前代码的错误

```typescript
// src/lib/okx.ts 第114-127行
const contracts = Number(r.pos) || 0;  // pos是币数量，不是张数！
const notionalValue = Math.abs(Number(r.notional) || (Math.abs(contracts) * mark));
```

**问题**：
1. `pos`是币数量（如0.03 BTC），我们命名为`contracts`是错误的
2. OKX返回的`notional`已经是正确的USDT价值
3. 但在某些情况下，我们用`contracts × mark`计算，忽略了合约乘数

### 示例计算

**BTC案例**：
- pos = 0.03 BTC（币数量）
- markPx = $107466.3
- 合约乘数 = 100（1张 = 0.01 BTC）
- 实际张数 = 0.03 × 100 = 3张

**错误计算**（当前代码）：
```
如果fallback: contracts × mark = 0.03 × 107466.3 = 3223.99 ✅ 这是对的
```

**但实际notional**：
```
OKX返回：notional = 322398.9
这是 3223.99 的 100倍！
```

**为什么OKX返回322398.9？**

可能的原因：
1. OKX的notional字段包含了某种乘数
2. 或者OKX计算公式是：pos × markPx × ctMult
   - 0.03 × 107466.3 × 100 = 322398.9 ✅

## 解决方案

### 方案1：信任OKX返回的notional（推荐）

```typescript
// ✅ 直接使用OKX返回的notional
const notionalValue = Math.abs(Number(r.notional));
```

### 方案2：自己计算（需要考虑合约乘数）

```typescript
// 如果OKX没返回notional，自己计算
const coin = r.instId.split('-')[0];
const multiplier = CONTRACT_MULTIPLIERS[coin] || 1;
const posInCoins = Number(r.pos);
const contractsCount = posInCoins * multiplier;  // 币数量 × 乘数 = 张数
const notionalValue = contractsCount * mark;
```

### 方案3：理解OKX的notional定义

需要验证OKX文档：`notional`字段是否已经包含了合约乘数。

如果OKX文档说明`notional = pos × markPx × ctMult`，那么：
- BTC: 0.03 × 107466.3 × 100 = 322398.9
- 这就解释了100倍的差异！

## 临时修复

```typescript
// src/lib/okx.ts fetchPositions函数
const coin = instId.split('-')[0];
const multiplier = CONTRACT_MULTIPLIERS[coin] || 1;
const posInCoins = Number(r.pos) || 0;  // 币数量

// OKX返回的notional可能已经乘了合约乘数，需要除回去
let notionalValue = Math.abs(Number(r.notional));
if (notionalValue && multiplier !== 1) {
  notionalValue = notionalValue / multiplier;  // 除以乘数得到真实USDT价值
}

// 如果没有notional，自己计算
if (!notionalValue) {
  const contractsCount = posInCoins * multiplier;
  notionalValue = contractsCount * markPrice;
}
```

## 需要验证

1. 检查OKX官方文档对`notional`字段的定义
2. 实际测试BTC/ETH/BNB的仓位显示
3. 确认DOGE/SOL等币种是否正确（它们的乘数不是100）

## 影响范围

- ❌ 仓位显示：名义价值错误
- ❌ 手续费计算：基于错误的名义价值
- ❌ 反思记录：盈亏百分比错误
- ❌ 提示词数据：AI看到错误的仓位价值

## 优先级

🔴 **P0 - 紧急** - 影响核心交易逻辑和显示

