# ✅ OKX模拟盘配置修复

## 问题

50101错误：`APIKey does not match current environment`

## 根本原因

**OKX模拟盘（测试网）要求在所有请求的header中添加**：

```
x-simulated-trading: 1
```

这是OKX用来区分模拟盘和实盘的标识！

---

## 解决方案

### 修改okx-api客户端初始化

```typescript
// src/lib/okx.ts

const isSandbox = process.env.OKX_SANDBOX === 'true';

export const okxClient = new RestClient({
  apiKey: process.env.OKX_API_KEY || '',
  apiSecret: process.env.OKX_SECRET || '',
  apiPass: process.env.OKX_PASSWORD || '',
  // 🔧 模拟盘添加特殊header
  ...(isSandbox && {
    headers: {
      'x-simulated-trading': '1'
    }
  })
});
```

---

## 使用方法

### 模拟盘配置（.env.local）

```bash
# 模拟盘API Key（从OKX模拟盘后台获取）
OKX_API_KEY=模拟盘的Key
OKX_SECRET=模拟盘的Secret
OKX_PASSWORD=模拟盘的Password

# ⚠️ 重要：设置为true启用模拟盘
OKX_SANDBOX=true

# 其他配置
AI_AUTO_EXECUTE=false
```

**效果**：
- ✅ 所有请求自动添加`x-simulated-trading: 1` header
- ✅ 连接OKX模拟盘
- ✅ 使用虚拟资金

### 实盘配置（.env.local）

```bash
# 实盘API Key（从OKX生产环境后台获取）
OKX_API_KEY=实盘的Key
OKX_SECRET=实盘的Secret
OKX_PASSWORD=实盘的Password

# ⚠️ 重要：设置为false或删除
OKX_SANDBOX=false
# 或者直接删除这一行

# 其他配置
AI_AUTO_EXECUTE=false  # 谨慎使用自动执行
```

**效果**：
- ✅ 不添加模拟盘header
- ✅ 连接OKX生产环境
- ⚠️ 使用真实资金

---

## 验证方法

### 重启后查看日志

**模拟盘（OKX_SANDBOX=true）**：
```
[OKX-API] 初始化OKX API客户端：🧪 [模拟盘/测试网]
[OKX-API] API Key: xxxxxxxx...
[OKX-API] ⚠️ 模拟盘模式：header已添加 "x-simulated-trading: 1"
[OKX-API] 💡 请确保API Key是从OKX模拟盘后台获取的
```

**实盘（OKX_SANDBOX=false）**：
```
[OKX-API] 初始化OKX API客户端：💰 [实盘/生产环境]
[OKX-API] API Key: xxxxxxxx...
（无模拟盘header）
```

---

## OKX模拟盘 vs 实盘

| 特性 | 模拟盘 | 实盘 |
|------|--------|------|
| 资金 | 虚拟资金 | 真实资金 |
| API Key | 模拟盘后台获取 | 生产环境后台获取 |
| Header | x-simulated-trading: 1 | 无 |
| 环境变量 | OKX_SANDBOX=true | OKX_SANDBOX=false |
| 风险 | 无风险 | 真实风险 |
| 数据 | 真实市场数据 | 真实市场数据 |

---

## 快速切换环境

### 切换到模拟盘

```bash
# 1. 编辑.env.local
OKX_SANDBOX=true

# 2. 重启
Ctrl + C
npm run dev
```

### 切换到实盘

```bash
# 1. 编辑.env.local
OKX_SANDBOX=false

# 2. 确保使用实盘API Key
# 3. 重启
Ctrl + C
npm run dev
```

---

## 注意事项

### ⚠️ API Key必须匹配环境

```
模拟盘模式（OKX_SANDBOX=true）：
  ✅ 必须使用模拟盘API Key
  ❌ 不能使用实盘API Key
  
实盘模式（OKX_SANDBOX=false）：
  ✅ 必须使用实盘API Key
  ❌ 不能使用模拟盘API Key
```

### ⚠️ 自动执行设置

```bash
# 模拟盘可以开启自动执行（无风险）
OKX_SANDBOX=true
AI_AUTO_EXECUTE=true  # ✅ 安全

# 实盘谨慎使用自动执行
OKX_SANDBOX=false
AI_AUTO_EXECUTE=false  # ⚠️ 推荐手动审核
```

---

## 修复完成

- ✅ 已添加模拟盘header支持
- ✅ 自动根据OKX_SANDBOX添加header
- ✅ 日志清晰显示当前环境
- ✅ 无linter错误

现在请：
1. 确保.env.local中 OKX_SANDBOX=true
2. 确保API Key是从模拟盘后台获取的
3. 重启服务器
4. 50101错误应该消失！

---

日期：2025-11-03

