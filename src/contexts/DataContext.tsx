/**
 * 数据Context Provider
 * 为整个应用提供统一的数据访问和自动更新
 */

'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  dataService,
  type PriceData,
  type Position,
  type AccountInfo,
  type Decision,
} from '@/services/DataService';

/**
 * 数据Context类型定义
 */
interface DataContextType {
  // 数据状态
  prices: PriceData;
  positions: Position[];
  account: AccountInfo;
  decisions: Decision[];
  indicators: Map<string, any>;

  // 加载状态
  loading: {
    prices: boolean;
    positions: boolean;
    account: boolean;
    decisions: boolean;
  };

  // 错误状态
  errors: {
    prices: Error | null;
    positions: Error | null;
    account: Error | null;
    decisions: Error | null;
  };

  // 手动刷新函数
  refreshPrices: () => Promise<void>;
  refreshPositions: () => Promise<void>;
  refreshAccount: () => Promise<void>;
  refreshDecisions: () => Promise<void>;
  refreshAll: () => Promise<void>;

  // 使缓存失效
  invalidateCache: (type?: 'prices' | 'positions' | 'account' | 'decisions') => void;

  // 最后更新时间
  lastUpdate: {
    prices: number | null;
    positions: number | null;
    account: number | null;
    decisions: number | null;
  };
}

/**
 * 创建Context
 */
const DataContext = createContext<DataContextType | null>(null);

/**
 * DataProvider Props
 */
interface DataProviderProps {
  children: React.ReactNode;
  autoRefresh?: boolean; // 是否自动刷新，默认true
}

/**
 * DataProvider组件
 */
export function DataProvider({ children, autoRefresh = true }: DataProviderProps) {
  // 数据状态
  const [prices, setPrices] = useState<PriceData>({});
  const [positions, setPositions] = useState<Position[]>([]);
  const [account, setAccount] = useState<AccountInfo>({});
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [indicators, setIndicators] = useState<Map<string, any>>(new Map());

  // 加载状态
  const [loading, setLoading] = useState({
    prices: true,
    positions: true,
    account: true,
    decisions: true,
  });

  // 错误状态
  const [errors, setErrors] = useState<{
    prices: Error | null;
    positions: Error | null;
    account: Error | null;
    decisions: Error | null;
  }>({
    prices: null,
    positions: null,
    account: null,
    decisions: null,
  });

  // 最后更新时间
  const [lastUpdate, setLastUpdate] = useState<{
    prices: number | null;
    positions: number | null;
    account: number | null;
    decisions: number | null;
  }>({
    prices: null,
    positions: null,
    account: null,
    decisions: null,
  });

  // 手动刷新函数
  const refreshPrices = useCallback(async () => {
    try {
      setLoading((prev) => ({ ...prev, prices: true }));
      setErrors((prev) => ({ ...prev, prices: null }));
      await dataService.refreshPrices();
      setLastUpdate((prev) => ({ ...prev, prices: Date.now() }));
    } catch (error) {
      console.error('[DataContext] 刷新价格失败:', error);
      setErrors((prev) => ({ ...prev, prices: error as Error }));
    } finally {
      setLoading((prev) => ({ ...prev, prices: false }));
    }
  }, []);

  const refreshPositions = useCallback(async () => {
    try {
      setLoading((prev) => ({ ...prev, positions: true }));
      setErrors((prev) => ({ ...prev, positions: null }));
      await dataService.refreshPositions();
      setLastUpdate((prev) => ({ ...prev, positions: Date.now() }));
    } catch (error) {
      console.error('[DataContext] 刷新仓位失败:', error);
      setErrors((prev) => ({ ...prev, positions: error as Error }));
    } finally {
      setLoading((prev) => ({ ...prev, positions: false }));
    }
  }, []);

  const refreshAccount = useCallback(async () => {
    try {
      setLoading((prev) => ({ ...prev, account: true }));
      setErrors((prev) => ({ ...prev, account: null }));
      await dataService.refreshAccount();
      setLastUpdate((prev) => ({ ...prev, account: Date.now() }));
    } catch (error) {
      console.error('[DataContext] 刷新账户失败:', error);
      setErrors((prev) => ({ ...prev, account: error as Error }));
    } finally {
      setLoading((prev) => ({ ...prev, account: false }));
    }
  }, []);

  const refreshDecisions = useCallback(async () => {
    try {
      setLoading((prev) => ({ ...prev, decisions: true }));
      setErrors((prev) => ({ ...prev, decisions: null }));
      await dataService.refreshDecisions();
      setLastUpdate((prev) => ({ ...prev, decisions: Date.now() }));
    } catch (error) {
      console.error('[DataContext] 刷新决策失败:', error);
      setErrors((prev) => ({ ...prev, decisions: error as Error }));
    } finally {
      setLoading((prev) => ({ ...prev, decisions: false }));
    }
  }, []);

  const refreshAll = useCallback(async () => {
    console.log('[DataContext] 刷新所有数据');
    await Promise.allSettled([
      refreshPrices(),
      refreshPositions(),
      refreshAccount(),
      refreshDecisions(),
    ]);
  }, [refreshPrices, refreshPositions, refreshAccount, refreshDecisions]);

  const invalidateCache = useCallback(
    (type?: 'prices' | 'positions' | 'account' | 'decisions') => {
      dataService.invalidateCache(type);
    },
    []
  );

  // 订阅数据更新
  useEffect(() => {
    console.log('[DataContext] 初始化数据订阅');

    // 订阅价格数据
    const unsubscribePrices = dataService.subscribePrices((data) => {
      setPrices(data);
      setLoading((prev) => ({ ...prev, prices: false }));
      setLastUpdate((prev) => ({ ...prev, prices: Date.now() }));
    });

    // 订阅仓位数据
    const unsubscribePositions = dataService.subscribePositions((data) => {
      setPositions(data);
      setLoading((prev) => ({ ...prev, positions: false }));
      setLastUpdate((prev) => ({ ...prev, positions: Date.now() }));
    });

    // 订阅账户数据
    const unsubscribeAccount = dataService.subscribeAccount((data) => {
      setAccount(data);
      setLoading((prev) => ({ ...prev, account: false }));
      setLastUpdate((prev) => ({ ...prev, account: Date.now() }));
    });

    // 订阅决策数据
    const unsubscribeDecisions = dataService.subscribeDecisions((data) => {
      setDecisions(data);
      setLoading((prev) => ({ ...prev, decisions: false }));
      setLastUpdate((prev) => ({ ...prev, decisions: Date.now() }));
    });

    // 订阅技术指标数据
    const unsubscribeIndicators = dataService.subscribeIndicators((data) => {
      setIndicators(data);
    });

    // 启动自动刷新（异步）
    if (autoRefresh) {
      dataService.startAutoRefresh().catch((error) => {
        console.error('[DataContext] 启动自动刷新失败:', error);
      });
    }

    // 清理函数
    return () => {
      console.log('[DataContext] 清理数据订阅');
      unsubscribePrices();
      unsubscribePositions();
      unsubscribeAccount();
      unsubscribeDecisions();
      unsubscribeIndicators();
      if (autoRefresh) {
        dataService.stopAutoRefresh();
      }
    };
  }, [autoRefresh]);

  // Context值
  const value: DataContextType = {
    prices,
    positions,
    account,
    decisions,
    indicators,
    loading,
    errors,
    refreshPrices,
    refreshPositions,
    refreshAccount,
    refreshDecisions,
    refreshAll,
    invalidateCache,
    lastUpdate,
  };

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

/**
 * 使用数据Context的Hook
 */
export function useData(): DataContextType {
  const context = useContext(DataContext);

  if (!context) {
    throw new Error('useData必须在DataProvider内部使用');
  }

  return context;
}

/**
 * 便捷Hooks
 */
export function usePrices() {
  const { prices, loading, errors, refreshPrices } = useData();
  return { prices, loading: loading.prices, error: errors.prices, refresh: refreshPrices };
}

export function usePositions() {
  const { positions, loading, errors, refreshPositions } = useData();
  return {
    positions,
    loading: loading.positions,
    error: errors.positions,
    refresh: refreshPositions,
  };
}

export function useAccount() {
  const { account, loading, errors, refreshAccount } = useData();
  return { account, loading: loading.account, error: errors.account, refresh: refreshAccount };
}

export function useDecisions() {
  const { decisions, loading, errors, refreshDecisions } = useData();
  return {
    decisions,
    loading: loading.decisions,
    error: errors.decisions,
    refresh: refreshDecisions,
  };
}

