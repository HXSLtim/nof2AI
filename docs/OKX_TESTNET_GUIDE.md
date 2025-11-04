# 🔧 OKX测试网配置指南

## 问题：50101错误

```
Error: { msg: 'APIKey does not match current environment.', code: '50101' }
```

**含义**：API Key与当前环境不匹配

---

## 根本原因

### OKX的环境分离机制

OKX有两个完全独立的环境：

1. **生产环境**（实盘）
   - 网址：https://www.okx.com
   - API Key：从生产环境后台获取
   - 真实资金

2. **测试网**（模拟盘）
   - 网址：https://www.okx.com（**同一个域名！**）
   - API Key：从测试网后台获取（**不同的Key！**）
   - 虚拟资金

**关键**：测试网和生产环境使用相同的API域名，但是：
- API Key完全不同
- 通过API Key本身来区分环境，不是通过域名

---

## 解决方案

### 步骤1：确认当前环境

检查`.env.local`文件：

```bash
OKX_SANDBOX=true  # true=测试网, false或不设置=生产
```

### 步骤2：获取正确的API Key

#### 如果使用测试网（OKX_SANDBOX=true）

1. 访问OKX测试网：https://www.okx.com
2. 登录测试网账户
3. 进入 **账户设置** → **API管理**
4. 创建新的测试网API Key
5. 复制到`.env.local`

**重要**：
- ✅ 测试网API Key必须从测试网后台获取
- ❌ 生产环境的API Key不能在测试网使用
- ❌ 测试网的API Key不能在生产环境使用

#### 如果使用生产环境（OKX_SANDBOX=false）

1. 访问OKX生产环境：https://www.okx.com
2. 登录生产账户
3. 进入 **账户设置** → **API管理**
4. 创建新的生产API Key
5. 复制到`.env.local`

### 步骤3：更新.env.local

```bash
# 测试网配置示例
OKX_API_KEY=xxxx-xxxx-xxxx-测试网Key
OKX_SECRET=xxxx-xxxx-xxxx-测试网Secret
OKX_PASSWORD=xxxx-xxxx-xxxx-测试网Password
OKX_SANDBOX=true

# 或者生产环境配置
OKX_API_KEY=xxxx-xxxx-xxxx-生产Key
OKX_SECRET=xxxx-xxxx-xxxx-生产Secret
OKX_PASSWORD=xxxx-xxxx-xxxx-生产Password
OKX_SANDBOX=false  # 或者删除这行
```

### 步骤4：重启服务器

```bash
Ctrl + C
npm run dev
```

---

## 如何获取测试网API Key

### 方法1：OKX测试网后台

1. 访问：https://www.okx.com
2. 使用测试网账户登录
3. 导航到：账户 → API
4. 创建新API Key：
   - ✅ 勾选"交易权限"
   - ✅ 勾选"读取权限"
   - ✅ 设置IP白名单（或0.0.0.0/0允许所有）
5. 保存API Key、Secret、Password

### 方法2：确认当前使用的API Key来源

检查您的API Key是从哪个环境创建的：
- 测试网后台创建 → OKX_SANDBOX=true
- 生产环境后台创建 → OKX_SANDBOX=false

---

## 验证配置

重启后，日志应该显示：

**测试网（正确）**：
```
[OKX-API] 初始化OKX API客户端：[测试网]
[OKX-API] API Key: ✅ 已设置
[OKX-API] API Secret: ✅ 已设置
[OKX-API] API Password: ✅ 已设置
[OKX-API] ⚠️ 重要：当前使用测试网，请确保API Key是从测试网后台获取的！
```

**生产环境（正确）**：
```
[OKX-API] 初始化OKX API客户端：[生产环境]
[OKX-API] API Key: ✅ 已设置
[OKX-API] ⚠️ 重要：当前使用生产环境
```

如果仍然出现50101错误，说明：
- ❌ API Key与OKX_SANDBOX设置不匹配
- 需要重新获取正确环境的API Key

---

## 常见错误

### 错误1：测试网Key用在生产环境
```
OKX_SANDBOX=false  # 生产环境
OKX_API_KEY=test-xxx  # 测试网Key
→ 50101错误 ❌
```

**解决**：
- 要么改为 OKX_SANDBOX=true
- 要么换成生产环境的API Key

### 错误2：生产Key用在测试网
```
OKX_SANDBOX=true  # 测试网
OKX_API_KEY=prod-xxx  # 生产Key
→ 50101错误 ❌
```

**解决**：
- 要么改为 OKX_SANDBOX=false
- 要么换成测试网的API Key

### 错误3：API Key过期或无效
- 检查API Key是否仍然有效
- 重新创建新的API Key

---

## 推荐配置

### 开发阶段（推荐使用测试网）

```bash
# .env.local
OKX_SANDBOX=true
OKX_API_KEY=从测试网后台获取
OKX_SECRET=从测试网后台获取
OKX_PASSWORD=从测试网后台获取

AI_AUTO_EXECUTE=false  # 先不自动执行，手动审核
```

### 生产部署

```bash
# .env.local
# OKX_SANDBOX=false  # 或删除这行
OKX_API_KEY=从生产环境后台获取
OKX_SECRET=从生产环境后台获取
OKX_PASSWORD=从生产环境后台获取

AI_AUTO_EXECUTE=false  # 谨慎使用自动执行
```

---

## 快速检查清单

```
□ 确认OKX_SANDBOX设置（true/false）
□ 确认API Key来源（测试网/生产）
□ 两者必须匹配
□ 重启服务器
□ 查看启动日志确认环境
□ 测试获取仓位
```

---

## 联系支持

如果仍然无法解决：

1. 提供启动日志
2. 确认OKX_SANDBOX的值
3. 确认API Key的获取来源
4. 尝试重新创建API Key

---

## 状态

⚠️ 需要配置正确的测试网API Key

---

## 日期

2025-11-03

