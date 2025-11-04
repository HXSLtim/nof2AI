/**
 * 智能缓存失效服务
 * 
 * 基于事件的缓存失效策略，而不是简单的TTL过期
 * 在关键事件发生时主动失效相关缓存，确保数据新鲜度
 */

import { pricesCache, positionsCache, decisionsCache, globalCache, indicatorsCache } from './CacheService';
import { dataService } from './DataService';

/**
 * 缓存失效事件类型
 */
export enum CacheInvalidationEvent {
  // 交易相关事件
  TRADE_EXECUTED = 'trade_executed',
  ORDER_PLACED = 'order_placed',
  ORDER_CANCELLED = 'order_cancelled',
  
  // 仓位相关事件
  POSITION_OPENED = 'position_opened',
  POSITION_CLOSED = 'position_closed',
  POSITION_MODIFIED = 'position_modified',
  
  // 价格相关事件
  PRICE_SPIKE = 'price_spike',
  PRICE_DROP = 'price_drop',
  VOLATILITY_HIGH = 'volatility_high',
  
  // AI决策相关事件
  DECISION_CREATED = 'decision_created',
  DECISION_EXECUTED = 'decision_executed',
  DECISION_REJECTED = 'decision_rejected',
  
  // 账户相关事件
  BALANCE_CHANGED = 'balance_changed',
  MARGIN_WARNING = 'margin_warning',
}

/**
 * 事件处理器类型
 */
type EventHandler = (data?: any) => void | Promise<void>;

/**
 * 缓存失效规则
 */
interface InvalidationRule {
  event: CacheInvalidationEvent;
  caches: string[]; // 需要失效的缓存类型
  immediate: boolean; // 是否立即刷新数据
  callback?: EventHandler; // 额外的回调函数
}

/**
 * 智能缓存失效服务
 */
export class CacheInvalidationService {
  private eventHandlers = new Map<CacheInvalidationEvent, Set<EventHandler>>();
  private rules: InvalidationRule[] = [];
  private stats = {
    eventsProcessed: 0,
    cachesInvalidated: 0,
    refreshesTriggered: 0,
  };

  constructor() {
    this.initializeRules();
  }

  /**
   * 初始化缓存失效规则
   */
  private initializeRules(): void {
    this.rules = [
      // 交易执行后：失效仓位、账户、决策缓存，并立即刷新
      {
        event: CacheInvalidationEvent.TRADE_EXECUTED,
        caches: ['positions', 'account', 'decisions'],
        immediate: true,
        callback: async () => {
          console.log('[CacheInvalidation] 🔄 交易执行，立即刷新关键数据');
          await dataService.refreshPositions();
          await dataService.refreshAccount();
        },
      },

      // 订单下单后：失效仓位和账户缓存
      {
        event: CacheInvalidationEvent.ORDER_PLACED,
        caches: ['positions', 'account'],
        immediate: true,
      },

      // 仓位变化：失效仓位、账户和指标缓存
      {
        event: CacheInvalidationEvent.POSITION_MODIFIED,
        caches: ['positions', 'account', 'indicators'],
        immediate: true,
        callback: async () => {
          console.log('[CacheInvalidation] 📦 仓位变化，刷新相关数据');
          await dataService.refreshPositions();
        },
      },

      // 价格剧烈波动：失效技术指标缓存
      {
        event: CacheInvalidationEvent.PRICE_SPIKE,
        caches: ['indicators'],
        immediate: false,
        callback: async (data: { symbol?: string }) => {
          if (data?.symbol) {
            console.log(`[CacheInvalidation] 📈 ${data.symbol} 价格剧变，失效指标缓存`);
            indicatorsCache.invalidate(`indicators:${data.symbol}:`);
          }
        },
      },

      // 高波动率：失效所有指标缓存
      {
        event: CacheInvalidationEvent.VOLATILITY_HIGH,
        caches: ['indicators'],
        immediate: false,
      },

      // AI决策创建：失效决策缓存
      {
        event: CacheInvalidationEvent.DECISION_CREATED,
        caches: ['decisions'],
        immediate: false,
      },

      // AI决策执行：失效所有相关缓存
      {
        event: CacheInvalidationEvent.DECISION_EXECUTED,
        caches: ['positions', 'account', 'decisions'],
        immediate: true,
        callback: async () => {
          console.log('[CacheInvalidation] 🤖 AI决策执行，刷新所有数据');
          await dataService.refreshAll();
        },
      },

      // 余额变化：失效账户缓存
      {
        event: CacheInvalidationEvent.BALANCE_CHANGED,
        caches: ['account'],
        immediate: true,
      },

      // 保证金预警：立即刷新所有数据
      {
        event: CacheInvalidationEvent.MARGIN_WARNING,
        caches: ['positions', 'account'],
        immediate: true,
        callback: async () => {
          console.warn('[CacheInvalidation] ⚠️ 保证金预警，立即刷新所有数据');
          await dataService.refreshAll();
        },
      },
    ];
  }

  /**
   * 触发事件，执行相应的缓存失效操作
   */
  async triggerEvent(event: CacheInvalidationEvent, data?: any): Promise<void> {
    console.log(`[CacheInvalidation] 🎯 触发事件: ${event}`);
    this.stats.eventsProcessed++;

    // 查找匹配的规则
    const matchingRules = this.rules.filter((rule) => rule.event === event);

    if (matchingRules.length === 0) {
      console.warn(`[CacheInvalidation] ⚠️ 未找到事件 ${event} 的处理规则`);
      return;
    }

    // 执行所有匹配的规则
    for (const rule of matchingRules) {
      await this.executeRule(rule, data);
    }

    // 触发注册的事件处理器
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try {
          await handler(data);
        } catch (error) {
          console.error(`[CacheInvalidation] ❌ 事件处理器执行失败:`, error);
        }
      }
    }
  }

  /**
   * 执行失效规则
   */
  private async executeRule(rule: InvalidationRule, data?: any): Promise<void> {
    // 失效指定的缓存
    for (const cacheType of rule.caches) {
      this.invalidateCache(cacheType);
      this.stats.cachesInvalidated++;
    }

    // 执行回调函数
    if (rule.callback) {
      try {
        await rule.callback(data);
      } catch (error) {
        console.error(`[CacheInvalidation] ❌ 规则回调执行失败:`, error);
      }
    }

    // 如果需要立即刷新
    if (rule.immediate) {
      this.stats.refreshesTriggered++;
    }
  }

  /**
   * 失效指定类型的缓存
   */
  private invalidateCache(type: string): void {
    switch (type) {
      case 'prices':
        pricesCache.clear();
        console.log('[CacheInvalidation] 💥 价格缓存已失效');
        break;

      case 'positions':
        positionsCache.clear();
        console.log('[CacheInvalidation] 💥 仓位缓存已失效');
        break;

      case 'account':
        globalCache.invalidate('account:');
        console.log('[CacheInvalidation] 💥 账户缓存已失效');
        break;

      case 'decisions':
        decisionsCache.clear();
        console.log('[CacheInvalidation] 💥 决策缓存已失效');
        break;

      case 'indicators':
        indicatorsCache.clear();
        console.log('[CacheInvalidation] 💥 指标缓存已失效');
        break;

      default:
        console.warn(`[CacheInvalidation] ⚠️ 未知的缓存类型: ${type}`);
    }
  }

  /**
   * 注册事件监听器
   */
  on(event: CacheInvalidationEvent, handler: EventHandler): () => void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }

    this.eventHandlers.get(event)!.add(handler);

    // 返回取消监听函数
    return () => {
      this.eventHandlers.get(event)?.delete(handler);
    };
  }

  /**
   * 便捷方法：交易执行后
   */
  async onTradeExecuted(data?: { symbol: string; side: string; quantity: number }): Promise<void> {
    await this.triggerEvent(CacheInvalidationEvent.TRADE_EXECUTED, data);
  }

  /**
   * 便捷方法：仓位变化后
   */
  async onPositionChanged(data?: { symbol: string; action: string }): Promise<void> {
    await this.triggerEvent(CacheInvalidationEvent.POSITION_MODIFIED, data);
  }

  /**
   * 便捷方法：价格剧变
   */
  async onPriceSpikeDetected(data: { symbol: string; change: number }): Promise<void> {
    if (Math.abs(data.change) > 5) {
      // 变化超过5%
      await this.triggerEvent(CacheInvalidationEvent.PRICE_SPIKE, data);
    }
  }

  /**
   * 便捷方法：AI决策执行
   */
  async onDecisionExecuted(data?: { decisionId: string }): Promise<void> {
    await this.triggerEvent(CacheInvalidationEvent.DECISION_EXECUTED, data);
  }

  /**
   * 便捷方法：余额变化
   */
  async onBalanceChanged(data?: { oldBalance: number; newBalance: number }): Promise<void> {
    await this.triggerEvent(CacheInvalidationEvent.BALANCE_CHANGED, data);
  }

  /**
   * 便捷方法：保证金预警
   */
  async onMarginWarning(data?: { marginRatio: number }): Promise<void> {
    await this.triggerEvent(CacheInvalidationEvent.MARGIN_WARNING, data);
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      ...this.stats,
      registeredEvents: this.eventHandlers.size,
      totalRules: this.rules.length,
    };
  }

  /**
   * 重置统计信息
   */
  resetStats(): void {
    this.stats = {
      eventsProcessed: 0,
      cachesInvalidated: 0,
      refreshesTriggered: 0,
    };
  }

  /**
   * 添加自定义规则
   */
  addRule(rule: InvalidationRule): void {
    this.rules.push(rule);
    console.log(`[CacheInvalidation] ➕ 添加新规则: ${rule.event}`);
  }

  /**
   * 移除规则
   */
  removeRule(event: CacheInvalidationEvent): void {
    const before = this.rules.length;
    this.rules = this.rules.filter((rule) => rule.event !== event);
    const removed = before - this.rules.length;
    console.log(`[CacheInvalidation] ➖ 移除 ${removed} 条规则: ${event}`);
  }
}

/**
 * 全局缓存失效服务实例
 */
export const cacheInvalidation = new CacheInvalidationService();

/**
 * 导出便捷函数
 */
export const invalidateOnTradeExecuted = (data?: any) => cacheInvalidation.onTradeExecuted(data);
export const invalidateOnPositionChanged = (data?: any) => cacheInvalidation.onPositionChanged(data);
export const invalidateOnPriceSpikeDetected = (data: { symbol: string; change: number }) =>
  cacheInvalidation.onPriceSpikeDetected(data);
export const invalidateOnDecisionExecuted = (data?: any) => cacheInvalidation.onDecisionExecuted(data);
export const invalidateOnBalanceChanged = (data?: any) => cacheInvalidation.onBalanceChanged(data);
export const invalidateOnMarginWarning = (data?: any) => cacheInvalidation.onMarginWarning(data);

