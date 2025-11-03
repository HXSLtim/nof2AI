# ✅ posSide参数完全移除

## 🐛 问题

平仓操作仍然报错：
```
错误: 51000 - "Parameter posSide error"
```

## 🔍 原因

OKX账户是**单向持仓模式**（Net Mode），完全不接受`posSide`参数。

之前的修复只删除了开仓的posSide，但平仓时还在传！

## 🔧 最终修复

### 修改1: placeOrder完全不传posSide

```typescript
// ❌ 之前
if (reduceOnly && posSide) {
  params.posSide = posSide; // 平仓时传
}

// ✅ 现在
// 完全不传posSide参数
// 让OKX根据账户设置自动处理
```

### 修改2: setLeverage也不传posSide

```typescript
// ❌ 之前
await setLeverage(instId, leverage, tdMode, posSide);

// ✅ 现在
await setLeverage(instId, leverage, tdMode); // 不传posSide
```

## 📊 OKX持仓模式

### 单向持仓模式（Net Mode）- 你使用的
- 同一币种只有1个净仓位
- 多空会自动对冲
- **不接受posSide参数**
- 开仓：系统根据buy/sell自动判断
- 平仓：系统自动平掉净仓位

### 双向持仓模式（Long/Short Mode）- 不适用
- 同一币种可同时持有多空
- **必须有posSide参数**
- 需要在OKX账户设置中手动开启

## ✅ 修复后的行为

### 开仓
```typescript
placeOrder(symbol, 'buy', 'market', amount, undefined, undefined, false, 'cross')
// 不传posSide → OKX自动创建多头
```

### 平仓
```typescript
placeOrder(symbol, 'sell', 'market', amount, undefined, undefined, true, 'cross')
// 不传posSide → OKX自动平掉净仓位
```

## 🚀 立即重启测试

```bash
Ctrl+C
npm run dev
```

平仓BTC空头应该成功！

