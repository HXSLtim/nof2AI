# 🔴 关键修复：合约张数必须为整数

## 📋 问题分析

### 错误信息
```
sCode: '51121'
sMsg: 'Order quantity must be a multiple of the lot size.'
sz: '0.3710053'  ← 问题：小数！
```

### 根本原因

**OKX USDT永续合约规则**：
- ✅ Lot Size = 1张
- ✅ 合约张数**必须是整数**（1, 2, 3, ...）
- ❌ **不能有小数**（0.37, 2.52都不行）

---

## 🎯 修复方案

### 计算逻辑优化

```typescript
// src/lib/margin-calculator.ts

// 计算原始张数
const rawContractSize = (sizeUSDT * leverage) / entryPrice;
// 例如：BTC价格$104000，投入$100，5x杠杆
// rawContractSize = (100 * 5) / 104000 = 0.0048张

// ⚠️ 问题：0.0048张 → 必须调整为整数

// 解决方案：
if (rawContractSize < 1) {
  // 小于1张，检查资金是否够1张
  const oneContractMargin = entryPrice / leverage;
  
  if (sizeUSDT >= oneContractMargin) {
    contractSize = 1;  // 至少下1张
  } else {
    contractSize = 0;  // 资金不足，后续报错
  }
} else {
  // >= 1张，向下取整
  contractSize = Math.floor(rawContractSize);
}
```

### 最小资金要求

不同币种下1张合约需要的保证金（5x杠杆）：

| 币种 | 当前价格 | 1张名义价值 | 5x保证金 | 最小投入 |
|------|---------|------------|---------|---------|
| **BTC** | $104,000 | $104,000 | **$20,800** | ~$21,000 |
| **ETH** | $3,500 | $3,500 | **$700** | ~$750 |
| **SOL** | $180 | $180 | **$36** | ~$40 |
| **BNB** | $620 | $620 | **$124** | ~$130 |
| **XRP** | $0.65 | $0.65 | **$0.13** | ~$1 |
| **DOGE** | $0.12 | $120 | **$24** | ~$30 |

**关键发现**：
- 🔴 **BTC需要~$21,000才能下1张！**
- 🟡 **ETH需要~$750**
- 🟢 **SOL只需~$40**

---

## ⚠️ 当前问题

### 场景：可用资金$100，AI建议用25%开BTC

```
计算流程：
1. 投入金额 = $100 × 25% = $25
2. 名义价值 = $25 × 5x = $125
3. 合约张数 = $125 / $104000 = 0.0012张
4. 调整为整数 = max(1, floor(0.0012)) = 1张
5. 实际名义价值 = 1张 × $104000 = $104,000
6. 实际所需保证金 = $104000 / 5 = $20,800

❌ 结果：需要$20,800，但只有$100！
```

---

## ✅ 正确的解决方案

### 方案A：智能调整仓位比例（推荐）

```typescript
// 在执行决策前，检查资金是否够1张合约
function adjustPositionSizeForMinContract(
  symbol: string,
  availableCash: number,
  requestedPercent: number,
  entryPrice: number,
  leverage: number
): { adjustedPercent: number; adjustedUSDT: number; reason: string } {
  
  // 计算1张合约需要的保证金
  const oneContractMargin = entryPrice / leverage;
  
  // 如果请求的金额不够1张
  const requestedUSDT = availableCash * (requestedPercent / 100);
  
  if (requestedUSDT < oneContractMargin) {
    // 资金不够，需要调整
    
    // 检查总资金是否够1张
    if (availableCash >= oneContractMargin) {
      // 够，调整百分比
      const minPercent = (oneContractMargin / availableCash) * 100;
      const adjustedPercent = Math.ceil(minPercent);
      
      return {
        adjustedPercent,
        adjustedUSDT: oneContractMargin,
        reason: `原${requestedPercent}%不足1张，调整为${adjustedPercent}%（最小1张）`
      };
    } else {
      // 总资金都不够1张
      return {
        adjustedPercent: 0,
        adjustedUSDT: 0,
        reason: `资金不足：需要$${oneContractMargin.toFixed(2)}才能开1张${symbol}，当前仅$${availableCash.toFixed(2)}`
      };
    }
  }
  
  // 资金充足，使用原计划
  return {
    adjustedPercent: requestedPercent,
    adjustedUSDT: requestedUSDT,
    reason: '资金充足'
  };
}
```

### 方案B：跳过资金不足的币种

```typescript
// 在AI决策后，验证每个币种
for (const decision of decisions) {
  const oneContractMargin = price / leverage;
  
  if (availableCash < oneContractMargin) {
    console.warn(`⚠️ ${decision.symbol} 跳过：资金不足1张（需要$${oneContractMargin}，可用$${availableCash}）`);
    continue; // 跳过这个币种
  }
  
  // 执行决策...
}
```

---

## 🔧 立即修复

我建议修改AI提示词，让AI知道每个币种的最小资金要求：

```typescript
// src/lib/ai-trading-prompt.ts

const MIN_FUNDS_PER_COIN = {
  'BTC': 21000,  // $21k
  'ETH': 750,    // $750
  'SOL': 40,     // $40
  'BNB': 130,    // $130
  'XRP': 1,      // $1
  'DOGE': 30,    // $30
};

// 在提示词中添加
const prompt = `
当前可用资金: $${availableCash}

⚠️ 最小开仓要求（5x杠杆）：
- BTC: 至少$21,000
- ETH: 至少$750
- SOL: 至少$40
- BNB: 至少$130
- XRP: 至少$1
- DOGE: 至少$30

如果可用资金不足以开某个币种，请选择HOLD或选择更便宜的币种。
`;
```

---

## 📊 测试数据

### 当前状态（假设可用资金$1000）

| 币种 | 1张保证金 | 可开? | AI建议25% | 实际情况 |
|------|----------|-------|-----------|---------|
| BTC | $20,800 | ❌ | $250 | 资金不足 |
| ETH | $700 | ✅ | $250 | 资金不足 |
| SOL | $36 | ✅ | $250 | ✅ 可开6张 |
| BNB | $124 | ✅ | $250 | ✅ 可开2张 |
| XRP | $0.13 | ✅ | $250 | ✅ 可开很多张 |
| DOGE | $24 | ✅ | $250 | ✅ 可开10张 |

**结论**：
- 小资金账户（<$1000）：建议只交易SOL/XRP/DOGE等低价币
- 中资金账户（$1000-$10000）：可以交易ETH/BNB/SOL等
- 大资金账户（>$21000）：才能交易BTC

---

## 💡 建议

### 立即实施：

1. **添加最小资金检查**
```typescript
// src/app/api/ai/execute-decision/route.ts

const MIN_MARGIN_FOR_ONE_CONTRACT = entryPrice / leverage;

if (availableCash < MIN_MARGIN_FOR_ONE_CONTRACT) {
  return NextResponse.json({
    success: false,
    error: `资金不足：开1张${decision.symbol}需要$${MIN_MARGIN_FOR_ONE_CONTRACT.toFixed(2)}保证金（${leverage}x杠杆），当前可用资金仅$${availableCash.toFixed(2)}。建议：\n1. 充值更多USDT\n2. 选择价格更低的币种（如SOL、XRP、DOGE）\n3. 等待现有仓位平仓释放资金`
  }, { status: 400 });
}
```

2. **调整默认仓位比例**
```typescript
// 根据可用资金智能调整
function getSmartPositionPercent(symbol: string, availableCash: number): number {
  const MIN_FUNDS = {
    'BTC': 21000,
    'ETH': 750,
    'SOL': 40,
    // ...
  };
  
  const minRequired = MIN_FUNDS[symbol] || 100;
  
  if (availableCash < minRequired) {
    return 0; // 资金不足，不开仓
  }
  
  // 确保至少能开1张，计算最小百分比
  const minPercent = (minRequired / availableCash) * 100;
  
  // 使用30%或最小百分比，取较大值
  return Math.max(30, Math.ceil(minPercent));
}
```

---

**状态**: 🔴 紧急  
**优先级**: 高  
**影响**: 小资金账户无法交易高价币

---

*创建时间：2025-11-04*

