# ⚡ 平仓修复 V3 - 快速参考

## 🔴 核心发现

**问题根源：** OKX有两种持仓模式，对posSide要求不同！

| 模式 | posSide（平仓） | 之前的错误 |
|------|----------------|-----------|
| 单向持仓 | ❌ 不能传 | ✅ 已正确 |
| **双向持仓** | ✅ **必须传** | ❌ **之前没传**导致51000 |

---

## ✅ 解决方案

### 1. 新增功能
```typescript
// 查询账户持仓模式
fetchAccountConfig() → { posMode: 'net_mode' | 'long_short_mode' }
```

### 2. 动态适配
```typescript
// 根据模式决定
const isLongShortMode = accountConfig.posMode === 'long_short_mode';
const closingPosSide = isLongShortMode ? posSide : undefined;
```

---

## 🎯 关键修改

**文件：** `src/app/api/ai/execute-decision/route.ts`

```typescript
// 平仓前检查账户模式
const accountConfig = await fetchAccountConfig();

// 根据模式决定参数
const closingPosSide = accountConfig.posMode === 'long_short_mode' 
  ? posSide      // 双向持仓：传递
  : undefined;   // 单向持仓：不传
```

---

## 📊 预期日志

### 单向持仓
```
🔍 账户持仓模式: net_mode
posSide: undefined (单向持仓不传)
🔍 params中是否有posSide: NO ✅
```

### 双向持仓
```
🔍 账户持仓模式: long_short_mode
posSide: long (双向持仓需要)
🔍 params中是否有posSide: YES ✅
```

---

## 🚀 测试步骤

```bash
# 1. 重启
Ctrl+C
npm run dev

# 2. 查看日志
# 观察：账户持仓模式 = ???

# 3. 测试平仓
# 检查：posSide参数是否符合模式

# 4. 验证成功
✅ 订单成功: ID=xxx
```

---

## 📋 检查清单

- [ ] 重启服务
- [ ] 查看账户模式（net_mode / long_short_mode）
- [ ] 验证posSide参数正确（根据模式）
- [ ] 测试平仓成功
- [ ] 验证多个币种

---

**状态：** ✅ 代码完成  
**版本：** V3 - 终极修复  
**预期：** 100%成功率

