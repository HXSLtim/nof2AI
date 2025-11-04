/**
 * 资金调度器
 * 
 * 解决并行下单时的资金超卖问题
 * 
 * 工作原理：
 * 1. 维护实时可用资金状态
 * 2. 下单前分配并锁定资金
 * 3. 下单后扣除实际使用的资金
 * 4. 支持异步锁，确保串行访问
 * 5. AI决策开始时自动刷新可用金额
 */

import { fetchAvailableUSDT } from './okx';

/**
 * 资金分配请求
 */
interface FundAllocation {
  symbol: string;
  requestedAmount: number;
  allocatedAmount: number;
  timestamp: number;
}

/**
 * 资金调度器类
 */
class FundScheduler {
  private availableFunds: number = 0;
  private allocations = new Map<string, FundAllocation>();
  private lastRefresh: number = 0;
  private mutex: Promise<void> = Promise.resolve();
  private stats = {
    totalAllocations: 0,
    totalReleased: 0,
    refreshCount: 0,
    rejections: 0,
  };

  /**
   * 刷新可用资金（从OKX获取最新值）
   */
  async refresh(): Promise<number> {
    // 使用互斥锁确保线程安全
    return this.withLock(async () => {
      console.log('[FundScheduler] 🔄 刷新可用资金...');
      
      try {
        const freshFunds = await fetchAvailableUSDT();
        this.availableFunds = freshFunds;
        this.lastRefresh = Date.now();
        this.stats.refreshCount++;
        
        console.log(`[FundScheduler] ✅ 可用资金: $${freshFunds.toFixed(2)}`);
        console.log(`[FundScheduler] 📊 已分配: ${this.allocations.size}笔`);
        
        return freshFunds;
      } catch (error) {
        console.error('[FundScheduler] ❌ 刷新失败:', error);
        throw error;
      }
    });
  }

  /**
   * 分配资金（带锁）
   * 
   * @param symbol 币种
   * @param requestedAmount 请求的USDT金额
   * @param allowPartial 是否允许部分分配
   * @returns 实际分配的金额（如果资金不足且不允许部分分配，返回0）
   */
  async allocate(
    symbol: string,
    requestedAmount: number,
    allowPartial: boolean = true
  ): Promise<{ allocated: number; available: number; sufficient: boolean }> {
    return this.withLock(async () => {
      console.log(`[FundScheduler] 💰 ${symbol} 请求分配 $${requestedAmount.toFixed(2)}`);
      console.log(`[FundScheduler]    当前可用: $${this.availableFunds.toFixed(2)}`);
      
      // 检查是否有足够资金
      if (requestedAmount <= this.availableFunds) {
        // 资金充足，全额分配
        this.availableFunds -= requestedAmount;
        
        const allocation: FundAllocation = {
          symbol,
          requestedAmount,
          allocatedAmount: requestedAmount,
          timestamp: Date.now(),
        };
        
        this.allocations.set(symbol, allocation);
        this.stats.totalAllocations++;
        
        console.log(`[FundScheduler] ✅ ${symbol} 分配成功: $${requestedAmount.toFixed(2)}`);
        console.log(`[FundScheduler]    剩余可用: $${this.availableFunds.toFixed(2)}`);
        
        return {
          allocated: requestedAmount,
          available: this.availableFunds,
          sufficient: true,
        };
      } else if (allowPartial && this.availableFunds > 0) {
        // 资金不足但允许部分分配
        const allocatedAmount = this.availableFunds;
        this.availableFunds = 0;
        
        const allocation: FundAllocation = {
          symbol,
          requestedAmount,
          allocatedAmount,
          timestamp: Date.now(),
        };
        
        this.allocations.set(symbol, allocation);
        this.stats.totalAllocations++;
        
        console.warn(`[FundScheduler] ⚠️ ${symbol} 部分分配: $${allocatedAmount.toFixed(2)} / $${requestedAmount.toFixed(2)}`);
        console.warn(`[FundScheduler]    剩余可用: $0`);
        
        return {
          allocated: allocatedAmount,
          available: 0,
          sufficient: false,
        };
      } else {
        // 资金不足且不允许部分分配
        this.stats.rejections++;
        
        console.error(`[FundScheduler] ❌ ${symbol} 资金不足，拒绝分配`);
        console.error(`[FundScheduler]    需要: $${requestedAmount.toFixed(2)}`);
        console.error(`[FundScheduler]    可用: $${this.availableFunds.toFixed(2)}`);
        console.error(`[FundScheduler]    差额: $${(requestedAmount - this.availableFunds).toFixed(2)}`);
        
        return {
          allocated: 0,
          available: this.availableFunds,
          sufficient: false,
        };
      }
    });
  }

  /**
   * 释放资金（订单失败或取消时）
   */
  async release(symbol: string): Promise<void> {
    return this.withLock(async () => {
      const allocation = this.allocations.get(symbol);
      
      if (!allocation) {
        console.warn(`[FundScheduler] ⚠️ ${symbol} 没有找到分配记录`);
        return;
      }
      
      // 归还资金
      this.availableFunds += allocation.allocatedAmount;
      this.allocations.delete(symbol);
      this.stats.totalReleased++;
      
      console.log(`[FundScheduler] 🔄 ${symbol} 释放资金: $${allocation.allocatedAmount.toFixed(2)}`);
      console.log(`[FundScheduler]    现在可用: $${this.availableFunds.toFixed(2)}`);
    });
  }

  /**
   * 确认使用资金（订单成功后）
   */
  async confirm(symbol: string, actualUsed?: number): Promise<void> {
    return this.withLock(async () => {
      const allocation = this.allocations.get(symbol);
      
      if (!allocation) {
        console.warn(`[FundScheduler] ⚠️ ${symbol} 没有找到分配记录`);
        return;
      }
      
      // 如果实际使用比分配的少，归还差额
      if (actualUsed !== undefined && actualUsed < allocation.allocatedAmount) {
        const refund = allocation.allocatedAmount - actualUsed;
        this.availableFunds += refund;
        
        console.log(`[FundScheduler] 💵 ${symbol} 退还未用资金: $${refund.toFixed(2)}`);
        console.log(`[FundScheduler]    现在可用: $${this.availableFunds.toFixed(2)}`);
      }
      
      // 移除分配记录
      this.allocations.delete(symbol);
      console.log(`[FundScheduler] ✅ ${symbol} 确认完成`);
    });
  }

  /**
   * 获取当前可用资金（不刷新）
   */
  getAvailable(): number {
    return this.availableFunds;
  }

  /**
   * 获取分配详情
   */
  getAllocations(): FundAllocation[] {
    return Array.from(this.allocations.values());
  }

  /**
   * 获取统计信息
   */
  getStats() {
    return {
      ...this.stats,
      currentAvailable: this.availableFunds,
      activeAllocations: this.allocations.size,
      lastRefresh: this.lastRefresh,
      lastRefreshAge: Date.now() - this.lastRefresh,
    };
  }

  /**
   * 打印状态
   */
  printStatus(): void {
    console.log('\n' + '═'.repeat(60));
    console.log('[FundScheduler] 📊 资金状态');
    console.log('═'.repeat(60));
    console.log(`💰 可用资金: $${this.availableFunds.toFixed(2)}`);
    console.log(`📦 活跃分配: ${this.allocations.size}笔`);
    
    if (this.allocations.size > 0) {
      console.log('\n分配详情:');
      this.allocations.forEach((alloc, symbol) => {
        const age = Math.floor((Date.now() - alloc.timestamp) / 1000);
        console.log(`  - ${symbol}: $${alloc.allocatedAmount.toFixed(2)} (${age}秒前)`);
      });
    }
    
    console.log('\n统计:');
    console.log(`  - 总分配: ${this.stats.totalAllocations}次`);
    console.log(`  - 总释放: ${this.stats.totalReleased}次`);
    console.log(`  - 刷新次数: ${this.stats.refreshCount}次`);
    console.log(`  - 拒绝次数: ${this.stats.rejections}次`);
    console.log('═'.repeat(60) + '\n');
  }

  /**
   * 清空所有分配（紧急情况）
   */
  async reset(): Promise<void> {
    return this.withLock(async () => {
      console.warn('[FundScheduler] ⚠️ 重置所有分配');
      
      // 归还所有已分配资金
      let totalReturned = 0;
      this.allocations.forEach(alloc => {
        totalReturned += alloc.allocatedAmount;
      });
      
      this.availableFunds += totalReturned;
      this.allocations.clear();
      
      console.log(`[FundScheduler] 💵 归还资金: $${totalReturned.toFixed(2)}`);
      console.log(`[FundScheduler] 💰 现在可用: $${this.availableFunds.toFixed(2)}`);
    });
  }

  /**
   * 互斥锁实现（确保操作串行执行）
   */
  private async withLock<T>(fn: () => Promise<T>): Promise<T> {
    // 等待前一个操作完成
    const previousMutex = this.mutex;
    
    let resolve!: () => void;
    this.mutex = new Promise<void>((r) => {
      resolve = r;
    });
    
    try {
      await previousMutex;
      return await fn();
    } finally {
      resolve();
    }
  }
}

/**
 * 全局资金调度器实例
 */
export const fundScheduler = new FundScheduler();

/**
 * 便捷函数：刷新资金
 */
export async function refreshFunds(): Promise<number> {
  return fundScheduler.refresh();
}

/**
 * 便捷函数：分配资金
 */
export async function allocateFunds(
  symbol: string,
  amount: number
): Promise<{ allocated: number; available: number; sufficient: boolean }> {
  return fundScheduler.allocate(symbol, amount, false); // 不允许部分分配
}

/**
 * 便捷函数：释放资金
 */
export async function releaseFunds(symbol: string): Promise<void> {
  return fundScheduler.release(symbol);
}

/**
 * 便捷函数：确认资金使用
 */
export async function confirmFunds(symbol: string, actualUsed?: number): Promise<void> {
  return fundScheduler.confirm(symbol, actualUsed);
}

