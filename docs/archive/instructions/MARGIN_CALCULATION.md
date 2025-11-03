# 保证金计算系统

## 问题背景

之前的系统在下单时经常遇到 OKX 错误 `51008`（保证金不足），原因是：

1. 计算保证金时没有考虑手续费
2. 没有预留安全缓冲防止价格波动
3. 整数张数向下取整后可能导致资金不足

## 解决方案

新增了精确的保证金计算系统 (`src/lib/margin-calculator.ts`)，在下单前准确计算所需资金。

### 保证金计算公式

对于开仓订单，需要考虑以下几个因素：

1. **合约张数**（整数）
   ```
   合约张数 = floor((USDT金额 × 杠杆) / 价格)
   ```

2. **名义价值**（合约价值）
   ```
   名义价值 = 合约张数 × 价格
   ```

3. **所需保证金**
   ```
   保证金 = 名义价值 / 杠杆
   ```

4. **手续费**
   - 开仓手续费: 名义价值 × 0.05% (taker费率)
   - 平仓手续费预留: 名义价值 × 0.05%
   - 总手续费: 开仓 + 平仓

5. **总资金需求**
   ```
   总需求 = 保证金 + 开仓手续费 + 平仓手续费
   ```

6. **安全缓冲**（推荐）
   ```
   安全缓冲 = 总需求 × 5%
   最终建议 = 总需求 + 安全缓冲
   ```

### 实际案例计算

#### 案例1: XRP 5x杠杆（用户失败案例重现）

- **币种**: XRP
- **价格**: 2.5306 USDT
- **杠杆**: 5x
- **期望投入**: 500 USDT

计算过程：
```
1. 合约张数 = floor((500 × 5) / 2.5306) = floor(987.94) = 987 张

2. 名义价值 = 987 × 2.5306 = 2497.70 USDT

3. 保证金 = 2497.70 / 5 = 499.54 USDT

4. 手续费:
   - 开仓手续费 = 2497.70 × 0.0005 = 1.249 USDT
   - 平仓手续费 = 2497.70 × 0.0005 = 1.249 USDT
   - 总手续费 = 2.498 USDT

5. 总需求 = 499.54 + 2.498 = 502.04 USDT

6. 安全缓冲 = 502.04 × 0.05 = 25.10 USDT

7. 建议准备 = 502.04 + 25.10 = 527.14 USDT
```

**结论**: 
- 如果只有 500 USDT，实际不足以开这个订单（需要至少 502.04 USDT）
- 建议准备 527.14 USDT 以应对价格小幅波动

#### 案例2: BTC 10x杠杆

- **币种**: BTC
- **价格**: 109,000 USDT
- **杠杆**: 10x
- **期望投入**: 1000 USDT

计算过程：
```
1. 合约张数 = floor((1000 × 10) / 109000) = floor(0.0917) = 0 张

⚠️ 无法开仓：资金不足以购买1张合约

最小需求 = (1 × 109000) / 10 = 10,900 USDT（保证金）
           + 109000 × 0.001（手续费）= 109 USDT
           = 11,009 USDT + 5%安全缓冲 ≈ 11,559 USDT
```

**结论**: BTC价格高，即使10x杠杆也需要约11,500 USDT才能开仓

### 自动调整功能

当请求的USDT金额超过可用资金时，系统会自动调整订单大小：

```typescript
adjustOrderToAvailableFunds(symbol, price, requestedUSDT, leverage, availableUSDT)
```

使用二分查找算法，在1-20次迭代内找到最大可行的订单金额。

**调整策略**:
- 保证合约张数 ≥ 1
- 总资金需求 ≤ 可用资金
- 尽可能接近原始请求金额

### 代码集成

#### 1. 在 `execute-decision/route.ts` 中使用

```typescript
import { 
  calculateMarginRequirement, 
  validateSufficientMargin, 
  adjustOrderToAvailableFunds 
} from '@/lib/margin-calculator';

// 计算保证金
const marginCalc = calculateMarginRequirement(
  decision.symbol,    // 'XRP'
  entryPrice,         // 2.5306
  requestedUSDT,      // 500
  leverage            // 5
);

// 验证资金充足性
const validation = validateSufficientMargin(availableCash, marginCalc);

if (!validation.isValid) {
  // 尝试自动调整
  const adjusted = adjustOrderToAvailableFunds(
    decision.symbol,
    entryPrice,
    requestedUSDT,
    leverage,
    availableCash
  );
  
  if (adjusted) {
    marginCalc = adjusted; // 使用调整后的结果
  } else {
    return error('资金不足');
  }
}

// 使用计算出的合约张数下单
const quantity = marginCalc.contractSize;
await placeOrder(symbol, side, 'market', quantity, ...);
```

#### 2. 返回详细的保证金信息

```typescript
return {
  success: true,
  marginInfo: {
    contractSize: marginCalc.contractSize,           // 987 张
    notionalValue: marginCalc.notionalValue,         // 2497.70 USDT
    requiredMargin: marginCalc.requiredMargin,       // 499.54 USDT
    fees: marginCalc.totalFees,                      // 2.50 USDT
    totalUsed: marginCalc.recommendedAmount,         // 527.14 USDT
    leverage: 5
  }
};
```

## 关键改进

### ✅ 下单前验证
- 计算精确的保证金需求
- 包含手续费（开仓+平仓）
- 预留5%安全缓冲

### ✅ 自动调整
- 资金不足时自动缩小订单
- 确保至少满足1张合约
- 使用二分查找优化性能

### ✅ 详细日志
- 输出完整的计算过程
- 显示每一步的中间结果
- 方便调试和排查问题

### ✅ 友好的错误提示
- 明确说明资金缺口
- 提供解决建议
- 显示最小资金需求

## 测试验证

运行测试脚本：
```bash
npx tsx src/lib/test-margin-calculator.ts
```

测试覆盖：
- XRP低价币种
- BTC高价币种
- 不同杠杆倍数
- 资金不足自动调整
- 极小资金边界情况

## 预期效果

使用新系统后：
- ✅ **不会再出现51008错误**（保证金不足）
- ✅ **下单成功率接近100%**
- ✅ **资金利用更高效**（自动调整到最优大小）
- ✅ **交易更安全**（预留缓冲防止爆仓）

## 注意事项

1. **手续费率**: 目前按0.05% taker费率计算，如果是maker订单会稍低
2. **价格波动**: 5%安全缓冲可应对小幅波动，极端行情可能仍需更多资金
3. **最小合约**: 所有币种最小1张，部分币种可能有更高要求
4. **杠杆设置**: 需要在下单前正确设置杠杆（代码已处理）

## 相关文件

- `src/lib/margin-calculator.ts` - 保证金计算核心逻辑
- `src/app/api/ai/execute-decision/route.ts` - 集成到执行流程
- `src/lib/test-margin-calculator.ts` - 测试脚本
- `MARGIN_CALCULATION.md` - 本文档

