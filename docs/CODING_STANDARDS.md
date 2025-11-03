# 📋 编码规范

## 📋 概述

本文档定义了 nof2AI 项目的编码标准、最佳实践和代码风格规范。遵循这些规范有助于提高代码质量、可维护性和团队协作效率。

---

## 🎯 编程原则

### 💡 SOLID原则

#### 1. 单一职责原则 (SRP)
```typescript
// ❌ 错误：一个类承担多个职责
class BadUserService {
  saveUser(user: User) { /* ... */ }
  validateUser(user: User) { /* ... */ }
  sendWelcomeEmail(user: User) { /* ... */ }
  generateReport(user: User) { /* ... */ }
}

// ✅ 正确：每个类专注单一职责
class UserService {
  saveUser(user: User): Promise<User> {
    return this.userRepository.save(user);
  }
}

class UserValidator {
  validateUser(user: User): ValidationResult {
    // 验证逻辑
  }
}

class EmailService {
  sendWelcomeEmail(user: User): Promise<void> {
    // 邮件发送逻辑
  }
}
```

#### 2. 开闭原则 (OCP)
```typescript
// ❌ 错误：修改现有代码来扩展功能
class PaymentProcessor {
  processPayment(type: string, amount: number) {
    if (type === 'credit') {
      // 处理信用卡支付
    } else if (type === 'paypal') {
      // 处理PayPal支付
    }
    // 每次新增支付方式都需要修改这个类
  }
}

// ✅ 正确：通过接口和抽象来扩展
interface PaymentMethod {
  process(amount: number): Promise<PaymentResult>;
}

class CreditCardPayment implements PaymentMethod {
  async process(amount: number): Promise<PaymentResult> {
    // 信用卡支付逻辑
  }
}

class PayPalPayment implements PaymentMethod {
  async process(amount: number): Promise<PaymentResult> {
    // PayPal支付逻辑
  }
}

class PaymentProcessor {
  constructor(private paymentMethods: PaymentMethod[]) {}

  async processPayment(type: string, amount: number): Promise<PaymentResult> {
    const method = this.paymentMethods.find(m => m.constructor.name.toLowerCase().includes(type));
    if (!method) {
      throw new Error(`Unsupported payment method: ${type}`);
    }
    return method.process(amount);
  }
}
```

#### 3. 里氏替换原则 (LSP)
```typescript
// ❌ 错误：子类改变了父类的行为
class Bird {
  fly(): void {
    console.log('Flying');
  }
}

class Penguin extends Bird {
  fly(): void {
    throw new Error('Penguins cannot fly');
  }
}

// ✅ 正确：确保子类可以替换父类
abstract class Bird {
  abstract move(): void;
}

class FlyingBird extends Bird {
  move(): void {
    console.log('Flying');
  }
}

class Penguin extends Bird {
  move(): void {
    console.log('Swimming');
  }
}
```

#### 4. 接口隔离原则 (ISP)
```typescript
// ❌ 错误：臃肿的接口
interface Worker {
  work(): void;
  eat(): void;
  sleep(): void;
}

class Robot implements Worker {
  work(): void { /* ... */ }
  eat(): void { throw new Error('Robots don\'t eat'); }
  sleep(): void { throw new Error('Robots don\'t sleep'); }
}

// ✅ 正确：分离接口
interface Workable {
  work(): void;
}

interface Eatable {
  eat(): void;
}

interface Sleepable {
  sleep(): void;
}

class Human implements Workable, Eatable, Sleepable {
  work(): void { /* ... */ }
  eat(): void { /* ... */ }
  sleep(): void { /* ... */ }
}

class Robot implements Workable {
  work(): void { /* ... */ }
}
```

#### 5. 依赖倒置原则 (DIP)
```typescript
// ❌ 错误：高层模块依赖低层模块
class LightBulb {
  turnOn(): void { console.log('Light bulb on'); }
  turnOff(): void { console.log('Light bulb off'); }
}

class Switch {
  private bulb: LightBulb;
  constructor() {
    this.bulb = new LightBulb();
  }
  operate(): void {
    this.bulb.turnOn();
  }
}

// ✅ 正确：依赖抽象
interface SwitchableDevice {
  turnOn(): void;
  turnOff(): void;
}

class LightBulb implements SwitchableDevice {
  turnOn(): void { console.log('Light bulb on'); }
  turnOff(): void { console.log('Light bulb off'); }
}

class Fan implements SwitchableDevice {
  turnOn(): void { console.log('Fan on'); }
  turnOff(): void { console.log('Fan off'); }
}

class Switch {
  constructor(private device: SwitchableDevice) {}
  operate(): void {
    this.device.turnOn();
  }
}
```

---

## 📝 TypeScript 规范

### 🏗️ 类型定义

#### 基本类型
```typescript
// ✅ 使用具体类型
interface User {
  id: string;
  name: string;
  email: string;
  age: number;
  isActive: boolean;
  createdAt: Date;
  preferences: UserPreferences;
}

interface UserPreferences {
  theme: 'light' | 'dark';
  notifications: boolean;
  language: string;
}

// ❌ 避免使用 any
const userData: any = getUserData(); // 错误

// ✅ 使用 unknown 和类型保护
const userData: unknown = getUserData();
if (isUserData(userData)) {
  // userData 现在是 User 类型
}
```

#### 类型保护
```typescript
// ✅ 类型保护函数
function isUser(obj: unknown): obj is User {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'id' in obj &&
    'name' in obj &&
    'email' in obj
  );
}

// ✅ 类型断言
const userElement = document.getElementById('user') as HTMLInputElement;

// ❌ 避免非空断言
const button = document.getElementById('button')!; // 错误

// ✅ 适当使用可选链和空值合并
const button = document.getElementById('button');
button?.addEventListener('click', handleClick);
```

#### 泛型使用
```typescript
// ✅ 泛型函数
function getFirst<T>(array: T[]): T | undefined {
  return array[0];
}

// ✅ 泛型接口
interface Repository<T> {
  findById(id: string): Promise<T | null>;
  save(entity: T): Promise<T>;
  delete(id: string): Promise<void>;
}

// ✅ 泛型约束
interface Identifiable {
  id: string;
}

function updateEntity<T extends Identifiable>(entity: T): T {
  return { ...entity, updatedAt: new Date() };
}
```

---

## 📁 项目结构规范

### 🗂️ 目录结构
```
src/
├── app/                    # Next.js App Router
│   ├── api/               # API路由
│   │   ├── ai/            # AI相关API
│   │   ├── orders/        # 订单管理
│   │   ├── account/       # 账户管理
│   │   ├── market/        # 市场数据
│   │   └── system/        # 系统管理
│   ├── layout.tsx         # 根布局
│   ├── page.tsx           # 主页面
│   ├── globals.css        # 全局样式
│   └── error.tsx         # 错误页面
├── components/            # React组件
│   ├── ui/               # 基础UI组件
│   │   ├── Button.tsx
│   │   ├── Input.tsx
│   │   └── Modal.tsx
│   ├── features/          # 功能组件
│   │   ├── AIChat.tsx
│   │   ├── TradingPanel.tsx
│   │   └── AccountInfo.tsx
│   ├── layouts/          # 布局组件
│   │   ├── Header.tsx
│   │   └── Sidebar.tsx
│   └── hooks/            # 自定义Hooks
│       ├── useMarketData.ts
│       └── useWebSocket.ts
├── lib/                  # 工具库
│   ├── api/              # API客户端
│   ├── utils/            # 工具函数
│   ├── constants.ts       # 常量定义
│   ├── types.ts          # 类型定义
│   └── config.ts         # 配置文件
├── services/             # 业务服务
│   ├── ai/               # AI服务
│   ├── trading/          # 交易服务
│   └── market/           # 市场服务
├── database/             # 数据库相关
│   ├── migrations/        # 数据库迁移
│   ├── models/           # 数据模型
│   └── seeds/            # 种子数据
└── tests/                # 测试文件
    ├── unit/             # 单元测试
    ├── integration/      # 集成测试
    └── e2e/              # 端到端测试
```

### 📦 文件命名规范

#### 组件文件
```typescript
// ✅ PascalCase 命名
// AIChat.tsx
// TradingPanel.tsx
// UserDashboard.tsx

// ❌ 避免的命名
// aiChat.tsx
// trading-panel.tsx
// user_dashboard.tsx
```

#### 工具文件
```typescript
// ✅ kebab-case 或 camelCase
// margin-calculator.ts
// okx-api-client.ts
// market-data-fetcher.ts

// ❌ 避免的命名
// MarginCalculator.ts
// OKXApiClient.ts
// MarketDataFetcher.ts
```

#### 类型文件
```typescript
// ✅ types.ts 或 domain.ts
// trading.types.ts
// user.types.ts
// market.types.ts

// ❌ 避免的命名
// TradingTypes.ts
// UserTypes.ts
// MarketTypes.ts
```

---

## 🎨 React/Next.js 规范

### ⚛️ 组件开发

#### 函数组件
```typescript
// ✅ 推荐的函数组件写法
interface UserCardProps {
  user: User;
  onEdit?: (user: User) => void;
  onDelete?: (userId: string) => void;
  className?: string;
}

const UserCard: React.FC<UserCardProps> = ({
  user,
  onEdit,
  onDelete,
  className = ''
}) => {
  const [isLoading, setIsLoading] = React.useState(false);

  const handleDelete = async () => {
    if (!onDelete) return;

    setIsLoading(true);
    try {
      await onDelete(user.id);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={`user-card ${className}`}>
      <h3>{user.name}</h3>
      <p>{user.email}</p>
      <div className="actions">
        {onEdit && (
          <button onClick={() => onEdit(user)} disabled={isLoading}>
            编辑
          </button>
        )}
        {onDelete && (
          <button onClick={handleDelete} disabled={isLoading}>
            删除
          </button>
        )}
      </div>
    </div>
  );
};

export default UserCard;
```

#### 自定义Hooks
```typescript
// ✅ 自定义Hook命名以use开头
const useMarketData = (symbols: string[]) => {
  const [data, setData] = React.useState<MarketData[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        const marketData = await fetchMarketData(symbols);
        setData(marketData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [symbols]);

  return { data, loading, error, refetch: fetchData };
};

// 使用自定义Hook
function MarketDashboard() {
  const { data: marketData, loading, error } = useMarketData(['BTC', 'ETH']);

  if (loading) return <div>加载中...</div>;
  if (error) return <div>错误: {error}</div>;

  return (
    <div>
      {marketData.map(item => (
        <MarketItem key={item.symbol} data={item} />
      ))}
    </div>
  );
}
```

### 🎨 样式规范

#### CSS模块化
```typescript
// ✅ 使用CSS模块
// UserCard.module.css
.container {
  padding: 1rem;
  border: 1px solid #e0e0e0;
  border-radius: 0.5rem;
  background: white;
  transition: box-shadow 0.2s;
}

.container:hover {
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.name {
  font-size: 1.25rem;
  font-weight: 600;
  color: #1f2937;
  margin-bottom: 0.5rem;
}

// UserCard.tsx
import styles from './UserCard.module.css';

const UserCard = ({ user }) => (
  <div className={styles.container}>
    <h3 className={styles.name}>{user.name}</h3>
    <p>{user.email}</p>
  </div>
);
```

#### Tailwind CSS使用
```typescript
// ✅ 合理使用Tailwind类
<button
  className={`
    px-4 py-2
    text-sm font-medium
    rounded-md
    transition-colors
    focus:outline-none
    focus:ring-2
    focus:ring-offset-2
    ${variant === 'primary'
      ? 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500'
      : 'bg-gray-200 text-gray-900 hover:bg-gray-300 focus:ring-gray-500'
    }
    ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
  `}
  disabled={disabled}
>
  {children}
</button>
```

### 📊 状态管理

#### Context API
```typescript
// ✅ 创建Context
interface AppContextType {
  user: User | null;
  theme: 'light' | 'dark';
  updateUser: (user: User) => void;
  toggleTheme: () => void;
}

const AppContext = React.createContext<AppContextType | undefined>(undefined);

// Context Provider
const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = React.useState<User | null>(null);
  const [theme, setTheme] = React.useState<'light' | 'dark'>('light');

  const updateUser = (newUser: User) => {
    setUser(newUser);
  };

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  return (
    <AppContext.Provider value={{ user, theme, updateUser, toggleTheme }}>
      <div className={theme}>
        {children}
      </div>
    </AppContext.Provider>
  );
};

// 使用Context
const UserProfile = () => {
  const context = React.useContext(AppContext);
  if (!context) {
    throw new Error('UserProfile must be used within AppProvider');
  }

  const { user, theme, toggleTheme } = context;

  return (
    <div>
      <h1>用户: {user?.name}</h1>
      <p>当前主题: {theme}</p>
      <button onClick={toggleTheme}>切换主题</button>
    </div>
  );
};
```

#### useReducer
```typescript
// ✅ 复杂状态使用useReducer
interface State {
  trades: Trade[];
  filters: {
    symbol: string;
    status: 'all' | 'open' | 'closed';
    dateRange: [Date | null, Date | null];
  };
  loading: boolean;
  error: string | null;
}

type Action =
  | { type: 'SET_TRADES'; payload: Trade[] }
  | { type: 'SET_FILTERS'; payload: Partial<State['filters']> }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null };

const initialState: State = {
  trades: [],
  filters: {
    symbol: '',
    status: 'all',
    dateRange: [null, null]
  },
  loading: false,
  error: null
};

function tradesReducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_TRADES':
      return { ...state, trades: action.payload, loading: false };
    case 'SET_FILTERS':
      return { ...state, filters: { ...state.filters, ...action.payload } };
    case 'SET_LOADING':
      return { ...state, loading: action.payload };
    case 'SET_ERROR':
      return { ...state, error: action.payload, loading: false };
    default:
      return state;
  }
}

function TradesTable() {
  const [state, dispatch] = React.useReducer(tradesReducer, initialState);

  const loadTrades = async () => {
    dispatch({ type: 'SET_LOADING', payload: true });
    try {
      const trades = await fetchTrades();
      dispatch({ type: 'SET_TRADES', payload: trades });
    } catch (error) {
      dispatch({ type: 'SET_ERROR', payload: error.message });
    }
  };

  React.useEffect(() => {
    loadTrades();
  }, []);

  // ... 组件渲染
}
```

---

## 🛠️ API开发规范

### 🚦 API路由规范

#### 标准响应格式
```typescript
// ✅ 统一的响应格式
interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  timestamp: string;
}

// 成功响应
const successResponse = <T>(data: T, message?: string): APIResponse<T> => ({
  success: true,
  data,
  message,
  timestamp: new Date().toISOString()
});

// 错误响应
const errorResponse = (error: string, status: number = 400): APIResponse => ({
  success: false,
  error,
  timestamp: new Date().toISOString()
});

// API路由示例
export async function GET(request: NextRequest) {
  try {
    const trades = await getTrades();
    return NextResponse.json(successResponse(trades));
  } catch (error) {
    console.error('Failed to fetch trades:', error);
    return NextResponse.json(
      errorResponse('Failed to fetch trades'),
      { status: 500 }
    );
  }
}
```

#### 请求验证
```typescript
// ✅ 请求数据验证
import { z } from 'zod';

// 定义验证schema
const createOrderSchema = z.object({
  symbol: z.enum(['BTC-USDT-SWAP', 'ETH-USDT-SWAP', 'SOL-USDT-SWAP']),
  side: z.enum(['buy', 'sell']),
  type: z.enum(['market', 'limit']),
  size: z.string().min(1),
  leverage: z.number().min(1).max(10).optional(),
  price: z.string().optional()
});

type CreateOrderRequest = z.infer<typeof createOrderSchema>;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // 验证请求数据
    const validatedData = createOrderSchema.parse(body);

    // 处理订单
    const order = await createOrder(validatedData);

    return NextResponse.json(successResponse(order));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        errorResponse('Invalid request data', 400),
        { status: 400 }
      );
    }

    console.error('Failed to create order:', error);
    return NextResponse.json(
      errorResponse('Failed to create order'),
      { status: 500 }
    );
  }
}
```

### 🔌 数据库访问规范

#### Repository模式
```typescript
// ✅ Repository模式实现
interface TradeRepository {
  findById(id: string): Promise<Trade | null>;
  findAll(filters?: TradeFilters): Promise<Trade[]>;
  save(trade: Trade): Promise<Trade>;
  update(id: string, updates: Partial<Trade>): Promise<Trade | null>;
  delete(id: string): Promise<void>;
}

class SQLiteTradeRepository implements TradeRepository {
  private db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  async findById(id: string): Promise<Trade | null> {
    const row = await this.db.get(
      'SELECT * FROM trades WHERE id = ?',
      [id]
    );

    return row ? this.mapRowToTrade(row) : null;
  }

  async findAll(filters?: TradeFilters): Promise<Trade[]> {
    let query = 'SELECT * FROM trades WHERE 1=1';
    const params: any[] = [];

    if (filters?.symbol) {
      query += ' AND symbol = ?';
      params.push(filters.symbol);
    }

    if (filters?.status) {
      query += ' AND status = ?';
      params.push(filters.status);
    }

    if (filters?.startDate) {
      query += ' AND created_at >= ?';
      params.push(filters.startDate.toISOString());
    }

    query += ' ORDER BY created_at DESC';

    const rows = await this.db.all(query, params);
    return rows.map(row => this.mapRowToTrade(row));
  }

  async save(trade: Trade): Promise<Trade> {
    const result = await this.db.run(
      `INSERT INTO trades (symbol, side, size, price, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [trade.symbol, trade.side, trade.size, trade.price, trade.status, new Date().toISOString()]
    );

    return this.findById(result.lastID!)!;
  }

  private mapRowToTrade(row: any): Trade {
    return {
      id: row.id,
      symbol: row.symbol,
      side: row.side,
      size: row.size,
      price: row.price,
      status: row.status,
      createdAt: new Date(row.created_at)
    };
  }
}
```

#### 事务处理
```typescript
// ✅ 数据库事务
interface TransactionService {
  executeInTransaction<T>(
    operation: (tx: Database) => Promise<T>
  ): Promise<T>;
}

class SQLiteTransactionService implements TransactionService {
  constructor(private db: Database) {}

  async executeInTransaction<T>(
    operation: (tx: Database) => Promise<T>
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        this.db.run('BEGIN TRANSACTION');

        let result: T;

        operation(this.db)
          .then((value) => {
            result = value;
            this.db.run('COMMIT');
            resolve(result);
          })
          .catch((error) => {
            this.db.run('ROLLBACK');
            reject(error);
          });
      });
    });
  }
}

// 使用事务
async function placeOrder(order: Order, trade: Trade) {
  return await transactionService.executeInTransaction(async (tx) => {
    // 保存订单
    await orderRepository.save(order, tx);

    // 保存交易记录
    await tradeRepository.save(trade, tx);

    // 更新用户余额
    await accountRepository.updateBalance(
      order.userId,
      -order.total,
      tx
    );

    return { orderId: order.id, tradeId: trade.id };
  });
}
```

---

## 🧪 测试规范

### 📝 单元测试

#### Jest + React Testing Library
```typescript
// ✅ 组件测试
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import UserCard from './UserCard';

describe('UserCard', () => {
  const mockUser = {
    id: '1',
    name: 'John Doe',
    email: 'john@example.com'
  };

  const mockOnEdit = vi.fn();
  const mockOnDelete = vi.fn();

  beforeEach(() => {
    mockOnEdit.mockClear();
    mockOnDelete.mockClear();
  });

  it('renders user information correctly', () => {
    render(
      <UserCard
        user={mockUser}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
      />
    );

    expect(screen.getByText(mockUser.name)).toBeInTheDocument();
    expect(screen.getByText(mockUser.email)).toBeInTheDocument();
  });

  it('calls onEdit when edit button is clicked', async () => {
    const user = userEvent.setup();
    render(
      <UserCard
        user={mockUser}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
      />
    );

    await user.click(screen.getByText('编辑'));
    expect(mockOnEdit).toHaveBeenCalledWith(mockUser);
  });

  it('calls onDelete when delete button is clicked', async () => {
    const user = userEvent.setup();
    render(
      <UserCard
        user={mockUser}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
      />
    );

    await user.click(screen.getByText('删除'));
    expect(mockOnDelete).toHaveBeenCalledWith(mockUser.id);
  });

  it('disables buttons when loading', () => {
    render(
      <UserCard
        user={mockUser}
        onEdit={mockOnEdit}
        onDelete={mockOnDelete}
        loading={true}
      />
    );

    expect(screen.getByText('编辑')).toBeDisabled();
    expect(screen.getByText('删除')).toBeDisabled();
  });
});
```

#### 工具函数测试
```typescript
// ✅ 工具函数测试
import { calculateMarginRequirement } from '@/lib/margin-calculator';

describe('calculateMarginRequirement', () => {
  it('calculates margin correctly for BTC trade', () => {
    const result = calculateMarginRequirement('BTC', 27000, 1000, 3);

    expect(result.contractSize).toBeGreaterThan(0);
    expect(result.notionalValue).toBe(27000);
    expect(result.requiredMargin).toBe(9000);
    expect(result.tradingFees).toBeGreaterThan(0);
    expect(result.totalRequired).toBeGreaterThan(9000);
  });

  it('handles minimum order size', () => {
    const result = calculateMarginRequirement('BTC', 27000, 1, 1);
    expect(result.contractSize).toBe(0);
  });

  it('includes trading fees', () => {
    const result = calculateMarginRequirement('BTC', 27000, 1000, 3);
    const expectedFees = 27000 * 0.001; // 0.1% trading fee
    expect(result.tradingFees).toBeCloseTo(expectedFees, 2);
  });
});
```

### 🔄 集成测试

#### API集成测试
```typescript
// ✅ API集成测试
import { createApp } from '@/lib/test-utils';
import request from 'supertest';

describe('Orders API', () => {
  let app: Express;

  beforeAll(async () => {
    app = await createApp();
  });

  describe('POST /api/orders', () => {
    it('creates a new order successfully', async () => {
      const orderData = {
        symbol: 'BTC-USDT-SWAP',
        side: 'buy',
        type: 'market',
        size: '0.001',
        leverage: 3
      };

      const response = await request(app)
        .post('/api/orders')
        .send(orderData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toMatchObject({
        symbol: orderData.symbol,
        side: orderData.side
      });
    });

    it('returns 400 for invalid order data', async () => {
      const invalidOrder = {
        symbol: 'INVALID-SYMBOL',
        side: 'invalid-side'
      };

      await request(app)
        .post('/api/orders')
        .send(invalidOrder)
        .expect(400);
    });
  });
});
```

---

## 📚 文档规范

### 📖 JSDoc注释

#### 函数文档
```typescript
// ✅ 完整的JSDoc注释
/**
 * 计算交易所需的保证金
 *
 * @param symbol - 交易对符号，如 'BTC-USDT-SWAP'
 * @param price - 当前价格
 * @param sizeUSDT - 交易金额（USDT）
 * @param leverage - 杠杆倍数
 * @returns 保证金计算结果，包含合约张数、所需保证金、手续费等信息
 * @throws {Error} 当参数无效时抛出错误
 *
 * @example
 * ```typescript
 * const result = calculateMarginRequirement('BTC', 27000, 1000, 3);
 * console.log(result.totalRequired); // 输出所需总资金
 * ```
 */
export function calculateMarginRequirement(
  symbol: string,
  price: number,
  sizeUSDT: number,
  leverage: number
): MarginCalculation {
  // 实现...
}
```

#### 接口文档
```typescript
// ✅ 接口文档
/**
 * 表示一个用户的仓位信息
 */
interface Position {
  /** 仓位唯一标识符 */
  id: string;

  /** 交易对符号 */
  symbol: string;

  /** 仓位方向：'long' 或 'short' */
  side: 'long' | 'short';

  /** 仓位大小 */
  size: string;

  /** 入场价格 */
  avgCost: string;

  /** 未实现盈亏 */
  upl: string;

  /** 保证金模式：'isolated' 或 'cross' */
  mgnMode: 'isolated' | 'cross';

  /** 仓位数 */
  availPos: string;

  /** 保证金 */
  margin: string;

  /** 创建时间 */
  cTime: string;

  /** 更新时间 */
  uTime: string;
}
```

### 📝 README.md规范

```markdown
# 组件名称

## 简介

简要描述组件的功能和用途。

## 何时使用

描述在什么场景下应该使用这个组件。

## API

### Props

| 属性 | 类型 | 默认值 | 必需 | 描述 |
|-----|-----|------|-----|-----|
| prop1 | string | - | ✅ | 属性1的描述 |
| prop2 | number | 10 | ❌ | 属性2的描述 |
| onEvent | function | - | ❌ | 事件处理函数 |

### 事件

| 事件名称 | 参数类型 | 描述 |
|---------|---------|-----|
| onChange | { value: string } | 值变化时触发 |
| onSubmit | FormData | 表单提交时触发 |

## 示例

### 基本用法
```tsx
import Component from './Component';

<Component
  prop1="value1"
  onChange={(value) => console.log(value)}
/>
```

### 高级用法
```tsx
<Component
  prop1="value1"
  prop2={20}
  onChange={handleChange}
  onSubmit={handleSubmit}
/>
```

## 注意事项

- 注意事项1
- 注意事项2
- 注意事项3
```

---

## 🚀 性能优化规范

### ⚡ React性能优化

#### React.memo
```typescript
// ✅ 使用React.memo避免不必要的重渲染
const ExpensiveComponent = React.memo(
  function ExpensiveComponent({ data, onAction }) {
    // 复杂的渲染逻辑
    return (
      <div>
        {data.map(item => (
          <div key={item.id}>{item.name}</div>
        ))}
      </div>
    );
  },
  (prevProps, nextProps) => {
    // 自定义比较函数
    return (
      prevProps.data.length === nextProps.data.length &&
      prevProps.onAction === nextProps.onAction
    );
  }
);
```

#### useMemo和useCallback
```typescript
// ✅ 使用useMemo缓存计算结果
function TradeList({ trades, filters }) {
  const filteredTrades = React.useMemo(() => {
    return trades.filter(trade => {
      if (filters.symbol && trade.symbol !== filters.symbol) return false;
      if (filters.status && trade.status !== filters.status) return false;
      return true;
    });
  }, [trades, filters]);

  return (
    <div>
      {filteredTrades.map(trade => (
        <TradeItem key={trade.id} trade={trade} />
      ))}
    </div>
  );
}

// ✅ 使用useCallback缓存函数
function TradeTable({ onTradeSelect }) {
  const handleRowClick = React.useCallback(
    (trade: Trade) => {
      onTradeSelect(trade);
    },
    [onTradeSelect]
  );

  return (
    <table>
      {trades.map(trade => (
        <tr key={trade.id} onClick={() => handleRowClick(trade)}>
          {/* ... */}
        </tr>
      ))}
    </table>
  );
}
```

### 🗄️ 数据库性能优化

#### 索引优化
```sql
-- ✅ 为常用查询字段创建索引
CREATE INDEX idx_trades_symbol_status ON trades(symbol, status);
CREATE INDEX idx_trades_created_at ON trades(created_at);
CREATE INDEX idx_trades_user_id ON trades(user_id);

-- ✅ 复合索引优化查询
CREATE INDEX idx_positions_user_symbol ON positions(user_id, symbol, side);
```

#### 查询优化
```typescript
// ✅ 使用参数化查询避免SQL注入
async function getUserTrades(userId: string, limit: number = 50) {
  return await db.all(
    `SELECT t.*, u.name as user_name
     FROM trades t
     JOIN users u ON t.user_id = u.id
     WHERE t.user_id = ?
     ORDER BY t.created_at DESC
     LIMIT ?`,
    [userId, limit]
  );
}

// ✅ 分页查询避免大量数据传输
async function getPaginatedTrades(
  page: number = 1,
  pageSize: number = 20,
  filters?: TradeFilters
) {
  const offset = (page - 1) * pageSize;
  let query = 'SELECT * FROM trades WHERE 1=1';
  const params: any[] = [];

  if (filters?.symbol) {
    query += ' AND symbol = ?';
    params.push(filters.symbol);
  }

  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(pageSize, offset);

  const [trades, totalCount] = await Promise.all([
    db.all(query, params),
    db.get('SELECT COUNT(*) as count FROM trades WHERE symbol = ?', [filters?.symbol])
  ]);

  return {
    trades,
    pagination: {
      page,
      pageSize,
      total: totalCount.count,
      totalPages: Math.ceil(totalCount.count / pageSize)
    }
  };
}
```

---

## 🔒 安全规范

### 🔐 输入验证

#### 严格验证
```typescript
// ✅ 使用Zod进行严格验证
import { z } from 'zod';

const OrderSchema = z.object({
  symbol: z.string().regex(/^[A-Z]{2,8}-USDT-SWAP$/),
  side: z.enum(['buy', 'sell']),
  type: z.enum(['market', 'limit']),
  size: z.string().regex(/^\d+\.?\d*$/).refine(val => parseFloat(val) > 0),
  leverage: z.number().int().min(1).max(10).optional(),
  price: z.string().regex(/^\d+\.?\d*$/).optional()
});

export type Order = z.infer<typeof OrderSchema>;

export function validateOrder(input: unknown): Order {
  try {
    return OrderSchema.parse(input);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const firstError = error.errors[0];
      throw new Error(`Invalid order: ${firstError.message}`);
    }
    throw new Error('Invalid order data');
  }
}
```

#### SQL注入防护
```typescript
// ✅ 使用参数化查询
async function getUserById(userId: string) {
  // ✅ 安全：使用参数化查询
  const user = await db.get(
    'SELECT * FROM users WHERE id = ?',
    [userId]
  );

  // ❌ 危险：字符串拼接SQL
  const query = `SELECT * FROM users WHERE id = '${userId}'`;
  const user = await db.get(query); // 危险！
}
```

### 🔒 数据保护

#### 敏感数据加密
```typescript
// ✅ 敏感数据加密
import crypto from 'crypto';

class EncryptionService {
  private algorithm = 'aes-256-gcm';
  private key: Buffer;

  constructor() {
    this.key = Buffer.from(process.env.ENCRYPTION_KEY!, 'hex');
  }

  encrypt(text: string): { encrypted: string; iv: string; tag: string } {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher(this.algorithm, this.key);
    cipher.setAAD(Buffer.from('additional-data'));

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const tag = cipher.getAuthTag();

    return {
      encrypted,
      iv: iv.toString('hex'),
      tag: tag.toString('hex')
    };
  }

  decrypt(encrypted: string, iv: string, tag: string): string {
    const decipher = crypto.createDecipher(this.algorithm, this.key);
    decipher.setAAD(Buffer.from('additional-data'));
    decipher.setAuthTag(Buffer.from(tag, 'hex'));

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }
}
```

#### API密钥管理
```typescript
// ✅ API密钥安全处理
interface APIConfig {
  apiKey: string;
  secret: string;
  passphrase: string;
  sandbox: boolean;
}

class APIKeyManager {
  private config: APIConfig;

  constructor() {
    // 从环境变量读取，避免硬编码
    this.config = {
      apiKey: process.env.OKX_API_KEY!,
      secret: process.env.OKX_SECRET!,
      passphrase: process.env.OKX_PASSWORD!,
      sandbox: process.env.OKX_SANDBOX === 'true'
    };

    this.validateConfig();
  }

  private validateConfig() {
    if (!this.config.apiKey || !this.config.secret || !this.config.passphrase) {
      throw new Error('Missing required API configuration');
    }
  }

  getConfig(): APIConfig {
    return { ...this.config }; // 返回副本，避免外部修改
  }
}
```

---

## 📋 Git工作流规范

### 🏷️ 提交信息规范

#### Conventional Commits
```bash
# ✅ 规范的提交信息格式
<type>(<scope>): <subject>

<body>

<footer>
```

#### 提交类型
```bash
# ✅ feat: 新功能
feat(trading): add stop-loss order functionality

# ✅ fix: Bug修复
fix(margin): incorrect margin calculation for small orders

# ✅ docs: 文档更新
docs(api): update API documentation for new endpoints

# ✅ style: 代码格式化
style: format code with prettier

# ✅ refactor: 重构
refactor(trading): extract trading logic to service layer

# ✅ test: 测试相关
test(unit): add tests for margin calculator

# ✅ chore: 构建或工具变更
chore(deps): update dependencies to latest versions
```

#### 分支策略
```bash
# 主分支
main          # 生产环境代码
develop       # 开发分支

# 功能分支
feature/trading-engine   # 交易引擎功能
feature/ai-integration  # AI集成功能
feature/ui-redesign     # UI重新设计

# 修复分支
hotfix/critical-bug     # 关键bug修复
hotfix/security-issue    # 安全问题修复
```

---

## 📚 总结

### ✅ 必须遵守的规范

1. **代码风格**：使用ESLint和Prettier统一代码格式
2. **类型安全**：充分利用TypeScript类型系统
3. **组件设计**：遵循React最佳实践和模式
4. **API设计**：RESTful风格，统一响应格式
5. **数据库访问**：使用Repository模式，避免直接SQL
6. **测试覆盖**：新功能必须包含相应测试
7. **文档完善**：公共API和复杂组件必须有文档
8. **安全考虑**：输入验证、数据保护、权限控制

### 🎯 持续改进

1. **定期代码审查**：确保代码质量
2. **性能监控**：定期检查性能瓶颈
3. **安全审计**：定期进行安全检查
4. **文档更新**：保持文档与代码同步
5. **技术债务**：及时处理技术债务问题

---

*本编码规范将根据项目发展和技术演进持续更新和完善。*