/**
 * 统一数据服务层
 * 提供所有数据的统一获取、缓存和订阅管理
 * 支持WebSocket实时推送和定时刷新fallback
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { pricesCache, positionsCache, decisionsCache, globalCache } from './CacheService';
import { getRefreshInterval, getWSFallbackInterval } from '@/lib/cache-config';

/**
 * 数据订阅回调类型
 */
export type DataCallback<T> = (data: T) => void;

/**
 * 订阅管理器
 */
class SubscriptionManager<T> {
  private subscribers = new Set<DataCallback<T>>();
  private currentData: T | null = null;

  subscribe(callback: DataCallback<T>): () => void {
    this.subscribers.add(callback);

    // 如果有当前数据，立即发送
    if (this.currentData !== null) {
      callback(this.currentData);
    }

    // 返回取消订阅函数
    return () => {
      this.subscribers.delete(callback);
    };
  }

  notify(data: T): void {
    this.currentData = data;
    this.subscribers.forEach((callback) => {
      try {
        callback(data);
      } catch (error) {
        console.error('[SubscriptionManager] 通知订阅者失败:', error);
      }
    });
  }

  getSubscriberCount(): number {
    return this.subscribers.size;
  }

  clear(): void {
    this.subscribers.clear();
  }
}

/**
 * 价格数据类型
 */
export interface PriceData {
  [symbol: string]: number;
}

/**
 * 仓位数据类型
 */
export interface Position {
  instId: string;
  posId: string;
  posSide: string;
  pos: string;
  avgPx: string;
  upl: string;
  uplRatio: string;
  lever: string;
  notionalUsd: string;
  markPx: string;
  margin: string;
  mgnRatio: string;
  [key: string]: any;
}

/**
 * 账户信息类型
 */
export interface AccountInfo {
  totalEq?: string | number;
  availBal?: string | number;
  frozenBal?: string | number;
  ordFrozen?: string | number;
  isoEq?: string | number;
  upl?: string | number;
  [key: string]: any;
}

/**
 * 决策数据类型
 */
export interface Decision {
  id?: number;
  decision_id?: string;
  symbol?: string;
  action?: string;
  confidence?: number;
  reasoning?: string;
  created_at?: string;
  executed_at?: string;
  status?: string;
  [key: string]: any;
}

/**
 * 数据刷新配置
 */
interface RefreshConfig {
  prices: number;
  positions: number;
  account: number;
  decisions: number;
}

/**
 * 统一数据服务
 */
export class DataService {
  // 订阅管理器
  private pricesManager = new SubscriptionManager<PriceData>();
  private positionsManager = new SubscriptionManager<Position[]>();
  private accountManager = new SubscriptionManager<AccountInfo>();
  private decisionsManager = new SubscriptionManager<Decision[]>();
  private indicatorsManager = new SubscriptionManager<Map<string, any>>();

  // 自动刷新定时器
  private timers = new Map<string, NodeJS.Timeout>();

  // 刷新配置（毫秒） - 使用统一配置
  private refreshConfig: RefreshConfig = {
    prices: getRefreshInterval('PRICES'),
    positions: getRefreshInterval('POSITIONS'),
    account: getRefreshInterval('ACCOUNT'),
    decisions: getRefreshInterval('DECISIONS'),
  };

  // 是否正在刷新的标志
  private refreshing = new Set<string>();

  // WebSocket相关
  private wsClient: any = null;
  private wsEnabled = false;
  private wsConnected = false;

  // 统计信息
  private stats = {
    fetchCount: 0,
    cacheHits: 0,
    errors: 0,
    lastUpdate: {} as Record<string, number>,
    wsUpdates: 0, // WebSocket推送更新次数
    wsErrors: 0, // WebSocket错误次数
  };

  /**
   * 订阅价格数据
   */
  subscribePrices(callback: DataCallback<PriceData>): () => void {
    return this.pricesManager.subscribe(callback);
  }

  /**
   * 订阅仓位数据
   */
  subscribePositions(callback: DataCallback<Position[]>): () => void {
    return this.positionsManager.subscribe(callback);
  }

  /**
   * 订阅账户数据
   */
  subscribeAccount(callback: DataCallback<AccountInfo>): () => void {
    return this.accountManager.subscribe(callback);
  }

  /**
   * 订阅决策数据
   */
  subscribeDecisions(callback: DataCallback<Decision[]>): () => void {
    return this.decisionsManager.subscribe(callback);
  }

  /**
   * 订阅技术指标数据
   */
  subscribeIndicators(callback: DataCallback<Map<string, any>>): () => void {
    return this.indicatorsManager.subscribe(callback);
  }

  /**
   * 获取价格数据（带缓存）
   */
  async getPrices(): Promise<PriceData> {
    const cacheKey = 'prices';

    return pricesCache.getOrSet(
      cacheKey,
      async () => {
        this.stats.fetchCount++;
        const response = await fetch('/api/prices', { cache: 'no-store' });
        if (!response.ok) {
          throw new Error(`获取价格失败: ${response.status}`);
        }
        const data = await response.json();
        this.stats.lastUpdate[cacheKey] = Date.now();
        return data;
      },
      this.refreshConfig.prices
    );
  }

  /**
   * 获取仓位数据（带缓存）
   */
  async getPositions(): Promise<Position[]> {
    const cacheKey = 'positions';

    return positionsCache.getOrSet(
      cacheKey,
      async () => {
        this.stats.fetchCount++;
        const response = await fetch('/api/positions', { cache: 'no-store' });
        if (!response.ok) {
          throw new Error(`获取仓位失败: ${response.status}`);
        }
        const json = await response.json();
        this.stats.lastUpdate[cacheKey] = Date.now();
        // API返回 {success: true, data: [...]}
        return json.data || [];
      },
      this.refreshConfig.positions
    );
  }

  /**
   * 获取账户数据（带缓存）
   */
  async getAccount(): Promise<AccountInfo> {
    const cacheKey = 'account';

    return globalCache.getOrSet(
      cacheKey,
      async () => {
        this.stats.fetchCount++;
        const response = await fetch('/api/account/balance', { cache: 'no-store' });
        if (!response.ok) {
          throw new Error(`获取账户信息失败: ${response.status}`);
        }
        const json = await response.json();
        this.stats.lastUpdate[cacheKey] = Date.now();
        // API返回包含success字段，直接返回整个响应
        return json || {};
      },
      this.refreshConfig.account
    );
  }

  /**
   * 获取决策数据（带缓存）
   */
  async getDecisions(limit: number = 20): Promise<Decision[]> {
    const cacheKey = `decisions:${limit}`;

    return decisionsCache.getOrSet(
      cacheKey,
      async () => {
        this.stats.fetchCount++;
        const response = await fetch(`/api/decisions?limit=${limit}`, { cache: 'no-store' });
        if (!response.ok) {
          throw new Error(`获取决策数据失败: ${response.status}`);
        }
        const json = await response.json();
        this.stats.lastUpdate[cacheKey] = Date.now();
        // API返回 {success: true, data: [...]}
        return json.data || [];
      },
      this.refreshConfig.decisions
    );
  }

  /**
   * 刷新价格数据并通知订阅者
   */
  async refreshPrices(): Promise<void> {
    if (this.refreshing.has('prices')) return;

    try {
      this.refreshing.add('prices');
      const data = await this.getPrices();
      this.pricesManager.notify(data);
    } catch (error) {
      this.stats.errors++;
      console.error('[DataService] 刷新价格数据失败:', error);
    } finally {
      this.refreshing.delete('prices');
    }
  }

  /**
   * 刷新仓位数据并通知订阅者
   */
  async refreshPositions(): Promise<void> {
    if (this.refreshing.has('positions')) return;

    try {
      this.refreshing.add('positions');
      const data = await this.getPositions();
      this.positionsManager.notify(data);
    } catch (error) {
      this.stats.errors++;
      console.error('[DataService] 刷新仓位数据失败:', error);
    } finally {
      this.refreshing.delete('positions');
    }
  }

  /**
   * 刷新账户数据并通知订阅者
   */
  async refreshAccount(): Promise<void> {
    if (this.refreshing.has('account')) return;

    try {
      this.refreshing.add('account');
      const data = await this.getAccount();
      this.accountManager.notify(data);
    } catch (error) {
      this.stats.errors++;
      console.error('[DataService] 刷新账户数据失败:', error);
    } finally {
      this.refreshing.delete('account');
    }
  }

  /**
   * 刷新决策数据并通知订阅者
   */
  async refreshDecisions(limit: number = 20): Promise<void> {
    if (this.refreshing.has('decisions')) return;

    try {
      this.refreshing.add('decisions');
      const data = await this.getDecisions(limit);
      this.decisionsManager.notify(data);
    } catch (error) {
      this.stats.errors++;
      console.error('[DataService] 刷新决策数据失败:', error);
    } finally {
      this.refreshing.delete('decisions');
    }
  }

  /**
   * 初始化WebSocket（仅客户端）
   */
  async initWebSocket(): Promise<void> {
    // ⚠️ WebSocket需要API密钥，不能在浏览器客户端使用
    // 只能在服务端使用，但DataService运行在客户端
    // 所以暂时禁用WebSocket
    console.log('[DataService] WebSocket功能已禁用（客户端无法安全使用API密钥）');
    console.log('[DataService] 将使用定时刷新模式');
    this.wsEnabled = false;
    this.wsConnected = false;
    return;
    
    /* WebSocket代码暂时注释
    // 只在客户端启用WebSocket
    if (typeof window === 'undefined') {
      console.log('[DataService] 服务端环境，跳过WebSocket初始化');
      return;
    }

    try {
      console.log('[DataService] 正在初始化WebSocket...');

      // 动态导入WebSocket模块（避免服务端引入）
      const { createOKXWebSocketClient, subscribePrivateChannels, subscribePublicChannels } = 
        await import('@/lib/okx-websocket');

      // 创建WebSocket客户端
      this.wsClient = createOKXWebSocketClient({
        onPrices: (prices) => {
          console.log('[DataService] 📡 WebSocket价格更新');
          this.stats.wsUpdates++;
          this.stats.lastUpdate['prices'] = Date.now();
          
          // 更新缓存
          pricesCache.set('main_pairs_prices', prices, this.refreshConfig.prices);
          
          // 通知订阅者
          this.pricesManager.notify(prices);
        },
        onPositions: (positions) => {
          console.log('[DataService] 📡 WebSocket仓位更新');
          this.stats.wsUpdates++;
          this.stats.lastUpdate['positions'] = Date.now();
          
          // 更新缓存
          positionsCache.set('positions', positions, this.refreshConfig.positions);
          
          // 通知订阅者
          this.positionsManager.notify(positions);
        },
        onBalance: (balance) => {
          console.log('[DataService] 📡 WebSocket余额更新');
          this.stats.wsUpdates++;
          this.stats.lastUpdate['account'] = Date.now();
          
          const accountInfo = {
            totalEq: balance.totalEq.toString(),
            availBal: balance.availBal.toString(),
          };
          
          // 更新缓存
          globalCache.set('account:balance', accountInfo, this.refreshConfig.account);
          
          // 通知订阅者
          this.accountManager.notify(accountInfo);
        },
        onError: (error) => {
          console.error('[DataService] ❌ WebSocket错误:', error);
          this.stats.wsErrors++;
          this.wsConnected = false;
        },
      });

      // 等待连接建立
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // 订阅私有频道（账户、仓位）
      subscribePrivateChannels(this.wsClient);

      // 订阅公开频道（价格）
      const MAIN_PAIRS = [
        'BNB-USDT-SWAP',
        'BTC-USDT-SWAP',
        'ETH-USDT-SWAP',
        'SOL-USDT-SWAP',
        'XRP-USDT-SWAP',
        'DOGE-USDT-SWAP',
      ];
      subscribePublicChannels(this.wsClient, MAIN_PAIRS);

      this.wsEnabled = true;
      this.wsConnected = true;
      console.log('[DataService] ✅ WebSocket初始化成功');
    } catch (error) {
      console.error('[DataService] ❌ WebSocket初始化失败，将使用定时刷新:', error);
      this.wsEnabled = false;
      this.wsConnected = false;
    }
    */
  }

  /**
   * 启动自动刷新
   */
  async startAutoRefresh(): Promise<void> {
    console.log('[DataService] 启动数据更新机制');

    // 立即刷新一次
    this.refreshPrices();
    this.refreshPositions();
    this.refreshAccount();
    this.refreshDecisions();

    // 尝试初始化WebSocket
    await this.initWebSocket();

    if (this.wsEnabled && this.wsConnected) {
      console.log('[DataService] 📡 使用WebSocket实时推送（价格、仓位、账户）');
      console.log('[DataService] 📋 使用定时刷新（决策数据）');
      
      // 决策数据仍然使用定时刷新（没有WebSocket推送）
      this.timers.set(
        'decisions',
        setInterval(() => this.refreshDecisions(), this.refreshConfig.decisions)
      );
      
      // 价格、仓位、账户使用WebSocket，但保留fallback定时刷新（降低频率）
      this.timers.set(
        'prices-fallback',
        setInterval(() => {
          if (!this.wsConnected) {
            console.log('[DataService] ⚠️ WebSocket断开，使用fallback刷新价格');
            this.refreshPrices();
          }
        }, getWSFallbackInterval('PRICES'))
      );
      
      this.timers.set(
        'positions-fallback',
        setInterval(() => {
          if (!this.wsConnected) {
            console.log('[DataService] ⚠️ WebSocket断开，使用fallback刷新仓位');
            this.refreshPositions();
          }
        }, getWSFallbackInterval('POSITIONS'))
      );
      
      this.timers.set(
        'account-fallback',
        setInterval(() => {
          if (!this.wsConnected) {
            console.log('[DataService] ⚠️ WebSocket断开，使用fallback刷新账户');
            this.refreshAccount();
          }
        }, getWSFallbackInterval('ACCOUNT'))
      );
    } else {
      console.log('[DataService] 🔄 使用定时刷新（fallback模式）');
      
      // WebSocket不可用，使用完整的定时刷新
      this.timers.set(
        'prices',
        setInterval(() => this.refreshPrices(), this.refreshConfig.prices)
      );

      this.timers.set(
        'positions',
        setInterval(() => this.refreshPositions(), this.refreshConfig.positions)
      );

      this.timers.set(
        'account',
        setInterval(() => this.refreshAccount(), this.refreshConfig.account)
      );

      this.timers.set(
        'decisions',
        setInterval(() => this.refreshDecisions(), this.refreshConfig.decisions)
      );
    }
  }

  /**
   * 停止自动刷新
   */
  stopAutoRefresh(): void {
    console.log('[DataService] 停止自动刷新机制');

    this.timers.forEach((timer) => clearInterval(timer));
    this.timers.clear();
    
    // 断开WebSocket连接
    if (this.wsClient) {
      try {
        this.wsClient.close();
        console.log('[DataService] WebSocket已断开');
      } catch (error) {
        console.error('[DataService] 关闭WebSocket失败:', error);
      }
      this.wsClient = null;
      this.wsConnected = false;
    }
  }

  /**
   * 手动刷新所有数据
   */
  async refreshAll(): Promise<void> {
    console.log('[DataService] 手动刷新所有数据');

    await Promise.allSettled([
      this.refreshPrices(),
      this.refreshPositions(),
      this.refreshAccount(),
      this.refreshDecisions(),
    ]);
  }

  /**
   * 使指定类型的缓存失效
   */
  invalidateCache(type?: 'prices' | 'positions' | 'account' | 'decisions'): void {
    if (!type) {
      pricesCache.clear();
      positionsCache.clear();
      decisionsCache.clear();
      globalCache.clear();
      return;
    }

    switch (type) {
      case 'prices':
        pricesCache.clear();
        break;
      case 'positions':
        positionsCache.clear();
        break;
      case 'account':
        globalCache.invalidate('account');
        break;
      case 'decisions':
        decisionsCache.clear();
        break;
    }
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      ...this.stats,
      subscribers: {
        prices: this.pricesManager.getSubscriberCount(),
        positions: this.positionsManager.getSubscriberCount(),
        account: this.accountManager.getSubscriberCount(),
        decisions: this.decisionsManager.getSubscriberCount(),
      },
      activeRefreshes: this.refreshing.size,
      websocket: {
        enabled: this.wsEnabled,
        connected: this.wsConnected,
        updates: this.stats.wsUpdates,
        errors: this.stats.wsErrors,
      },
      cacheStats: {
        prices: pricesCache.getStats(),
        positions: positionsCache.getStats(),
        decisions: decisionsCache.getStats(),
      },
    };
  }

  /**
   * 清理资源
   */
  destroy(): void {
    this.stopAutoRefresh();
    this.pricesManager.clear();
    this.positionsManager.clear();
    this.accountManager.clear();
    this.decisionsManager.clear();
    this.indicatorsManager.clear();
  }
}

/**
 * 全局数据服务实例
 */
export const dataService = new DataService();

