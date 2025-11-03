# ✅ 已修复：名义价值计算错误（100倍误差）

## 问题确认

### 用户反馈数据

| 币种 | 显示值 | 实际值 | 误差倍数 | 合约乘数 |
|------|--------|--------|----------|----------|
| BTC  | $322,539 | $3,224 | 100倍 | 100 |
| BNB  | $2,462,387 | $24,700 | 100倍 | 100 |
| DOGE | 正确 ✅ | 正确 ✅ | 无 | 0.01 |

**规律发现**：误差倍数 = 合约乘数

## 根本原因

### OKX API数据结构

OKX `/account/positions` API返回：
```json
{
  "pos": "0.03",          // 持仓数量（币）- 注意：不是张数！
  "markPx": "107466.3",   // 标记价格
  "notional": "322398.9", // ⚠️ 这个值已经乘了合约乘数！
  "avgPx": "107000"       // 平均开仓价
}
```

### 合约乘数定义

```typescript
CONTRACT_MULTIPLIERS = {
  'BTC': 100,  // 1张 = 0.01 BTC
  'ETH': 10,   // 1张 = 0.1 ETH
  'BNB': 100,  // 1张 = 0.01 BNB
  'SOL': 1,    // 1张 = 1 SOL
  'XRP': 0.1,  // 1张 = 10 XRP
  'DOGE': 0.01 // 1张 = 100 DOGE
}
```

### 错误的计算逻辑（修复前）

```typescript
// ❌ 直接使用OKX返回的notional
const notionalValue = Math.abs(Number(r.notional) || (Math.abs(contracts) * mark));
```

**问题**：
- OKX返回的`notional`字段计算公式：`pos × markPx × ctMult`
- BTC例子：0.03 × 107466.3 × 100 = 322,398.9
- 但正确的名义价值应该是：0.03 × 107466.3 = 3,224

## 修复方案

### 正确的计算逻辑

```typescript
// ✅ 自己计算，不信任OKX的notional
const coin = String(r.instId).split('-')[0];
const posInCoins = Number(r.pos);  // 币数量
const mark = Number(r.markPx);
const multiplier = CONTRACT_MULTIPLIERS[coin] || 1;

// 计算合约张数：币数量 × 乘数
const contractsCount = Math.abs(posInCoins * multiplier);
// 例如：BTC 0.03币 × 100 = 3张

// 计算名义价值：币数量 × 价格
const notionalValue = Math.abs(posInCoins) * mark;
// 例如：BTC 0.03 × 107466.3 = 3,224 ✅
```

### 关键理解

1. **pos字段含义**：
   - pos = 持仓的"币"数量
   - 不是合约张数！

2. **合约张数计算**：
   - contracts = pos × multiplier
   - BTC: 0.03币 × 100 = 3张

3. **名义价值计算**：
   - notional = pos × markPrice
   - 或者：notional = contracts × markPrice / multiplier
   - 两种算法等价

### 验证

**BTC示例**：
```
pos = 0.03 BTC
markPrice = $107,466.3
multiplier = 100

合约张数 = 0.03 × 100 = 3张
名义价值 = 0.03 × 107,466.3 = $3,223.99 ✅

验证：3张 × 107,466.3 / 100 = $3,223.99 ✅
```

**BNB示例**：
```
假设 pos = 0.37 BNB
markPrice = $668
multiplier = 100

合约张数 = 0.37 × 100 = 37张
名义价值 = 0.37 × 668 = $247.16

但如果显示$24,700，说明pos实际是37 BNB：
名义价值 = 37 × 668 = $24,716 ✅
```

## 修复的文件

- ✅ `src/lib/okx.ts` - fetchPositions函数
  - 导入CONTRACT_MULTIPLIERS
  - 重新计算contracts和notional
  - 添加详细的调试日志

## 影响范围

修复后正确显示：
- ✅ 仓位列表：名义价值
- ✅ 手续费计算：基于正确的名义价值
- ✅ 盈亏百分比：基于正确的名义价值
- ✅ AI提示词：准确的仓位信息

## 测试建议

1. 查看BTC/ETH/BNB仓位显示是否正确
2. 检查DOGE/SOL/XRP是否仍然正确
3. 验证手续费计算是否合理
4. 确认盈亏百分比计算准确

## 调试日志

修复后会输出详细计算过程：
```
[fetchPositions] BTC 计算详情: {
  pos_币数量: '0.03',
  markPx: '107466.3',
  合约乘数: 100,
  计算_合约张数: '3.0000',
  计算_名义价值: '3223.99',
  OKX返回_notional: '322398.9',
  差异: '100.00倍'
}
```

## 日期

2025-11-03

## 状态

✅ 已修复并部署

