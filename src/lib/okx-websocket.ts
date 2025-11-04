/**
 * OKX WebSocket 实时数据客户端
 * 
 * 订阅账户余额、仓位和价格的实时更新
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { WebsocketClient } from 'okx-api';

/**
 * 实时数据回调接口
 */
export interface RealtimeCallbacks {
  onBalance?: (data: { totalEq: number; availBal: number }) => void;
  onPositions?: (data: any[]) => void;
  onPrices?: (data: Record<string, number>) => void;
  onError?: (error: Error) => void;
}

/**
 * 创建OKX WebSocket客户端
 */
export function createOKXWebSocketClient(callbacks: RealtimeCallbacks) {
  const isSandbox = process.env.OKX_SANDBOX === 'true';
  
  const wsClient = new WebsocketClient({
    accounts: [{
      apiKey: process.env.OKX_API_KEY || '',
      apiSecret: process.env.OKX_SECRET || '',
      apiPass: process.env.OKX_PASSWORD || '',
    }],
    demoTrading: isSandbox
  });

  // 监听连接打开
  wsClient.on('open', (data: any) => {
    console.log('[OKX-WS] WebSocket连接已建立', data);
  });

  // 监听消息更新
  wsClient.on('update', (data: any) => {
    try {
      // 处理账户余额更新
      if (data?.arg?.channel === 'account') {
        const accountData = Array.isArray(data.data) ? data.data[0] : data.data;
        if (accountData && callbacks.onBalance) {
          callbacks.onBalance({
            totalEq: Number(accountData.totalEq || 0),
            availBal: Number(accountData.details?.[0]?.availBal || 0)
          });
        }
      }

      // 处理仓位更新
      if (data?.arg?.channel === 'positions' && data?.arg?.instType === 'SWAP') {
        if (callbacks.onPositions) {
          const positions = Array.isArray(data.data) ? data.data : [data.data];
          callbacks.onPositions(positions);
        }
      }

      // 处理价格更新（ticker）
      if (data?.arg?.channel === 'tickers') {
        if (callbacks.onPrices && data.data) {
          const tickers = Array.isArray(data.data) ? data.data : [data.data];
          const prices: Record<string, number> = {};
          tickers.forEach((ticker: any) => {
            if (ticker.instId) {
              prices[ticker.instId] = Number(ticker.last || 0);
            }
          });
          callbacks.onPrices(prices);
        }
      }
    } catch (error) {
      console.error('[OKX-WS] 处理消息失败:', error);
      callbacks.onError?.(error as Error);
    }
  });

  // 监听错误
  wsClient.on('exception', (error: any) => {
    console.error('[OKX-WS] WebSocket异常:', error);
    callbacks.onError?.(error);
  });

  // 监听响应（用于调试）
  wsClient.on('response', (data: any) => {
    console.log('[OKX-WS] 响应:', data);
  });

  return wsClient;
}

/**
 * 订阅实时账户数据（需要认证）
 */
export function subscribePrivateChannels(wsClient: any) {
  try {
    // 订阅账户余额
    wsClient.subscribe([
      {
        channel: 'account',
        ccy: 'USDT'
      }
    ]);

    // 订阅仓位变化
    wsClient.subscribe([
      {
        channel: 'positions',
        instType: 'SWAP'
      }
    ]);

    console.log('[OKX-WS] ✅ 已订阅私有频道：账户余额、仓位');
  } catch (error) {
    console.error('[OKX-WS] 订阅私有频道失败:', error);
    throw error;
  }
}

/**
 * 订阅实时价格（公开频道，不需要认证）
 */
export function subscribePublicChannels(wsClient: any, instIds: string[]) {
  try {
    // 订阅ticker（价格）
    const subscriptions = instIds.map(instId => ({
      channel: 'tickers',
      instId
    }));

    wsClient.subscribe(subscriptions);

    console.log('[OKX-WS] ✅ 已订阅公开频道：', instIds.join(', '));
  } catch (error) {
    console.error('[OKX-WS] 订阅公开频道失败:', error);
    throw error;
  }
}

