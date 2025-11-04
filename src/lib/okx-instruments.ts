/**
 * OKX合约信息管理
 * 
 * 动态获取和缓存合约的基础信息：
 * - ctVal: 合约面值
 * - minSz: 最小下单数量
 * - lotSz: Lot size（张数增量）
 * 
 * API文档：https://www.okx.com/docs-v5/zh/#public-data-rest-api-get-instruments
 */

import { okxClient } from './okx';

/**
 * 合约信息接口
 */
export interface InstrumentInfo {
  instId: string;           // 产品ID (如 BTC-USDT-SWAP)
  ctVal: string;            // 合约面值 (如 "0.01")
  ctMult: string;           // 合约乘数
  minSz: string;            // 最小下单数量
  lotSz: string;            // Lot size (张数增量)
  tickSz: string;           // 价格增量
  instType: string;         // 产品类型
  settleCcy: string;        // 结算币种
  ctType: string;           // 合约类型
}

/**
 * 合约信息缓存
 */
class InstrumentCache {
  private cache = new Map<string, InstrumentInfo>();
  private lastUpdate = 0;
  private updateInterval = 3600000; // 1小时更新一次

  /**
   * 获取合约信息
   */
  async get(instId: string): Promise<InstrumentInfo | null> {
    // 检查缓存
    const cached = this.cache.get(instId);
    const now = Date.now();

    if (cached && (now - this.lastUpdate) < this.updateInterval) {
      return cached;
    }

    // 重新获取
    await this.refresh([instId]);
    return this.cache.get(instId) || null;
  }

  /**
   * 批量获取合约信息
   */
  async getMultiple(instIds: string[]): Promise<Map<string, InstrumentInfo>> {
    await this.refresh(instIds);
    
    const result = new Map<string, InstrumentInfo>();
    instIds.forEach(instId => {
      const info = this.cache.get(instId);
      if (info) {
        result.set(instId, info);
      }
    });
    
    return result;
  }

  /**
   * 刷新合约信息
   */
  async refresh(instIds?: string[]): Promise<void> {
    try {
      console.log('[InstrumentCache] 正在获取合约信息...');
      
      // 调用OKX API获取合约信息
      const instruments = await okxClient.getInstruments({
        instType: 'SWAP',
      });

      console.log(`[InstrumentCache] 收到 ${instruments.length} 个合约信息`);

      // 更新缓存
      instruments.forEach((inst: any) => {
        if (inst.instId && inst.instId.includes('USDT-SWAP')) {
          this.cache.set(inst.instId, {
            instId: inst.instId,
            ctVal: inst.ctVal || '1',
            ctMult: inst.ctMult || '1',
            minSz: inst.minSz || '1',
            lotSz: inst.lotSz || '1',
            tickSz: inst.tickSz || '0.1',
            instType: inst.instType,
            settleCcy: inst.settleCcy,
            ctType: inst.ctType,
          });
        }
      });

      this.lastUpdate = Date.now();
      console.log(`[InstrumentCache] ✅ 缓存已更新，共 ${this.cache.size} 个合约`);
      
      // 打印关键币种的信息
      const mainPairs = ['BTC-USDT-SWAP', 'ETH-USDT-SWAP', 'SOL-USDT-SWAP', 'XRP-USDT-SWAP', 'DOGE-USDT-SWAP', 'BNB-USDT-SWAP'];
      mainPairs.forEach(instId => {
        const info = this.cache.get(instId);
        if (info) {
          console.log(`[InstrumentCache]   ${instId}: ctVal=${info.ctVal}, minSz=${info.minSz}, lotSz=${info.lotSz}`);
        }
      });
      
    } catch (error) {
      console.error('[InstrumentCache] ❌ 获取合约信息失败:', error);
      throw error;
    }
  }

  /**
   * 清除缓存
   */
  clear(): void {
    this.cache.clear();
    this.lastUpdate = 0;
  }
}

/**
 * 全局合约信息缓存实例
 */
export const instrumentCache = new InstrumentCache();

/**
 * 获取合约面值
 */
export async function getContractValue(instId: string): Promise<number> {
  const info = await instrumentCache.get(instId);
  return Number(info?.ctVal || 1);
}

/**
 * 获取最小下单数量
 */
export async function getMinOrderSize(instId: string): Promise<number> {
  const info = await instrumentCache.get(instId);
  return Number(info?.minSz || 1);
}

/**
 * 获取Lot Size
 */
export async function getLotSize(instId: string): Promise<number> {
  const info = await instrumentCache.get(instId);
  return Number(info?.lotSz || 1);
}

/**
 * 初始化合约信息缓存（应用启动时调用）
 */
export async function initInstrumentCache(): Promise<void> {
  await instrumentCache.refresh();
}

