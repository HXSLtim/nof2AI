/**
 * 测试OKX模拟盘配置
 * 验证demoTrading参数是否正确设置请求头
 */

import { RestClient } from 'okx-api';
import * as dotenv from 'dotenv';
import * as path from 'path';

// 加载环境变量
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

console.log('\n========================================');
console.log('OKX 模拟盘配置测试');
console.log('========================================\n');

// 检查环境变量
const apiKey = process.env.OKX_API_KEY;
const apiSecret = process.env.OKX_SECRET;
const apiPass = process.env.OKX_PASSWORD;
const isSandbox = process.env.OKX_SANDBOX === 'true';

console.log('【环境变量】');
console.log(`OKX_SANDBOX: ${process.env.OKX_SANDBOX}`);
console.log(`isSandbox: ${isSandbox}`);
console.log(`API Key: ${apiKey ? apiKey.substring(0, 8) + '...' : '❌ 未设置'}`);
console.log(`API Secret: ${apiSecret ? '✅ 已设置' : '❌ 未设置'}`);
console.log(`API Password: ${apiPass ? '✅ 已设置' : '❌ 未设置'}`);

if (!apiKey || !apiSecret || !apiPass) {
  console.error('\n❌ 错误：API密钥未配置完整');
  process.exit(1);
}

// 创建客户端
console.log('\n【创建RestClient】');
const client = new RestClient({
  apiKey,
  apiSecret,
  apiPass,
  demoTrading: isSandbox,
});

console.log(`✅ RestClient 已创建`);
console.log(`   - demoTrading: ${isSandbox}`);

// 检查客户端内部配置
const internalOptions = (client as any).options;
const globalRequestOptions = (client as any).globalRequestOptions;

console.log('\n【客户端内部配置】');
console.log('options.demoTrading:', internalOptions?.demoTrading);
console.log('globalRequestOptions.headers:', JSON.stringify(globalRequestOptions?.headers, null, 2));

// 测试API调用
console.log('\n【测试API调用】');
console.log('正在调用 getBalance()...\n');

async function testAPI() {
  try {
    const balance = await client.getBalance();
    console.log('✅ API调用成功！');
    console.log('返回数据:', JSON.stringify(balance, null, 2));
  } catch (error: any) {
    console.error('❌ API调用失败');
    console.error('错误代码:', error.code);
    console.error('错误信息:', error.msg || error.message);
    console.error('完整错误:', error);
    
    if (error.code === '50101') {
      console.error('\n【50101错误诊断】');
      console.error('此错误表示：APIKey does not match current environment');
      console.error('\n可能原因：');
      console.error('1. API密钥不是从Demo Trading后台创建的');
      console.error('2. 请求头中的 x-simulated-trading 未正确设置');
      console.error('3. demoTrading 参数未正确传递给RestClient');
      console.error('\n建议：');
      console.error('- 访问 https://www.okx.com/demo-trading');
      console.error('- 创建Demo Trading专用的API密钥');
      console.error('- 确保请求头包含: x-simulated-trading: 1');
    }
    
    process.exit(1);
  }
}

testAPI().then(() => {
  console.log('\n========================================');
  console.log('测试完成');
  console.log('========================================\n');
});

