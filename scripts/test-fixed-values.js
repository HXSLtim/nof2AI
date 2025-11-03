/**
 * 验证修复后的CONTRACT_VALUES - 所有币种
 */

const CONTRACT_VALUES = {
  'BTC': 0.01,    
  'ETH': 0.1,     // ✅ 修改：之前是1
  'SOL': 1,       
  'BNB': 0.01,    
  'XRP': 1,       
  'DOGE': 1000    // ✅ 修改：之前是1
};

// 基于用户实际反馈的数据
const testData = [
  { coin: 'BTC', pos: 3, price: 107474, expected: 3224, beforeFix: 322490 },
  { coin: 'BNB', pos: 2485, price: 986.4, expected: 24700, beforeFix: 2454186 },
  { coin: 'ETH', pos: 1, price: 3614.58, expected: 360, beforeFix: 3600 },
  { coin: 'SOL', pos: 15, price: 166.38, expected: 2495, beforeFix: 2495 },
  { coin: 'DOGE', pos: 114, price: 0.16753, expected: 19000, beforeFix: 19 },
  { coin: 'XRP', pos: 37, price: 2.4087, expected: 89, beforeFix: 89 }
];

console.log('========== 修复前 vs 修复后对比 ==========\n');

let allCorrect = true;

testData.forEach(d => {
  const contractValue = CONTRACT_VALUES[d.coin];
  const coinsAmount = d.pos * contractValue;
  const afterFix = coinsAmount * d.price;
  const match = Math.abs(afterFix - d.expected) / d.expected < 0.01;
  
  if (!match) allCorrect = false;
  
  const arrow = d.beforeFix === d.expected ? '→' : d.beforeFix > d.expected ? '↓' : '↑';
  
  console.log(`${d.coin}: ${match ? '✅' : '❌'}`);
  console.log(`  修复前: $${d.beforeFix.toLocaleString()}`);
  console.log(`  修复后: $${afterFix.toFixed(2)} ${arrow}`);
  console.log(`  期望值: $${d.expected.toLocaleString()}`);
  console.log(`  误差: ${((afterFix - d.expected) / d.expected * 100).toFixed(2)}%`);
  console.log(`  每张: ${contractValue} ${d.coin}`);
  console.log('');
});

console.log('='.repeat(60));

if (allCorrect) {
  console.log('\n🎉 所有币种计算正确！');
  console.log('\n⚠️  请立即重启Next.js服务器：');
  console.log('   1. Ctrl+C 停止当前服务器');
  console.log('   2. npm run dev 重新启动');
  console.log('   3. Ctrl+F5 刷新浏览器');
} else {
  console.log('\n❌ 仍有错误，需要进一步调整');
}

console.log('\n修复摘要:');
console.log('- ETH: 1张 = 0.1 ETH (之前错误定义为1)');
console.log('- DOGE: 1张 = 1000 DOGE (之前错误定义为1)');
console.log('- 其他币种保持不变');
