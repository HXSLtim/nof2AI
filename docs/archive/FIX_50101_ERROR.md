# 🔧 修复50101错误 - API Key环境不匹配

## 错误信息

```
Error: { msg: 'APIKey does not match current environment.', code: '50101' }
```

---

## 快速解决方案

### 步骤1：修改.env.local文件

打开`.env.local`文件，找到这一行：

```bash
OKX_SANDBOX=true
```

**改为**：

```bash
OKX_SANDBOX=false
```

**或者直接删除这一行**（推荐）

### 步骤2：重启服务器

```bash
Ctrl + C
npm run dev
```

### 步骤3：验证

重启后日志应该显示：
```
[OKX-API] 初始化OKX API客户端
[OKX-API] API Key: xxxxxxxx...
[OKX-API] ⚠️ 环境由API Key自动判断（测试网/生产环境）
[OKX-API] 💡 如果遇到50101错误，请确保.env.local中删除或设置 OKX_SANDBOX=false
```

然后访问仓位页面，应该不再出现50101错误。

---

## 原理说明

### okx-api的环境判断机制

**okx-api SDK通过API Key本身自动判断环境**：

1. **API Key从生产环境创建**
   - SDK自动连接：https://www.okx.com
   - 环境：生产

2. **API Key从测试网创建**
   - SDK自动连接：测试网端点
   - 环境：测试

**关键**：
- ✅ 不需要手动设置环境
- ✅ API Key决定一切
- ❌ 不要设置OKX_SANDBOX=true（会导致混乱）

---

## 为什么会出现50101错误？

### 场景1：生产Key + OKX_SANDBOX=true
```
API Key：从生产环境创建
环境变量：OKX_SANDBOX=true
→ SDK混乱，环境不匹配
→ 50101错误 ❌
```

**解决**：删除OKX_SANDBOX或设为false

### 场景2：测试Key + OKX_SANDBOX=false
```
API Key：从测试网创建
环境变量：OKX_SANDBOX=false
→ SDK连接生产环境，但Key是测试网的
→ 50101错误 ❌
```

**解决**：删除OKX_SANDBOX，让SDK自动判断

---

## 推荐配置

### 方案1：生产环境（推荐）

```bash
# .env.local
OKX_API_KEY=从OKX生产环境后台获取的Key
OKX_SECRET=从OKX生产环境后台获取的Secret
OKX_PASSWORD=从OKX生产环境后台获取的Password

# ⚠️ 删除或注释这一行
# OKX_SANDBOX=true

# 其他配置
AI_AUTO_EXECUTE=false
```

### 方案2：测试网

```bash
# .env.local
OKX_API_KEY=从OKX测试网后台获取的Key
OKX_SECRET=从OKX测试网后台获取的Secret
OKX_PASSWORD=从OKX测试网后台获取的Password

# ⚠️ 也删除或注释这一行
# OKX_SANDBOX=true

# SDK会通过API Key自动识别为测试网
```

---

## 验证API Key来源

### 如何确认API Key是从哪个环境创建的？

1. **生产环境API管理**
   - 网址：https://www.okx.com
   - 登录后：账户 → API管理
   - 如果能看到您的API Key → 这是生产环境Key

2. **测试网API管理**  
   - 网址：（如果OKX有独立测试网入口）
   - 登录测试网账户
   - 如果能看到您的API Key → 这是测试网Key

3. **查看API Key前缀**
   - 某些交易所的测试网Key有特殊前缀
   - 检查您的API Key是否有标识

---

## 最简单的方法

**只需一步**：

编辑`.env.local`，删除或注释掉OKX_SANDBOX这一行：

```bash
# OKX_SANDBOX=true  ← 加#注释掉或直接删除
```

然后重启：

```bash
Ctrl + C
npm run dev
```

---

## 仍然不行？

如果删除OKX_SANDBOX后仍然50101错误，说明：

### 可能原因1：API Key无效或过期
- 重新创建新的API Key
- 确保勾选"交易权限"和"读取权限"
- 设置IP白名单（或0.0.0.0/0）

### 可能原因2：权限不足
- API Key需要有以下权限：
  - ✅ 读取权限
  - ✅ 交易权限
  - 可选：提现权限

### 可能原因3：.env.local未生效
- 确保文件名正确：`.env.local`（不是`.env`）
- 重启服务器
- 检查环境变量：`console.log(process.env.OKX_API_KEY)`

---

## 状态

⚠️ 请先删除OKX_SANDBOX配置，重启服务器再试

---

## 日期

2025-11-03

