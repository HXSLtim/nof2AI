# nof2AI - AI量化交易系统

⚠️ **重要免责声明：本系统仅供学习和研究使用，不构成任何投资建议。交易有风险，投资需谨慎。**

## 📋 免责声明

**风险提示：**
- 数字货币交易具有极高风险，可能导致部分或全部资金损失
- 本系统基于AI算法进行交易决策，不保证盈利
- 过往业绩不代表未来表现
- 请在充分了解风险的前提下使用本系统

**责任限制：**
- 本系统仅供教育和研究目的使用
- 开发者不对使用本系统造成的任何损失承担责任
- 用户应自行承担所有交易风险和责任
- 在实盘交易前，请务必在沙盒环境中充分测试

**合规声明：**
- 请确保使用本系统符合当地法律法规
- 用户需要自行负责税务申报和合规事宜
- 本系统不提供任何财务建议或投资建议

## 🎯 项目简介

这是一个使用 [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app) 创建的 [Next.js](https://nextjs.org) AI量化交易系统，专用于OKX交易所的永续合约交易。

## 🤖 AI交易架构

### 核心提示词系统

本系统采用基于大语言模型的AI决策架构，通过结构化的提示词生成交易决策：

#### 📊 数据输入架构

AI模型接收以下三层数据结构：

**1. 当前市场状态**
- 实时价格数据（BTC、ETH、SOL、BNB、XRP、DOGE）
- 3分钟K线技术指标（EMA20、MACD、RSI7/14）
- 4小时趋势指标（EMA20/50、ATR、成交量、MACD、RSI14）
- 资金费率和持仓量数据

**2. 仓位信息**
- 实际持仓状态（来自OKX交易所）
- 活跃的AI决策历史
- 未平仓交易的盈亏状态
- 止盈止损设置情况

**3. 账户绩效**
- 账户总权益变化
- 可用资金余额
- 历史收益率统计
- 风险敞口分析

#### 🎯 决策输出格式

AI必须以严格的JSON格式输出交易决策：

**单决策格式：**
```json
{
  "symbol": "BTC|ETH|SOL|BNB|XRP|DOGE",
  "action": "OPEN_LONG|OPEN_SHORT|CLOSE_LONG|CLOSE_SHORT|HOLD",
  "confidence": 0-100,
  "size_usdt": number,
  "take_profit": number,
  "stop_loss": number,
  "leverage": 1-10,
  "reasoning": "详细分析",
  "timeframe": "SHORT|MEDIUM|LONG"
}
```

**多决策格式：**
```json
{
  "decisions": [
    { "symbol": "BTC", "action": "OPEN_LONG", "confidence": 75, ... },
    { "symbol": "ETH", "action": "HOLD", "confidence": 50, ... }
  ]
}
```

#### 🛡️ 风险控制规则

**开仓条件：**
- 多头：价格 > EMA20，MACD > 0，RSI 50-80，成交量放大
- 空头：价格 < EMA20，MACD < 0，RSI 20-50，资金费率为正
- 置信度要求 ≥ 70%
- 技术指标需强烈对齐（至少3个指标）

**平仓规则：**
- 盈利目标：净收益 ≥ +5%~15%（根据持仓时间）
- 止损限制：未实现亏损 ≤ -8%
- 失效条件：技术设置完全破坏
- 最短持仓：至少30分钟

#### 📈 技术指标体系

**3分钟级别指标：**
- EMA20：短期趋势判断
- MACD：动量和趋势变化
- RSI7/14：超买超卖状态
- 成交量：市场活跃度

**4小时级别指标：**
- EMA20/50：中长期趋势
- ATR3/14：波动性分析
- 成交量均值：量价关系
- MACD/RSI：趋势确认

**市场情绪指标：**
- 资金费率：多空情绪偏向
- 持仓量变化：资金流入流出
- 价格行为：关键位置突破

### 数据采集流程

1. **实时数据获取**：通过OKX API获取价格、K线、持仓等数据
2. **技术指标计算**：本地计算EMA、MACD、RSI、ATR等技术指标
3. **市场情绪分析**：整合资金费率、持仓量等情绪指标
4. **历史数据存储**：使用SQLite数据库存储历史数据
5. **提示词生成**：结构化所有数据供AI模型分析

## 🚀 快速开始

### 环境配置

首先，运行开发服务器：

```bash
npm run dev
# 或者
yarn dev
# 或者
pnpm dev
# 或者
bun dev
```

在浏览器中打开 [http://localhost:3000](http://localhost:3000) 查看运行结果。

### API配置

在项目根目录创建 `.env.local` 文件：

```env
# OKX API 配置
OKX_API_KEY=your_api_key
OKX_SECRET=your_api_secret
OKX_PASSWORD=your_api_password
OKX_SANDBOX=true  # 开发环境建议设为true

# AI服务配置（可选多个）
OPENAI_API_KEY=your_openai_key
DEEPSEEK_API_KEY=your_deepseek_key
MOONSHOT_API_KEY=your_moonshot_key
```

### 交易所配置

1. 注册OKX账户并开通API权限
2. 获取API Key、Secret和Passphrase
3. 建议先在沙盒环境测试
4. 配置适当的IP白名单和权限限制

## 📚 核心功能

### AI交易系统
- **智能决策生成**：基于技术指标和市场数据
- **多AI服务支持**：OpenAI、DeepSeek、Moonshot等
- **风险自动控制**：止盈止损、仓位管理
- **实时监控**：账户权益、持仓状态跟踪

### 数据分析
- **实时价格监控**：6个主流币种实时跟踪
- **技术指标计算**：EMA、MACD、RSI、ATR等
- **市场情绪分析**：资金费率、持仓量分析
- **历史数据回测**：策略表现评估

### 交易执行
- **自动下单**：基于AI决策自动执行
- **杠杆管理**：动态调整杠杆倍数
- **止盈止损**：自动设置风险管理订单
- **仓位监控**：实时跟踪持仓状态

## 📊 数据可视化

- **账户权益图表**：实时显示资金变化
- **价格滚动显示**：多币种价格实时更新
- **决策历史展示**：AI决策记录和执行结果
- **技术分析图表**：指标和趋势可视化

## ⚙️ 技术架构

- **前端框架**：Next.js 16 (App Router)
- **UI组件库**：Ant Design 5.28.0
- **数据库**：Better SQLite3
- **交易所集成**：OKX V5 API (CCXT)
- **AI服务**：多提供商兼容接口
- **开发语言**：TypeScript

## 🔧 系统特性

- **多环境支持**：沙盒/生产环境切换
- **高频数据处理**：3分钟级别数据采集
- **智能错误处理**：网络异常自动重试
- **模块化设计**：易于扩展和维护
- **实时监控**：系统状态和交易执行监控

## 📖 学习资源

要了解更多关于 Next.js 的信息，可以查看以下资源：

- [Next.js 文档](https://nextjs.org/docs) - 了解 Next.js 的功能和 API
- [学习 Next.js](https://nextjs.org/learn) - 交互式的 Next.js 教程

你可以查看 [Next.js GitHub 仓库](https://github.com/vercel/next.js) - 欢迎你的反馈和贡献！

## 🚀 部署指南

部署你的 Next.js 应用最简单的方法是使用 Next.js 创建者提供的 [Vercel 平台](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme)。

查看我们的 [Next.js 部署文档](https://nextjs.org/docs/app/building-your-application/deploying) 了解更多详情。

## 📞 联系方式

如有技术问题或建议，请联系：a2778978136@163.com

---

**再次提醒：本系统仅供学习研究使用，实盘交易有风险，请谨慎使用！**