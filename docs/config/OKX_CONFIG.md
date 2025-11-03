# OKX API 配置指南

## 环境说明

OKX 提供两种环境：

1. **生产环境（Production）**：真实交易，使用真实资金
2. **沙盒环境（Sandbox/Demo）**：模拟交易，用于测试，使用虚拟资金

## 获取 API Key

### 生产环境 API Key
1. 登录 [OKX官网](https://www.okx.com)
2. 进入 **个人中心** → **API**
3. 创建 API Key（需要设置 API 密码短语）
4. 记录三个信息：
   - API Key
   - Secret Key
   - Passphrase（密码短语）

### 沙盒环境 API Key
1. 登录 [OKX Demo Trading](https://www.okx.com/demo-trading)
2. 点击右上角账户图标 → **Demo API Keys**
3. 创建 Demo API Key
4. 同样记录三个信息

> ⚠️ **重要**：生产环境的 API Key 和沙盒环境的 API Key **不能混用**！

## 配置环境变量

在项目根目录创建 `.env.local` 文件：

### 使用生产环境（真实交易）

```bash
# OKX 生产环境配置
OKX_API_KEY=your_production_api_key
OKX_SECRET=your_production_secret
OKX_PASSWORD=your_production_passphrase
# 不设置 OKX_SANDBOX 或设置为 false
# OKX_SANDBOX=false
```

### 使用沙盒环境（模拟交易，推荐用于测试）

```bash
# OKX 沙盒环境配置
OKX_API_KEY=your_demo_api_key
OKX_SECRET=your_demo_secret
OKX_PASSWORD=your_demo_passphrase
# 必须设置为 true
OKX_SANDBOX=true
```

## 常见错误

### 错误代码 50101：APIKey does not match current environment

**原因**：API Key 与环境不匹配

**解决方案**：

1. **如果使用生产环境 API Key**：
   - 确保 `OKX_SANDBOX` 未设置或设置为 `false`
   - 检查 API Key 是否来自 OKX 生产环境

2. **如果使用沙盒环境 API Key**：
   - 确保 `OKX_SANDBOX=true`
   - 检查 API Key 是否来自 OKX Demo Trading

### 其他常见错误

- **50100**: API Key 不存在或已被删除
- **50102**: API Key 已过期
- **50103**: API Key 权限不足（需要在 OKX 后台为 API Key 分配交易权限）
- **50111**: API Key IP 白名单限制（如果设置了 IP 白名单，需要添加服务器 IP）

## 权限设置

创建 API Key 时，确保启用以下权限：

- ✅ **交易权限**（Trade）
- ✅ **读取权限**（Read）
- ❌ 提现权限（Withdraw）- 不建议启用

## 安全建议

1. **永远不要**将 `.env.local` 文件提交到 Git 仓库
2. 生产环境 API Key 建议设置 IP 白名单
3. 定期轮换 API Key
4. 首次使用建议先在沙盒环境测试
5. API 密码短语要使用强密码，并妥善保管

## 验证配置

启动项目后，查看控制台输出：

```
[OKX] 初始化交易所客户端：🧪 沙盒环境
```
或
```
[OKX] 初始化交易所客户端：🏭 生产环境
```

如果看到警告：
```
[OKX] ⚠️ 缺少 API 凭证，请在 .env.local 中配置：OKX_API_KEY, OKX_SECRET, OKX_PASSWORD
```

说明环境变量未正确配置。

## CCXT 环境切换原理

本项目使用 CCXT 库连接 OKX，环境切换通过 `sandbox` 参数实现：

```javascript
const okx = new ccxt.okx({
  apiKey: 'your_key',
  secret: 'your_secret',
  password: 'your_passphrase',
  sandbox: true,  // true = 沙盒环境, false = 生产环境
  options: {
    defaultType: 'swap',  // 永续合约
  }
});
```

CCXT 会自动处理：
- API 请求 URL
- 请求头标识
- 环境隔离

**无需手动设置 API URL**，CCXT 已经内置了 OKX 的环境配置。

## 参考链接

- [OKX API 文档](https://www.okx.com/docs-v5/zh/)
- [CCXT 文档](https://docs.ccxt.com/)
- [OKX Demo Trading](https://www.okx.com/demo-trading)

