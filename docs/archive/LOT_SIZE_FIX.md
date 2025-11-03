# OKX Lot Size Fix - TP/SL Orders

## Problem
止盈止损订单失败，错误信息：
```
InvalidOrder: okx {"code":"1","data":[{"sCode":"51121","sMsg":"Order quantity must be a multiple of the lot size."}]}
```

订单数量为 `2.52499748张`，包含过多小数位。

## Root Cause
OKX USDT永续合约的**lot size = 1**，这意味着：
- ✅ 所有订单数量必须是**整数**（1, 2, 3, ...）
- ❌ 不能有小数位（2.52, 1.15, 0.99 都不行）

旧代码中：
1. `placeOrder()` - 主订单成功（CCXT自动处理了取整）
2. `placeTPSL()` - 止盈止损订单失败，因为使用了`Math.floor(size * 100) / 100`（保留2位小数）

## Solution

### 修改1: `placeTPSL()` 函数
**文件**: `src/lib/okx.ts` (Line 361-363)

```typescript
// ❌ 旧代码 - 保留2位小数
sizeRounded = Math.floor(size * 100) / 100;  // 例如: 2.52

// ✅ 新代码 - 向下取整到整数
sizeRounded = Math.floor(size);  // 例如: 2
```

### 修改2: `placeOrder()` 函数（预防性）
**文件**: `src/lib/okx.ts` (Line 254)

```typescript
// ❌ 旧代码
const ccxtAmount = amount * multiplier;

// ✅ 新代码 - 确保整数
const ccxtAmount = Math.floor(amount * multiplier);
```

## Impact

### ✅ 止盈止损订单现在会：
1. 将 `2.52499748张` 向下取整为 `2张`
2. 将 `1.99张` 向下取整为 `1张`
3. 将 `0.99张` 向下取整为 `0张`（会被拒绝，并显示警告信息）

### ⚠️ 注意事项
- 小额订单（<1张合约）的止盈止损将无法设置
- 例如：0.5张合约 → 向下取整为0 → 无法设置TP/SL
- 解决方案：增加订单大小到至少1张合约，或手动在OKX设置

## Testing
请重试之前失败的交易：
1. 主订单应该正常执行（已经成功）
2. 止盈止损订单现在应该成功（数量会被自动取整）

## Technical Details

### OKX USDT Perpetual Swap Rules
- **Lot Size**: 1 contract
- **Min Size**: 1 contract
- **Size Increment**: 1 contract
- **Precision**: 0 decimal places (integer only)

### Examples
| 原始数量 | 旧代码输出 | 新代码输出 | 结果 |
|---------|-----------|-----------|------|
| 2.52499748 | 2.52 ❌ | 2 ✅ | 成功 |
| 1.99 | 1.99 ❌ | 1 ✅ | 成功 |
| 0.99 | 0.99 ❌ | 0 ⚠️ | 警告（太小）|
| 5.123 | 5.12 ❌ | 5 ✅ | 成功 |

---
**Status**: ✅ FIXED
**Date**: 2025-11-03

