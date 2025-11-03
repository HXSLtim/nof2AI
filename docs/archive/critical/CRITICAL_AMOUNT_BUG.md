# 🚨 严重BUG：下单数量异常（99%偏差）

## 📋 问题

**日志显示**：
- BTC: 0.0931张，$10,000名义价值
- BNB: 2.96张，$3,000名义价值

**实际仓位**：
- BTC: ~0.0009张，$96名义价值 ❌ 少了99%
- BNB: ~0.02张，$20名义价值 ❌ 少了99%

---

## 🔍 可能的原因

### ccxt的amount参数单位错误

**猜测**: ccxt.createOrder的`amount`参数可能不是"合约张数"

可能的单位：
1. **基础货币数量**（如0.0931 BTC，而不是0.0931张）
2. **Quote货币金额**（如$96.7 USDT）
3. **其他合约规格单位**

### 证据

```
差距倍数:
- BTC: 0.0931 / 0.0009 ≈ 103倍
- BNB: 2.96 / 0.02 ≈ 148倍

比例不一致，说明可能与价格有关
```

---

## 🔧 已添加的调试日志

### src/lib/okx.ts 第206-231行

```typescript
console.log('[placeOrder] ccxt参数:', {
  symbol,
  type,
  side,
  amount,      // 🔍 记录我们传递的amount
  price,
  params
});

const order = await okx.createOrder(...);

console.log('[placeOrder] ccxt返回:', {
  id: order.id,
  amount: order.amount,      // 🔍 ccxt认为的amount
  filled: order.filled,       // 🔍 实际成交
  cost: order.cost,          // 🔍 成交金额
  average: order.average,     // 🔍 成交均价
  info: order.info           // 🔍 OKX原始返回
});
```

### 启用verbose模式

```typescript
export const okx = new ccxt.okx({
  ...
  verbose: true  // 🔍 ccxt会输出详细的HTTP请求
});
```

---

## 🚀 立即行动

### 1. 重启服务（查看新日志）

```bash
Ctrl+C
npm run dev
```

### 2. 下一个测试订单

选择一个小币种测试（如DOGE $100）：
- 风险小
- 能看到完整的ccxt日志
- 包括HTTP请求体

### 3. 查看新的日志输出

应该包含：

```bash
[placeOrder] ccxt参数: {
  symbol: 'DOGE/USDT:USDT',
  amount: XXX,        # 我们传递的
  ...
}

# ccxt的verbose日志（HTTP请求）
[ccxt] POST https://www.okx.com/api/v5/trade/order
Body: {
  "instId": "DOGE-USDT-SWAP",
  "tdMode": "cross",
  "side": "buy",
  "ordType": "market",
  "sz": "XXX"      # 🔍 关键：实际传给OKX的sz
}

[placeOrder] ccxt返回: {
  amount: XXX,        # ccxt解析的amount
  filled: XXX,        # 实际成交
  cost: XXX,          # 成交金额
  info: { ... }       # OKX原始返回
}
```

---

## 🎯 可能的修复方向

### 如果ccxt需要base currency

```typescript
// ❌ 当前
const contracts = 2.96;
await okx.createOrder(symbol, 'market', 'buy', contracts, ...);

// ✅ 修复
const baseCurrency = contracts; // 对于BNB，1张=1BNB，所以相同
await okx.createOrder(symbol, 'market', 'buy', baseCurrency, ...);
```

### 如果ccxt需要cost（USDT金额）

```typescript
// ❌ 当前
const contracts = 2.96;
await okx.createOrder(symbol, 'market', 'buy', contracts, ...);

// ✅ 修复  
const costInUSDT = contracts * price; // 2.96 × $1011 = $2993
await okx.createOrder(symbol, 'market', 'buy', costInUSDT, ...);
```

### 如果需要直接调用OKX API（绕过ccxt）

```typescript
// 直接调用OKX v5 API
const resp = await okx.privatePostTradeOrder({
  instId: 'BNB-USDT-SWAP',
  tdMode: 'cross',
  side: 'buy',
  ordType: 'market',
  sz: '2.96',      // 明确是张数
  posSide: 'long'
});
```

---

## ⏳ 下一步

1. **立即重启服务**
2. 触发一个小额测试订单
3. 查看完整的ccxt日志
4. 确定ccxt到底传递了什么给OKX
5. 根据日志修复

**请重启服务并尝试下一个订单，我们会看到ccxt的完整请求！** 🔍

