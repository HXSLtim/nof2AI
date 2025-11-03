# 🏗️ 系统架构文档

## 📋 概述

nof2AI 是一个基于人工智能的量化交易系统，采用现代化的微服务架构设计，支持多AI服务集成、实时数据处理和智能交易决策。本文档详细描述了系统的整体架构、核心组件和技术实现。

---

## 🎯 架构原则

### 💡 设计理念

#### 1. 模块化设计
- **高内聚**：每个模块专注于单一职责
- **低耦合**：模块间依赖最小化
- **可扩展**：支持水平扩展和功能扩展
- **可测试**：易于单元测试和集成测试

#### 2. 可靠性优先
- **容错机制**：关键路径有降级方案
- **幂等性**：重复操作不产生副作用
- **数据一致性**：确保数据的准确性和一致性
- **监控告警**：完善的监控和告警体系

#### 3. 性能优化
- **异步处理**：非阻塞的异步操作
- **缓存策略**：多级缓存提升响应速度
- **并发处理**：支持高并发请求
- **资源优化**：合理利用系统资源

#### 4. 安全保障
- **多层防护**：从网络到应用的多层安全
- **权限控制**：细粒度的权限管理
- **数据保护**：敏感数据的加密存储
- **审计日志**：完整的操作审计

---

## 🏛️ 整体架构

### 📐 系统架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                         前端层 (Frontend)                        │
├─────────────────────────────────────────────────────────────────┤
│  React Components (Ant Design) │ Next.js App Router │ TypeScript  │
├─────────────────────────────────────────────────────────────────┤
│                         API网关层                                │
├─────────────────────────────────────────────────────────────────┤
│      认证授权     │     限流控制     │     请求路由     │ 日志记录   │
├─────────────────────────────────────────────────────────────────┤
│                       业务服务层                                │
├─────────────────────────────────────────────────────────────────┤
│  AI决策服务   │  交易执行服务  │  风险控制服务  │  数据服务      │
├─────────────────────────────────────────────────────────────────┤
│                       外部集成层                                │
├─────────────────────────────────────────────────────────────────┤
│   OKX交易所   │   AI服务     │   数据源     │   通知服务        │
├─────────────────────────────────────────────────────────────────┤
│                       数据存储层                                │
├─────────────────────────────────────────────────────────────────┤
│   SQLite     │   Redis缓存   │   文件存储   │   日志存储        │
└─────────────────────────────────────────────────────────────────┘
```

### 🔄 数据流架构

```
市场数据源 → 数据采集 → 技术指标计算 → AI决策引擎 → 风险控制 → 交易执行 → OKX交易所
     ↓           ↓            ↓              ↓            ↓          ↓
   数据库     实时缓存      指标缓存      决策历史      仓位管理     订单记录
     ↓           ↓            ↓              ↓            ↓          ↓
   持久化     缓存更新      指标存储      决策分析      风险监控     执行跟踪
```

---

## 🧩 核心组件架构

### 1. 前端架构 (Frontend Architecture)

#### 📦 组件层次结构
```
src/app/
├── layout.tsx                 # 根布局
├── page.tsx                   # 主页面
├── globals.css                # 全局样式
└── components/
    ├── ui/                    # 基础UI组件
    │   ├── Button/
    │   ├── Modal/
    │   ├── Table/
    │   └── Chart/
    ├── features/              # 功能组件
    │   ├── AIChat.tsx         # AI聊天界面
    │   ├── EquityChart.tsx    # 权益图表
    │   ├── DecisionHistory.tsx # 决策历史
    │   ├── AccountInfo.tsx    # 账户信息
    │   ├── PriceTicker.tsx    # 价格滚动显示
    │   └── TradingPanel.tsx   # 交易面板
    └── layouts/               # 布局组件
        ├── Header.tsx
        ├── Sidebar.tsx
        └── Footer.tsx
```

#### 🎨 状态管理
```typescript
// 使用React Hooks + Context进行状态管理
interface AppState {
  marketData: MarketState;        // 市场数据状态
  positions: PositionState;       // 仓位状态
  decisions: DecisionState;       // 决策状态
  account: AccountState;          // 账户状态
  ui: UIState;                   // UI状态
}

// 状态更新使用useReducer
const [state, dispatch] = useReducer(appReducer, initialState);
```

#### 🔄 数据获取策略
```typescript
// SWR用于数据获取和缓存
const useMarketData = (symbols: string[]) => {
  return useSWR(
    ['marketData', symbols.join(',')],
    () => fetchMarketData(symbols),
    {
      refreshInterval: 3000,      // 3秒刷新
      revalidateOnFocus: true,
      errorRetryCount: 3
    }
  );
};
```

### 2. API层架构 (API Layer Architecture)

#### 🛣️ 路由设计
```
src/app/api/
├── ai/                          # AI相关API
│   ├── decision/route.ts        # AI决策生成
│   ├── execute-decision/route.ts # 执行AI决策
│   └── history/route.ts         # 决策历史
├── orders/                      # 订单管理API
│   ├── route.ts                 # 创建订单
│   ├── [id]/route.ts            # 订单详情
│   └── cancel/route.ts          # 取消订单
├── account/                     # 账户管理API
│   ├── balance/route.ts         # 账户余额
│   ├── positions/route.ts       # 仓位信息
│   └── history/route.ts         # 交易历史
├── market/                      # 市场数据API
│   ├── ticker/route.ts          # 价格数据
│   ├── kline/route.ts           # K线数据
│   └── indicators/route.ts      # 技术指标
└── system/                      # 系统管理API
    ├── health/route.ts          # 健康检查
    └── config/route.ts          # 系统配置
```

#### 🛡️ 中间件设计
```typescript
// API中间件栈
export function withAuth(handler: Function) {
  return async (req: NextRequest) => {
    // 身份验证
    const token = req.headers.get('Authorization');
    if (!validateToken(token)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return handler(req);
  };
}

export function withRateLimit(handler: Function, limit: number = 100) {
  return async (req: NextRequest) => {
    // 限流控制
    const clientId = getClientId(req);
    if (await isRateLimited(clientId, limit)) {
      return NextResponse.json({ error: 'Too Many Requests' }, { status: 429 });
    }
    return handler(req);
  };
}

export function withLogging(handler: Function) {
  return async (req: NextRequest) => {
    const start = Date.now();
    const result = await handler(req);
    const duration = Date.now() - start;

    logger.info('API Request', {
      method: req.method,
      path: req.nextUrl.pathname,
      duration,
      status: result.status
    });

    return result;
  };
}
```

### 3. 业务服务层架构 (Business Service Layer)

#### 🤖 AI决策服务
```typescript
// AI决策引擎架构
class AIDecisionEngine {
  private aiServices: Map<string, AIService>;
  private promptBuilder: PromptBuilder;
  private decisionValidator: DecisionValidator;

  async generateDecision(marketData: MarketData): Promise<AIDecision> {
    // 1. 构建提示词
    const prompt = this.promptBuilder.build(marketData);

    // 2. 调用AI服务
    const aiService = this.selectAIService();
    const response = await aiService.generateResponse(prompt);

    // 3. 解析决策
    const decision = this.parseDecision(response);

    // 4. 验证决策
    await this.decisionValidator.validate(decision);

    return decision;
  }
}
```

#### 💰 交易执行服务
```typescript
// 交易执行引擎
class TradingEngine {
  private okxClient: OKXClient;
  private marginCalculator: MarginCalculator;
  private riskManager: RiskManager;

  async executeDecision(decision: AIDecision): Promise<ExecutionResult> {
    try {
      // 1. 风险检查
      await this.riskManager.validateDecision(decision);

      // 2. 保证金计算
      const margin = await this.marginCalculator.calculate(decision);

      // 3. 创建订单
      const order = await this.createOrder(decision, margin);

      // 4. 执行订单
      const result = await this.okxClient.executeOrder(order);

      // 5. 记录执行结果
      await this.recordExecution(result);

      return result;
    } catch (error) {
      await this.handleExecutionError(error, decision);
      throw error;
    }
  }
}
```

#### 🛡️ 风险控制服务
```typescript
// 风险管理系统
class RiskManager {
  private positionMonitor: PositionMonitor;
  private exposureCalculator: ExposureCalculator;
  private alertManager: AlertManager;

  async validateDecision(decision: AIDecision): Promise<ValidationResult> {
    const checks = await Promise.all([
      this.checkPositionSize(decision),
      this.checkExposure(decision),
      this.checkCorrelation(decision),
      this.checkLeverage(decision)
    ]);

    const failedChecks = checks.filter(check => !check.passed);
    if (failedChecks.length > 0) {
      return {
        passed: false,
        reasons: failedChecks.map(check => check.reason)
      };
    }

    return { passed: true };
  }
}
```

### 4. 数据层架构 (Data Layer Architecture)

#### 🗄️ 数据库设计
```sql
-- 决策记录表
CREATE TABLE decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL,
  action TEXT NOT NULL,
  confidence INTEGER,
  size_usdt REAL,
  leverage INTEGER,
  take_profit REAL,
  stop_loss REAL,
  reasoning TEXT,
  ai_service TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  executed_at DATETIME,
  status TEXT DEFAULT 'pending'
);

-- 交易记录表
CREATE TABLE trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  decision_id INTEGER,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL,
  size REAL NOT NULL,
  price REAL NOT NULL,
  leverage INTEGER,
  order_id TEXT,
  fee REAL,
  pnl REAL,
  status TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  closed_at DATETIME,
  FOREIGN KEY (decision_id) REFERENCES decisions(id)
);

-- 市场数据表
CREATE TABLE market_data (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL,
  price REAL NOT NULL,
  volume REAL NOT NULL,
  high_24h REAL,
  low_24h REAL,
  change_24h REAL,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_symbol_timestamp (symbol, timestamp)
);

-- 技术指标表
CREATE TABLE technical_indicators (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  ema20 REAL,
  ema50 REAL,
  macd_line REAL,
  macd_signal REAL,
  rsi REAL,
  atr REAL,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_symbol_timeframe (symbol, timeframe, timestamp)
);
```

#### 🗃️ 缓存策略
```typescript
// Redis缓存架构
class CacheManager {
  private redis: Redis;

  // 市场数据缓存 (3秒过期)
  async getMarketData(symbol: string): Promise<MarketData | null> {
    const key = `market:${symbol}`;
    const data = await this.redis.get(key);
    return data ? JSON.parse(data) : null;
  }

  // 技术指标缓存 (1分钟过期)
  async getIndicators(symbol: string, timeframe: string): Promise<Indicators | null> {
    const key = `indicators:${symbol}:${timeframe}`;
    const data = await this.redis.get(key);
    return data ? JSON.parse(data) : null;
  }

  // 用户会话缓存 (30分钟过期)
  async getUserSession(userId: string): Promise<Session | null> {
    const key = `session:${userId}`;
    const data = await this.redis.get(key);
    return data ? JSON.parse(data) : null;
  }
}
```

---

## 🔄 系统集成架构

### 1. OKX交易所集成

#### 🔌 API客户端架构
```typescript
// OKX API客户端
class OKXClient {
  private apiKey: string;
  private secret: string;
  private passphrase: string;
  private baseUrl: string;

  // 账户信息
  async getAccountBalance(): Promise<Balance> {
    return this.request('GET', '/api/v5/account/balance');
  }

  // 仓位信息
  async getPositions(): Promise<Position[]> {
    return this.request('GET', '/api/v5/account/positions');
  }

  // 创建订单
  async createOrder(order: OrderRequest): Promise<OrderResponse> {
    return this.request('POST', '/api/v5/trade/order', order);
  }

  // 撤销订单
  async cancelOrder(orderId: string, symbol: string): Promise<CancelResponse> {
    return this.request('POST', '/api/v5/trade/cancel-order', {
      ordId: orderId,
      instId: symbol
    });
  }

  private async request(method: string, path: string, body?: any): Promise<any> {
    const timestamp = Date.now().toString();
    const signature = this.generateSignature(timestamp, method, path, body || '');

    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'OK-ACCESS-KEY': this.apiKey,
        'OK-ACCESS-SIGN': signature,
        'OK-ACCESS-TIMESTAMP': timestamp,
        'OK-ACCESS-PASSPHRASE': this.passphrase,
        'Content-Type': 'application/json'
      },
      body: body ? JSON.stringify(body) : undefined
    });

    return this.handleResponse(response);
  }
}
```

### 2. AI服务集成

#### 🤖 多AI服务抽象
```typescript
// AI服务抽象接口
interface AIService {
  name: string;
  generateDecision(prompt: string): Promise<AIDecision[]>;
  validateHealth(): Promise<boolean>;
}

// DeepSeek服务实现
class DeepSeekService implements AIService {
  name = 'DeepSeek';
  private apiKey: string;
  private baseUrl: string;

  async generateDecision(prompt: string): Promise<AIDecision[]> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 2000
      })
    });

    const data = await response.json();
    return this.parseResponse(data.choices[0].message.content);
  }
}

// AI服务管理器
class AIServiceManager {
  private services: Map<string, AIService> = new Map();
  private currentService: string;

  registerService(name: string, service: AIService): void {
    this.services.set(name, service);
  }

  async generateDecision(prompt: string): Promise<AIDecision[]> {
    const service = this.services.get(this.currentService);
    if (!service) {
      throw new Error(`AI service ${this.currentService} not found`);
    }

    try {
      return await service.generateDecision(prompt);
    } catch (error) {
      // 服务失败时尝试切换到备用服务
      return this.handleServiceFailure(error, prompt);
    }
  }
}
```

### 3. 数据流集成

#### 📊 数据处理管道
```typescript
// 数据处理管道
class DataPipeline {
  private collectors: DataCollector[];
  private processors: DataProcessor[];
  private storage: DataStorage;

  async processData(): Promise<void> {
    // 1. 数据收集
    const marketData = await Promise.all(
      this.collectors.map(collector => collector.collect())
    );

    // 2. 数据处理
    const processedData = await this.processDataStep(marketData);

    // 3. 数据存储
    await this.storage.store(processedData);

    // 4. 触发后续处理
    await this.triggerPostProcessing(processedData);
  }

  private async processDataStep(data: MarketData[]): Promise<ProcessedData> {
    // 计算技术指标
    const indicators = await this.calculateIndicators(data);

    // 计算市场情绪
    const sentiment = await this.calculateSentiment(data);

    // 生成交易信号
    const signals = await this.generateSignals(data, indicators);

    return {
      marketData: data,
      indicators,
      sentiment,
      signals,
      timestamp: new Date()
    };
  }
}
```

---

## 🛡️ 安全架构

### 1. 认证与授权

#### 🔐 JWT认证流程
```typescript
// JWT认证中间件
class AuthMiddleware {
  private jwtSecret: string;

  async authenticate(token: string): Promise<AuthResult> {
    try {
      const payload = jwt.verify(token, this.jwtSecret) as JWTPayload;

      // 验证用户状态
      const user = await this.getUserById(payload.userId);
      if (!user || user.status !== 'active') {
        return { authenticated: false, reason: 'User not found or inactive' };
      }

      // 检查权限
      const permissions = await this.getUserPermissions(user.id);

      return {
        authenticated: true,
        user,
        permissions
      };
    } catch (error) {
      return { authenticated: false, reason: 'Invalid token' };
    }
  }
}
```

### 2. 数据保护

#### 🔒 敏感数据加密
```typescript
// 数据加密服务
class EncryptionService {
  private algorithm = 'aes-256-gcm';
  private key: Buffer;

  encrypt(data: string): EncryptedData {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher(this.algorithm, this.key);
    cipher.setAAD(Buffer.from('additional-data'));

    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    return {
      encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex')
    };
  }

  decrypt(encryptedData: EncryptedData): string {
    const decipher = crypto.createDecipher(this.algorithm, this.key);
    decipher.setAAD(Buffer.from('additional-data'));
    decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));

    let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }
}
```

### 3. API安全

#### 🛡️ 请求安全验证
```typescript
// API安全验证
class APISecurity {
  // 请求签名验证
  verifySignature(request: APIRequest): boolean {
    const { timestamp, signature, body } = request;
    const expectedSignature = this.generateSignature(timestamp, body);
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }

  // 请求频率限制
  async checkRateLimit(clientId: string, endpoint: string): Promise<boolean> {
    const key = `rate_limit:${clientId}:${endpoint}`;
    const current = await this.redis.incr(key);

    if (current === 1) {
      await this.redis.expire(key, 60); // 1分钟过期
    }

    const limit = this.getRateLimit(endpoint);
    return current <= limit;
  }

  // IP白名单验证
  verifyIPWhitelist(ip: string): boolean {
    const allowedIPs = process.env.ALLOWED_IPS?.split(',') || [];
    return allowedIPs.length === 0 || allowedIPs.includes(ip);
  }
}
```

---

## 📊 监控架构

### 1. 系统监控

#### 📈 性能监控
```typescript
// 性能监控服务
class PerformanceMonitor {
  private metrics: Map<string, Metric> = new Map();

  // 记录API响应时间
  recordAPIMetrics(endpoint: string, duration: number, status: number): void {
    const key = `api.${endpoint}`;
    this.updateMetric(key, duration, status === 200);
  }

  // 记录数据库查询性能
  recordQueryMetrics(query: string, duration: number): void {
    const key = `db.query.${this.hashQuery(query)}`;
    this.updateMetric(key, duration, true);
  }

  // 记录交易执行性能
  recordTradeMetrics(symbol: string, duration: number, success: boolean): void {
    const key = `trade.${symbol}`;
    this.updateMetric(key, duration, success);
  }

  getMetricsSummary(): MetricsSummary {
    return {
      totalRequests: this.getTotalRequests(),
      averageResponseTime: this.getAverageResponseTime(),
      errorRate: this.getErrorRate(),
      successRate: this.getSuccessRate()
    };
  }
}
```

### 2. 业务监控

#### 💰 交易监控
```typescript
// 交易监控系统
class TradingMonitor {
  // 实时监控仓位
  async monitorPositions(): Promise<void> {
    const positions = await this.positionService.getActivePositions();

    for (const position of positions) {
      const risk = await this.assessPositionRisk(position);

      if (risk.level === 'HIGH') {
        await this.sendAlert({
          type: 'POSITION_RISK',
          symbol: position.symbol,
          message: `High risk detected for ${position.symbol} position`,
          data: position
        });
      }
    }
  }

  // 监控交易执行
  async monitorTradeExecution(tradeId: string): Promise<void> {
    const trade = await this.tradeService.getTrade(tradeId);

    if (trade.status === 'FAILED') {
      await this.sendAlert({
        type: 'TRADE_FAILED',
        tradeId,
        message: `Trade execution failed: ${trade.error}`,
        data: trade
      });
    }
  }

  // 监控账户健康
  async monitorAccountHealth(): Promise<void> {
    const balance = await this.accountService.getBalance();
    const positions = await this.positionService.getActivePositions();

    const totalExposure = this.calculateTotalExposure(positions);
    const exposureRatio = totalExposure / balance.total;

    if (exposureRatio > 0.8) {
      await this.sendAlert({
        type: 'HIGH_EXPOSURE',
        message: `High exposure ratio: ${(exposureRatio * 100).toFixed(2)}%`,
        data: { balance, totalExposure, exposureRatio }
      });
    }
  }
}
```

---

## 🚀 部署架构

### 1. 容器化部署

#### 🐳 Docker配置
```dockerfile
# Dockerfile
FROM node:18-alpine AS base

WORKDIR /app

# 安装依赖
COPY package*.json ./
RUN npm ci --only=production

# 复制源代码
COPY . .

# 构建应用
RUN npm run build

# 生产镜像
FROM node:18-alpine AS production
WORKDIR /app

COPY --from=base /app/.next ./.next
COPY --from=base /app/node_modules ./node_modules
COPY --from=base /app/package.json ./package.json
COPY --from=base /app/public ./public

EXPOSE 3000

CMD ["npm", "start"]
```

#### 🐙 Docker Compose配置
```yaml
# docker-compose.yml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=sqlite:./data/app.db
      - REDIS_URL=redis://redis:6379
    depends_on:
      - redis
    volumes:
      - ./data:/app/data
      - ./logs:/app/logs

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ./ssl:/etc/nginx/ssl
    depends_on:
      - app

volumes:
  redis_data:
```

### 2. 云原生部署

#### ☸️ Kubernetes配置
```yaml
# k8s-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: nof2ai-trading
spec:
  replicas: 3
  selector:
    matchLabels:
      app: nof2ai-trading
  template:
    metadata:
      labels:
        app: nof2ai-trading
    spec:
      containers:
      - name: app
        image: nof2ai/trading:latest
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: "production"
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: app-secrets
              key: database-url
        - name: REDIS_URL
          value: "redis://redis-service:6379"
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /api/system/health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /api/system/ready
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: nof2ai-trading-service
spec:
  selector:
    app: nof2ai-trading
  ports:
  - protocol: TCP
    port: 80
    targetPort: 3000
  type: ClusterIP
```

---

## 🔮 架构演进规划

### 1. 微服务架构迁移

#### 🎯 服务拆分策略
```typescript
// 微服务架构规划
interface MicroserviceArchitecture {
  services: {
    userService: {
      responsibilities: ['用户管理', '认证授权', '权限控制'];
      database: 'PostgreSQL';
      cache: 'Redis';
    };

    tradingService: {
      responsibilities: ['交易执行', '订单管理', '仓位管理'];
      database: 'PostgreSQL';
      cache: 'Redis';
      messageQueue: 'RabbitMQ';
    };

    aiService: {
      responsibilities: ['AI决策', '模型管理', '提示词管理'];
      database: 'MongoDB';
      cache: 'Redis';
      gpu: 'Required';
    };

    marketDataService: {
      responsibilities: ['市场数据', '技术指标', '数据存储'];
      database: 'InfluxDB'; // 时序数据库
      cache: 'Redis';
      messageQueue: 'Kafka';
    };

    riskService: {
      responsibilities: ['风险控制', '监控告警', '合规检查'];
      database: 'PostgreSQL';
      cache: 'Redis';
      notifications: 'Email/Slack';
    };
  };
}
```

### 2. 事件驱动架构

#### 📨 事件系统设计
```typescript
// 事件驱动架构
interface EventDrivenArchitecture {
  events: {
    DecisionGenerated: {
      payload: AIDecision;
      consumers: ['riskService', 'tradingService', 'monitoringService'];
    };

    OrderExecuted: {
      payload: TradeExecution;
      consumers: ['positionService', 'accountService', 'notificationService'];
    };

    PriceAlert: {
      payload: PriceAlert;
      consumers: ['aiService', 'riskService', 'userService'];
    };

    RiskAlert: {
      payload: RiskAlert;
      consumers: ['tradingService', 'notificationService', 'monitoringService'];
    };
  };
}
```

### 3. 数据湖架构

#### 🗃️ 大数据处理架构
```typescript
// 数据湖架构
interface DataLakeArchitecture {
  layers: {
    bronze: {
      description: '原始数据层';
      sources: ['OKX API', '市场数据源', '用户行为日志'];
      format: 'JSON/CSV';
      storage: 'AWS S3';
    };

    silver: {
      description: '清洗处理层';
      processing: ['数据清洗', '格式转换', '质量检查'];
      format: 'Parquet';
      storage: 'AWS S3';
    };

    gold: {
      description: '业务数据层';
      processing: ['聚合计算', '指标计算', '特征工程'];
      format: 'Delta Lake';
      storage: 'AWS S3';
    };
  };
}
```

---

## 📝 架构文档维护

### 🔄 版本管理
- **架构版本**：v2.0
- **最后更新**：2025年11月4日
- **下次审查**：2025年12月4日
- **维护者**：架构团队

### 📊 架构决策记录 (ADR)

#### ADR-001: 选择Next.js作为前端框架
**状态**：已接受
**决策**：使用Next.js 16 (App Router)
**原因**：SEO友好、性能优秀、生态完善
**后果**：学习成本、框架锁定

#### ADR-002: 选择SQLite作为主数据库
**状态**：已接受
**决策**：使用SQLite作为主数据库
**原因**：轻量级、零配置、适合中小规模
**后果**：扩展性限制、并发限制

#### ADR-003: 选择OKX作为交易所
**状态**：已接受
**决策**：集成OKX V5 API
**原因**：API稳定、文档完善、支持永续合约
**后果**：供应商锁定、API限制

---

*本架构文档将随着系统的发展持续更新，确保架构设计与实际实现保持一致。*