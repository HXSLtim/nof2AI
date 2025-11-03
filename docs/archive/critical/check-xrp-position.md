# 🔍 紧急检查XRP仓位

## 请立即查看

### 1. XRP持仓详情
在OKX APP查看：
- 合约张数：？
- 名义价值：？
- 保证金：？
- 杠杆：？
- 浮动盈亏：？

### 2. 执行日志
搜索终端日志：
```
[placeOrder] 开仓: XRP
```

应该显示：
```
[placeOrder] 开仓: XRP sell XXX张 (ccxt: XXX)
```

### 3. 快速查询持仓

在浏览器Console (F12)：
```javascript
fetch('/api/positions')
  .then(r => r.json())
  .then(data => {
    const xrp = data.data.find(p => p.coin === 'XRP');
    if (xrp) {
      console.log('XRP仓位:', {
        合约数: xrp.contracts,
        名义价值: xrp.notional.toFixed(2),
        保证金: (xrp.notional / xrp.leverage).toFixed(2),
        杠杆: xrp.leverage + 'x',
        盈亏: xrp.unrealizedPnl.toFixed(2)
      });
    }
  });
```

---

## 预期 vs 可能的异常

### 预期（正常）
```
AI请求: $300
杠杆: 5x
XRP价格: ~$2.48

合约张数: (300 × 5) / 2.48 = 604.8张
名义价值: 604.8 × 2.48 = $1,500
保证金: $300
```

### 可能的异常

如果XRP合约乘数设置错了：

#### 情况A: XRP乘数太大
```
设置的乘数: 10 (假设)
ccxt传递: 604.8 × 10 = 6048
实际开仓: 6048张
名义价值: 6048 × 2.48 = $15,000 ⚠️
保证金: $3,000 ⚠️
```

#### 情况B: 其他原因
需要看具体的日志和持仓数据。

---

请立即告诉我XRP的实际持仓数据！

