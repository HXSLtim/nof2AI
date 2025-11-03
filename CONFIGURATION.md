# AI量化交易系统配置指南

## 🚀 服务端后台运行（无需打开浏览器）

系统已升级为**完全服务端运行**，所有调度器在后台自动执行，**不依赖前端页面**。

### 后台任务列表

| 任务 | 默认间隔 | 环境变量 | 说明 |
|------|---------|----------|------|
| 账户总金额采集 | 1分钟 | `EQUITY_SCHEDULER_MS` | 采集账户余额 |
| 市场数据采集 | 3分钟 | `DATA_COLLECTOR_MS` | 采集价格、K线、指标 |
| **AI决策生成** ⭐ | 5分钟 | `AI_DECISION_INTERVAL_MS` | **后台自动生成决策** |
| 数据清理 | 1天 | `DATA_CLEANUP_DAYS` | 清理旧数据 |

### 关键配置：AI决策自动调度器

创建 `.env.local` 文件：

```bash
# ======== AI决策后台调度器配置 ========

# 是否启用AI决策调度器
AI_DECISION_ENABLED=true

# 调度间隔（毫秒）
# 60000 = 1分钟（高频）
# 300000 = 5分钟（推荐）
# 900000 = 15分钟（稳健）
AI_DECISION_INTERVAL_MS=300000

# 是否自动执行交易
# false = 生成决策待人工审核（推荐）
# true = 自动执行交易（谨慎！）
AI_AUTO_EXECUTE=false
```

## 📋 完整的 .env.local 配置示例

```bash
# ========== OKX 交易所配置 ==========
# 沙盒环境（推荐先测试）
OKX_SANDBOX=true
OKX_API_KEY=your_demo_api_key
OKX_SECRET=your_demo_secret
OKX_PASSWORD=your_demo_passphrase

# 生产环境配置（注释掉，真实交易时再启用）
# OKX_SANDBOX=false
# OKX_API_KEY=your_production_api_key
# OKX_SECRET=your_production_secret
# OKX_PASSWORD=your_production_passphrase

# ========== AI 服务配置 ==========
AI_SERVICE_URL=http://localhost:8000
AI_API_KEY=your_ai_api_key
AI_MODEL_ID=gpt-5-high

# ========== 后台调度器配置 ==========

# 账户总金额采集（默认1分钟）
EQUITY_SCHEDULER_MS=60000

# 市场数据采集（默认3分钟）
DATA_COLLECTOR_MS=180000

# AI决策调度器（默认5分钟）
AI_DECISION_ENABLED=true
AI_DECISION_INTERVAL_MS=300000
AI_AUTO_EXECUTE=false

# 数据保留天数（默认7天）
DATA_CLEANUP_DAYS=7

# ========== 前端配置 ==========
NEXT_PUBLIC_EQUITY_POLL_MS=3000
NEXT_PUBLIC_AI_CHAT_INTERVAL_MS=180000

# ========== 开发环境配置 ==========
NODE_TLS_REJECT_UNAUTHORIZED=0
PORT=3000
```

## 🎯 使用场景

### 场景1：完全自动化（无人值守）

```bash
AI_DECISION_ENABLED=true
AI_DECISION_INTERVAL_MS=300000  # 5分钟
AI_AUTO_EXECUTE=true            # ⚠️ 自动执行
```

**运行：**
```bash
npm run dev
# 或
npm run build && npm start
```

**效果：**
- 服务启动后30秒开始AI决策
- 每5分钟自动分析市场
- 发现机会自动下单
- 设置止盈止损
- 关闭浏览器也继续运行 ✅

### 场景2：半自动（人工审核）

```bash
AI_DECISION_ENABLED=true
AI_DECISION_INTERVAL_MS=300000  # 5分钟
AI_AUTO_EXECUTE=false           # 需要人工审核
```

**效果：**
- 每5分钟生成决策
- 保存为"待处理"状态
- 用户打开网页查看和审核
- 点击"通过并执行"才下单

### 场景3：仅数据采集

```bash
AI_DECISION_ENABLED=false       # 关闭AI决策
```

**效果：**
- 只采集数据，不生成决策
- 用户手动点击"立即生成"
- 完全人工控制

## 🔍 查看后台运行状态

**服务器日志：**
```bash
npm run dev

# 输出示例：
[OKX] 初始化交易所客户端：🧪 沙盒环境
[data-collector] 已启动，间隔: 180000 ms
[cleanup-scheduler] 已启动，保留天数: 7
[ai-decision-scheduler] 已启动
[ai-decision-scheduler] 间隔: 300 秒
[ai-decision-scheduler] 自动执行: 关闭
...（30秒后）
[ai-decision-scheduler] 第 1 次调用，交易时长: 0 分钟
[ai-decision-scheduler] 解析到 6 个决策
✅ [ai-decision-scheduler] 已执行: 🤖 自动 - OPEN_SHORT BTC
```

## ⚙️ 前端UI控制 vs 服务端调度器

### 前端控制面板（DecisionHistory组件）

- 仍然可用，用于**手动触发**和**查看决策**
- 开关状态保存在 localStorage
- 仅在打开网页时生效

### 服务端调度器（推荐）

- 通过 `.env.local` 配置
- 后台持续运行
- 不依赖浏览器
- 适合24/7无人值守

## 🎯 推荐配置

### 测试阶段
```bash
OKX_SANDBOX=true
AI_DECISION_ENABLED=true
AI_DECISION_INTERVAL_MS=300000  # 5分钟
AI_AUTO_EXECUTE=false           # 手动审核
```

### 稳定运行
```bash
OKX_SANDBOX=false               # 或true，看需求
AI_DECISION_ENABLED=true
AI_DECISION_INTERVAL_MS=900000  # 15分钟（更稳健）
AI_AUTO_EXECUTE=true            # ⚠️ 自动执行
```

## 📊 完整的系统架构

```
服务启动（npm run dev）
    ↓
启动所有后台调度器：
├─ equityScheduler (1分钟)
├─ dataCollector (3分钟)
├─ cleanupScheduler (1天)
└─ aiDecisionScheduler (5分钟) ⭐
    ↓
即使关闭浏览器
    ↓
后台继续运行：
├─ 采集数据
├─ 生成AI决策
├─ 执行交易（如启用）
└─ 保存到数据库
    ↓
用户随时打开网页
    ↓
查看：
├─ 账户曲线
├─ 决策历史
├─ 当前仓位
└─ 交易记录
```

## ✅ 现在的优势

- ✅ **24/7运行** - 关闭浏览器也继续工作
- ✅ **服务端调度** - 更稳定可靠
- ✅ **环境变量控制** - 统一配置
- ✅ **无需人工干预** - 完全自动化
- ✅ **数据持久化** - 所有记录保存
- ✅ **随时查看** - 打开网页即可查看结果

## 🚨 重要提醒

**启用 `AI_AUTO_EXECUTE=true` 前：**
1. 确认已在沙盒环境充分测试
2. 确认AI决策质量稳定
3. 确认止盈止损设置合理
4. 确认账户资金可承受风险
5. 建议从小金额开始

**监控建议：**
- 定期查看决策质量
- 监控账户表现
- 查看错误日志
- 必要时随时关闭自动执行

