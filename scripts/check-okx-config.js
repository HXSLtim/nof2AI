/**
 * OKX API 配置诊断脚本
 * 
 * 使用方法：
 * Windows: set OKX_API_KEY=xxx && set OKX_SECRET=yyy && set OKX_PASSWORD=zzz && set OKX_SANDBOX=true && node scripts/check-okx-config.js
 * Linux/Mac: OKX_API_KEY=xxx OKX_SECRET=yyy OKX_PASSWORD=zzz OKX_SANDBOX=true node scripts/check-okx-config.js
 * 
 * 或者直接查看 .env.local 文件内容
 */

const fs = require('fs');
const path = require('path');

// 尝试读取 .env.local 文件
function loadEnvFile() {
  const envPath = path.join(process.cwd(), '.env.local');
  const envVars = {};
  
  try {
    const content = fs.readFileSync(envPath, 'utf8');
    content.split('\n').forEach(line => {
      line = line.trim();
      if (!line || line.startsWith('#')) return;
      const [key, ...valueParts] = line.split('=');
      if (key && valueParts.length) {
        envVars[key.trim()] = valueParts.join('=').trim();
      }
    });
  } catch (err) {
    console.warn('⚠️  无法读取 .env.local 文件');
  }
  
  return envVars;
}

const envVars = loadEnvFile();

const checks = {
  pass: '✅',
  fail: '❌',
  warn: '⚠️',
  info: 'ℹ️'
};

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('  OKX API 配置诊断工具');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// 1. 检查环境变量
console.log('【1】检查环境变量：');
const apiKey = envVars.OKX_API_KEY || process.env.OKX_API_KEY;
const secret = envVars.OKX_SECRET || process.env.OKX_SECRET;
const password = envVars.OKX_PASSWORD || process.env.OKX_PASSWORD;
const isSandbox = (envVars.OKX_SANDBOX || process.env.OKX_SANDBOX) === 'true';

if (apiKey) {
  console.log(`${checks.pass} OKX_API_KEY: ${apiKey.substring(0, 8)}...${apiKey.substring(apiKey.length - 4)}`);
} else {
  console.log(`${checks.fail} OKX_API_KEY: 未设置`);
}

if (secret) {
  console.log(`${checks.pass} OKX_SECRET: ${secret.substring(0, 8)}...`);
} else {
  console.log(`${checks.fail} OKX_SECRET: 未设置`);
}

if (password) {
  console.log(`${checks.pass} OKX_PASSWORD: ${password.substring(0, 4)}...`);
} else {
  console.log(`${checks.fail} OKX_PASSWORD: 未设置`);
}

console.log(`${isSandbox ? checks.info : checks.info} OKX_SANDBOX: ${isSandbox ? '✓ true (沙盒环境)' : '✗ false/未设置 (生产环境)'}`);

// 2. 检查环境匹配
console.log('\n【2】环境匹配检查：');
if (isSandbox) {
  console.log(`${checks.info} 当前配置为：🧪 沙盒环境 (Demo Trading)`);
  console.log(`${checks.warn} 请确认 API Key 来自：https://www.okx.com/demo-trading`);
  console.log(`   → 路径：右上角账户图标 → Demo API Keys`);
} else {
  console.log(`${checks.info} 当前配置为：🏭 生产环境 (真实交易)`);
  console.log(`${checks.warn} 请确认 API Key 来自：https://www.okx.com`);
  console.log(`   → 路径：个人中心 → API`);
}

// 3. 常见错误说明
console.log('\n【3】常见错误及解决方案：');
console.log(`
${checks.fail} 错误 50101: APIKey does not match current environment
   原因：API Key 与环境不匹配
   解决：
   - 如果使用沙盒 API Key → 设置 OKX_SANDBOX=true
   - 如果使用生产 API Key → 设置 OKX_SANDBOX=false (或删除此变量)

${checks.fail} 错误 50100: API Key 不存在
   原因：API Key 已被删除或输入错误
   解决：重新检查并复制正确的 API Key

${checks.fail} 错误 50103: API Key 权限不足
   原因：API Key 没有交易权限
   解决：在 OKX 后台为 API Key 分配「交易」权限

${checks.fail} 错误 50111: IP 白名单限制
   原因：API Key 设置了 IP 白名单，当前 IP 不在列表中
   解决：在 OKX 后台添加当前服务器 IP，或关闭 IP 白名单
`);

// 4. 下一步操作
console.log('【4】下一步操作：');
const hasAllCredentials = apiKey && secret && password;
if (!hasAllCredentials) {
  console.log(`${checks.fail} 请在 .env.local 中配置完整的 API 凭证`);
  console.log(`   参考：OKX_CONFIG.md 文件中的配置说明\n`);
} else {
  console.log(`${checks.pass} 配置完整，准备测试连接\n`);
  console.log(`${checks.info} 启动应用测试：npm run dev`);
  console.log(`${checks.info} 查看日志输出，确认是否显示正确的环境标识\n`);
}

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// 5. 快速参考
console.log('【快速参考】');
console.log(`
沙盒环境配置示例（.env.local）：
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OKX_API_KEY=your_demo_api_key
OKX_SECRET=your_demo_secret
OKX_PASSWORD=your_demo_passphrase
OKX_SANDBOX=true
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

生产环境配置示例（.env.local）：
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
OKX_API_KEY=your_production_api_key
OKX_SECRET=your_production_secret
OKX_PASSWORD=your_production_passphrase
# OKX_SANDBOX=false (或不设置)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);

console.log('详细文档：查看项目根目录的 OKX_CONFIG.md 文件\n');

