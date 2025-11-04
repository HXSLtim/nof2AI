/**
 * 测试okx-api SDK的所有功能
 */

import { 
  fetchAccountBalance, 
  fetchAccountTotal, 
  fetchAvailableUSDT,
  fetchPositions,
  fetchTickers,
  fetchCandles,
  fetchFundingRate,
  fetchOpenInterest,
  fetchClosedPnL,
  fetchAccountConfig
} from '../src/lib/okx';

async function test() {
  console.log('========== 测试OKX API SDK ==========\n');
  
  try {
    // 1. 测试账户信息
    console.log('1. 测试账户余额...');
    const balance = await fetchAccountBalance();
    console.log(`  ✅ 总资产: $${balance.totalEq.toFixed(2)}`);
    console.log(`  ✅ 可用余额: $${balance.availBal.toFixed(2)}`);
    
    const total = await fetchAccountTotal();
    console.log(`  ✅ fetchAccountTotal: $${total.toFixed(2)}`);
    
    const availUSDT = await fetchAvailableUSDT();
    console.log(`  ✅ 可用USDT: $${availUSDT.toFixed(2)}`);
    console.log('');
    
    // 2. 测试获取仓位
    console.log('2. 测试获取仓位...');
    const positions = await fetchPositions();
    console.log(`  ✅ 当前仓位数: ${positions.length}`);
    
    if (positions.length > 0) {
      positions.forEach((p, idx) => {
        console.log(`  ${idx + 1}. ${p.coin} ${p.side}: ${p.contracts}张, 名义价值$${p.notional.toFixed(2)}, 盈亏$${p.unrealizedPnl.toFixed(2)}`);
      });
    } else {
      console.log('  （无仓位）');
    }
    console.log('');
    
    // 3. 测试获取价格
    console.log('3. 测试获取价格...');
    const instIds = ['BTC-USDT-SWAP', 'ETH-USDT-SWAP', 'SOL-USDT-SWAP'];
    const prices = await fetchTickers(instIds);
    console.log(`  ✅ 获取到${Object.keys(prices).length}个价格`);
    Object.entries(prices).forEach(([instId, price]) => {
      const coin = instId.split('-')[0];
      console.log(`  ${coin}: $${price}`);
    });
    console.log('');
    
    // 4. 测试获取K线
    console.log('4. 测试获取K线...');
    const candles = await fetchCandles('BTC-USDT-SWAP', '3m', 10);
    console.log(`  ✅ 获取到${candles.length}根K线`);
    if (candles.length > 0) {
      const latest = candles[candles.length - 1];
      console.log(`  最新K线: close=$${latest.close}, vol=${latest.vol.toFixed(2)}`);
    }
    console.log('');
    
    // 5. 测试资金费率
    console.log('5. 测试资金费率...');
    const fundingRate = await fetchFundingRate('BTC-USDT-SWAP');
    console.log(`  ✅ BTC资金费率: ${(fundingRate * 100).toFixed(4)}%`);
    console.log('');
    
    // 6. 测试持仓量
    console.log('6. 测试持仓量...');
    const oi = await fetchOpenInterest('BTC-USDT-SWAP');
    console.log(`  ✅ BTC持仓量: ${oi.toLocaleString()}`);
    console.log('');
    
    // 7. 测试账户配置
    console.log('7. 测试账户配置...');
    const config = await fetchAccountConfig();
    console.log(`  ✅ 持仓模式: ${config.posMode}`);
    console.log('');
    
    // 8. 测试历史盈亏
    console.log('8. 测试历史盈亏...');
    const closedPnL = await fetchClosedPnL(10);
    console.log(`  ✅ 最近关闭的仓位: ${closedPnL.length}个`);
    if (closedPnL.length > 0) {
      closedPnL.slice(0, 3).forEach((item, idx) => {
        console.log(`  ${idx + 1}. ${item.coin} ${item.direction}: 盈亏$${item.pnl.toFixed(2)}`);
      });
    }
    console.log('');
    
    console.log('========== 所有测试完成 ✅ ==========');
    console.log('\nokx-api SDK工作正常，可以进行完整迁移！');
    
  } catch (error) {
    console.error('\n❌ 测试失败:', error);
    process.exit(1);
  }
}

test();

