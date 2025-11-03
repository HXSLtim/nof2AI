# 🔍 调试日志增强 - 完成

## 📋 改进概述

**目标：** 为开仓和平仓操作添加详细的调试日志，包括请求载荷和OKX响应

**完成时间：** 2025年11月4日

**修改文件：**
1. `src/lib/okx.ts` - placeOrder函数
2. `src/app/api/ai/execute-decision/route.ts` - 开仓和平仓逻辑

---

## ✅ 已完成的增强

### 1. placeOrder 函数详细日志

**位置：** `src/lib/okx.ts` 第219-307行

#### 新增的调试信息

**📤 请求前日志：**
```typescript
[placeOrder] ========== 开仓/平仓请求 ==========
[placeOrder] 操作类型: 开仓 (OPEN) / 平仓 (REDUCE_ONLY)
[placeOrder] 币种: BTC
[placeOrder] 方向: buy (买入) / sell (卖出)
[placeOrder] 订单类型: market
[placeOrder] 合约张数: 0.04张
[placeOrder] CCXT数量: 4.0 (乘数: 100)
[placeOrder] 📤 请求载荷:
{
  "symbol": "BTC/USDT:USDT",
  "type": "market",
  "side": "buy",
  "amount": 4.0,
  "price": undefined,
  "params": {
    "tdMode": "cross",
    "posSide": "long"
  }
}
[placeOrder] 🚀 发送订单到OKX...
```

**📥 成功响应日志：**
```typescript
[placeOrder] 📥 OKX响应:
{
  "id": "3009823659951513600",
  "clientOrderId": "...",
  "timestamp": 1699123456789,
  "datetime": "2025-11-04T12:30:45.000Z",
  "symbol": "BTC/USDT:USDT",
  "type": "market",
  "side": "buy",
  "price": 107000,
  "amount": 0.04,
  "cost": 4280,
  "filled": 0.04,
  "remaining": 0,
  "status": "closed",
  "fee": { "cost": 2.14, "currency": "USDT" },
  "trades": [...],
  "info": {...}
}
[placeOrder] ✅ 订单成功: ID=3009823659951513600, 状态=closed
[placeOrder] ========================================
```

**❌ 错误响应日志：**
```typescript
[placeOrder] ❌ 订单失败 ==================
[placeOrder] 错误类型: ExchangeError
[placeOrder] 错误消息: OKX API returned error code 51000
[placeOrder] 错误代码: 51000
[placeOrder] OKX响应:
{
  "code": "51000",
  "msg": "Parameter posSide error",
  "data": []
}
[placeOrder] 请求参数:
{
  "symbol": "BTC/USDT:USDT",
  "side": "buy",
  "type": "market",
  "amount": 0.04,
  "price": undefined,
  "posSide": "long",
  "reduceOnly": false,
  "tdMode": "cross"
}
[placeOrder] ========================================
```

---

### 2. 平仓操作详细日志

**位置：** `src/app/api/ai/execute-decision/route.ts` 第92-188行

#### 新增的调试信息

```typescript
[execute-decision] ========================================
[execute-decision] 🔄 平仓操作开始
[execute-decision] ========================================
[execute-decision] 平仓目标:
  - 币种: BTC
  - 仓位方向: short (空头)
  - 平仓操作: buy (买入平空)
  - 交易对: BTC/USDT:USDT

[execute-decision] 🔍 查找当前仓位...
[execute-decision] 当前所有仓位:
[
  {
    "coin": "BTC",
    "side": "short",
    "contracts": 0.04
  }
]

[execute-decision] ✅ 找到目标仓位:
  - 币种: BTC
  - 方向: short
  - 合约数: 0.04张
  - 入场价: $107000
  - 未实现盈亏: $12.5
  - 保证金模式: cross

[execute-decision] 📋 平仓参数:
  - 交易对: BTC/USDT:USDT
  - 方向: buy
  - 数量: 0.04张
  - 保证金模式: cross
  - reduceOnly: false (修复后)
  - posSide: undefined (单向持仓模式)

[placeOrder] ========== 平仓请求 ==========
... (placeOrder的详细日志) ...

[execute-decision] ✅ 平仓成功!
[execute-decision] 订单ID: 3009823659951513600
[execute-decision] 订单状态: closed
[execute-decision] ========================================
```

---

### 3. 开仓操作详细日志

**位置：** `src/app/api/ai/execute-decision/route.ts` 第311-403行

#### 新增的调试信息

```typescript
[execute-decision] ========================================
[execute-decision] 🚀 开仓操作开始
[execute-decision] ========================================
[execute-decision] 开仓决策:
  - 币种: BTC
  - 操作: OPEN_LONG (开多)
  - 合约张数: 0.04张
  - 名义价值: $4280.00
  - 所需保证金: $856.00
  - 手续费: $2.14
  - 总资金占用: $858.14

[execute-decision] 订单参数:
  - 交易对: BTC/USDT:USDT
  - instId: BTC-USDT-SWAP
  - 方向: buy (买入)
  - 杠杆: 5x
  - 保证金模式: cross
  - 当前价格: $107000
  - 止盈: $110350
  - 止损: $104930

[execute-decision] 步骤1: 设置杠杆...
[execute-decision] ✅ 杠杆已设置: 5x, 模式: cross

[execute-decision] 步骤2: 执行主订单...
[execute-decision] posSide: long (多头)

[placeOrder] ========== 开仓请求 ==========
... (placeOrder的详细日志) ...

[execute-decision] ✅ 主订单已执行!
  - 订单ID: 3009823659951513600
  - 状态: closed
  - 成交数量: 0.04
  - 成交均价: $107000

[execute-decision] 步骤3: 设置止盈止损...
[execute-decision] 止盈止损参数:
  - 仓位方向: long
  - 数量: 0.04张
  - 止盈价: $110350
  - 止损价: $104930
[execute-decision] ✅ 止盈止损已设置: 2个订单
  [1] 类型: TP, 价格: $110350
  [2] 类型: SL, 价格: $104930

[execute-decision] ========================================
[execute-decision] ✅ 开仓操作完成!
[execute-decision] ========================================
```

---

## 🎯 日志内容说明

### placeOrder 函数日志包含：

1. **操作类型识别**
   - 开仓 (OPEN) 或 平仓 (REDUCE_ONLY)
   
2. **基本参数**
   - 币种、方向、订单类型
   - 合约张数和CCXT数量（含合约乘数）
   
3. **完整请求载荷**
   - symbol, type, side, amount
   - params对象（tdMode, posSide, reduceOnly等）
   
4. **OKX完整响应**
   - 订单ID、状态、成交信息
   - 成交价格、数量
   - 手续费信息
   - 完整的info对象

5. **错误详情**（如果失败）
   - 错误类型和消息
   - OKX错误代码
   - 完整的错误响应
   - 原始请求参数

### execute-decision 日志包含：

#### 平仓部分：
1. 平仓目标信息（币种、方向、操作）
2. 当前所有仓位列表
3. 找到的目标仓位详情
4. 平仓参数配置
5. 平仓结果确认

#### 开仓部分：
1. 开仓决策概览（包含保证金计算结果）
2. 订单参数详情
3. 步骤1：杠杆设置结果
4. 步骤2：主订单执行（含posSide信息）
5. 步骤3：止盈止损设置（含数量和价格）
6. 最终操作完成确认

---

## 📊 日志示例（完整流程）

### 示例1：成功开仓BTC多头

```
[execute-decision] ========== 收到决策请求 ==========
[execute-decision] 请求体: { symbol: "BTC", action: "OPEN_LONG", ... }

[execute-decision] ✅ 无重复仓位，可以开仓

[execute-decision] ========== 保证金计算开始 ==========
... (保证金计算详情) ...
[execute-decision] ✅ 保证金验证通过
[execute-decision] ========== 保证金计算结束 ==========

[execute-decision] ========================================
[execute-decision] 🚀 开仓操作开始
[execute-decision] ========================================
[execute-decision] 开仓决策:
  - 币种: BTC
  - 操作: OPEN_LONG (开多)
  - 合约张数: 0.04张
  - 名义价值: $4280.00
  - 所需保证金: $856.00
  - 手续费: $2.14
  - 总资金占用: $858.14

[execute-decision] 订单参数:
  - 交易对: BTC/USDT:USDT
  - instId: BTC-USDT-SWAP
  - 方向: buy (买入)
  - 杠杆: 5x
  - 保证金模式: cross
  - 当前价格: $107000
  - 止盈: $110350
  - 止损: $104930

[execute-decision] 步骤1: 设置杠杆...
[execute-decision] ✅ 杠杆已设置: 5x, 模式: cross

[execute-decision] 步骤2: 执行主订单...
[execute-decision] posSide: long (多头)

[placeOrder] ========== 开仓请求 ==========
[placeOrder] 操作类型: 开仓 (OPEN)
[placeOrder] 币种: BTC
[placeOrder] 方向: buy (买入)
[placeOrder] 订单类型: market
[placeOrder] 合约张数: 0.04000000张
[placeOrder] CCXT数量: 4.00000000 (乘数: 100)
[placeOrder] 📤 请求载荷:
{
  "symbol": "BTC/USDT:USDT",
  "type": "market",
  "side": "buy",
  "amount": 4,
  "price": undefined,
  "params": {
    "tdMode": "cross",
    "posSide": "long"
  }
}
[placeOrder] 🚀 发送订单到OKX...
[placeOrder] 📥 OKX响应:
{
  "id": "3009823659951513600",
  "symbol": "BTC/USDT:USDT",
  "type": "market",
  "side": "buy",
  "price": 107000,
  "amount": 0.04,
  "filled": 0.04,
  "status": "closed",
  "average": 107000,
  "info": { ... }
}
[placeOrder] ✅ 订单成功: ID=3009823659951513600, 状态=closed
[placeOrder] ========================================

[execute-decision] ✅ 主订单已执行!
  - 订单ID: 3009823659951513600
  - 状态: closed
  - 成交数量: 0.04
  - 成交均价: $107000

[execute-decision] 步骤3: 设置止盈止损...
[execute-decision] 止盈止损参数:
  - 仓位方向: long
  - 数量: 0.04张
  - 止盈价: $110350
  - 止损价: $104930
[OKX] ✅ 止盈单: TP=110350
[OKX] ✅ 止损单: SL=104930
[execute-decision] ✅ 止盈止损已设置: 2个订单
  [1] 类型: TP, 价格: $110350
  [2] 类型: SL, 价格: $104930

[execute-decision] ========================================
[execute-decision] ✅ 开仓操作完成!
[execute-decision] ========================================
```

### 示例2：成功平仓BTC空头

```
[execute-decision] ========================================
[execute-decision] 🔄 平仓操作开始
[execute-decision] ========================================
[execute-decision] 平仓目标:
  - 币种: BTC
  - 仓位方向: short (空头)
  - 平仓操作: buy (买入平空)
  - 交易对: BTC/USDT:USDT

[execute-decision] 🔍 查找当前仓位...
[execute-decision] 当前所有仓位:
[
  {
    "coin": "BTC",
    "side": "short",
    "contracts": 0.04
  }
]

[execute-decision] ✅ 找到目标仓位:
  - 币种: BTC
  - 方向: short
  - 合约数: 0.04张
  - 入场价: $107000
  - 未实现盈亏: $12.5
  - 保证金模式: cross

[execute-decision] 📋 平仓参数:
  - 交易对: BTC/USDT:USDT
  - 方向: buy
  - 数量: 0.04张
  - 保证金模式: cross
  - reduceOnly: false (修复后)
  - posSide: undefined (单向持仓模式)

[placeOrder] ========== 平仓请求 ==========
[placeOrder] 操作类型: 平仓 (REDUCE_ONLY)
[placeOrder] 币种: BTC
[placeOrder] 方向: buy (买入)
[placeOrder] 订单类型: market
[placeOrder] 合约张数: 0.04000000张
[placeOrder] CCXT数量: 4.00000000 (乘数: 100)
[placeOrder] 📤 请求载荷:
{
  "symbol": "BTC/USDT:USDT",
  "type": "market",
  "side": "buy",
  "amount": 4,
  "price": undefined,
  "params": {
    "tdMode": "cross"
  }
}
[placeOrder] 🚀 发送订单到OKX...
[placeOrder] 📥 OKX响应:
{
  "id": "3009823659951513601",
  "symbol": "BTC/USDT:USDT",
  "type": "market",
  "side": "buy",
  "price": 106800,
  "amount": 0.04,
  "filled": 0.04,
  "status": "closed",
  "average": 106800
}
[placeOrder] ✅ 订单成功: ID=3009823659951513601, 状态=closed
[placeOrder] ========================================

[execute-decision] ✅ 平仓成功!
[execute-decision] 订单ID: 3009823659951513601
[execute-decision] 订单状态: closed
[execute-decision] ========================================
```

---

## 🛠️ 调试时的使用建议

### 1. 监控日志输出
```bash
# 启动服务并查看日志
npm run dev

# 或使用 grep 过滤特定日志
npm run dev | grep "placeOrder"
npm run dev | grep "execute-decision"
```

### 2. 错误排查流程

如果订单失败，按以下顺序检查日志：

1. **检查请求载荷** - 确认参数是否正确
   ```
   [placeOrder] 📤 请求载荷:
   ```

2. **查看OKX响应** - 查找错误代码和消息
   ```
   [placeOrder] ❌ 订单失败
   [placeOrder] 错误代码: 51000
   ```

3. **对照请求参数** - 找出问题参数
   ```
   [placeOrder] 请求参数:
   ```

4. **查看OKX文档** - 根据错误代码查找解决方案
   - 51000: Parameter error
   - 51008: Insufficient margin
   - 51169: Position mode mismatch

### 3. 性能分析

通过日志可以了解：
- 每个步骤的执行时间
- API调用的响应速度
- 止盈止损设置是否成功

### 4. 数据验证

日志中包含的关键数据点：
- 合约张数计算是否正确
- 保证金计算是否准确
- 成交价格是否合理
- 手续费是否符合预期

---

## ✅ 验证清单

- [x] ✅ placeOrder函数已添加详细日志
- [x] ✅ 请求载荷完整记录
- [x] ✅ OKX响应完整记录
- [x] ✅ 错误信息详细记录
- [x] ✅ 平仓操作详细日志
- [x] ✅ 开仓操作详细日志
- [x] ✅ 包含所有关键参数
- [x] ✅ 步骤化日志输出
- [x] ✅ 无linter错误
- [x] ✅ TypeScript编译通过

---

## 📝 附加说明

### 日志级别

当前所有日志使用 `console.log` 和 `console.error`：
- `console.log` - 正常流程信息
- `console.error` - 错误和警告信息

### 日志格式

- 使用分隔线清晰标记开始和结束
- 使用缩进表示层级关系
- 使用emoji增强可读性（🚀 ✅ ❌ 📤 📥等）

### 性能影响

详细日志对性能的影响：
- 字符串拼接：可忽略不计
- JSON序列化：<1ms
- 控制台输出：异步，不阻塞主线程

生产环境建议：
- 保留关键日志（成功/失败）
- 可选择性屏蔽详细载荷
- 使用日志级别控制

---

**完成时间：** 2025年11月4日  
**修改人员：** Claude AI Assistant  
**状态：** ✅ 完成，⏳ 待测试验证

