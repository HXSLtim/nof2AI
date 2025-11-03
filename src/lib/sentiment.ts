/**
 * 加密货币情绪指标模块
 * 
 * 使用 CryptoOracle API 获取市场情绪数据
 */

const API_URL = process.env.CRYPTO_ORACLE_API_URL || "https://service.cryptoracle.network/openapi/v2/endpoint";
const API_KEY = process.env.CRYPTO_ORACLE_API_KEY || "7ad48a56-8730-4238-a714-eebc30834e3e";

if (!process.env.CRYPTO_ORACLE_API_KEY) {
  console.warn('[Sentiment] ⚠️ 使用默认的 CryptoOracle API Key，建议在环境变量中配置 CRYPTO_ORACLE_API_KEY');
}

/**
 * 情绪指标结果
 */
export interface SentimentIndicators {
  positiveRatio: number;      // 积极情绪比例
  negativeRatio: number;      // 消极情绪比例
  netSentiment: number;       // 净情绪（积极-消极）
  dataTime: string;           // 数据时间
  dataDelayMinutes: number;   // 数据延迟（分钟）
}

/**
 * 获取情绪指标（简洁版本）
 * @param token 币种符号（如 'BTC'）
 * @returns 情绪指标数据，失败返回 null
 */
export async function getSentimentIndicators(token: string = 'BTC'): Promise<SentimentIndicators | null> {
  try {
    // 获取最近4小时数据
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - 4 * 3600 * 1000);

    const formatDateTime = (date: Date): string => {
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
    };

    const requestBody = {
      apiKey: API_KEY,
      endpoints: ["CO-A-02-01", "CO-A-02-02"],  // 核心指标
      startTime: formatDateTime(startTime),
      endTime: formatDateTime(endTime),
      timeType: "15m",
      token: [token]
    };

    const headers = {
      "Content-Type": "application/json",
      "X-API-KEY": API_KEY
    };

    console.log(`[Sentiment] 请求情绪数据: ${token}, ${requestBody.startTime} - ${requestBody.endTime}`);

    const response = await fetch(API_URL, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody)
    });

    if (response.status === 200) {
      const data = await response.json();
      
      if (data?.code === 200 && data?.data) {
        const timePeriods = data.data[0]?.timePeriods || [];
        
        // 查找第一个有有效数据的时间段
        for (const period of timePeriods) {
          const periodData = period?.data || [];
          const sentiment: Record<string, number> = {};
          let validDataFound = false;

          for (const item of periodData) {
            const endpoint = item?.endpoint;
            const value = String(item?.value || '').trim();
            
            if (value) {  // 只处理非空值
              try {
                if (endpoint === "CO-A-02-01" || endpoint === "CO-A-02-02") {
                  sentiment[endpoint] = parseFloat(value);
                  validDataFound = true;
                }
              } catch {
                continue;
              }
            }
          }

          // 如果找到有效数据
          if (validDataFound && sentiment['CO-A-02-01'] !== undefined && sentiment['CO-A-02-02'] !== undefined) {
            const positive = sentiment['CO-A-02-01'];
            const negative = sentiment['CO-A-02-02'];
            const netSentiment = positive - negative;

            // 计算数据延迟
            const dataTime = new Date(period.startTime);
            const dataDelayMinutes = Math.floor((Date.now() - dataTime.getTime()) / 60000);

            console.log(`✅ [Sentiment] 使用情绪数据时间: ${period.startTime} (延迟: ${dataDelayMinutes}分钟)`);

            return {
              positiveRatio: positive,
              negativeRatio: negative,
              netSentiment,
              dataTime: period.startTime,
              dataDelayMinutes
            };
          }
        }

        console.log('❌ [Sentiment] 所有时间段数据都为空');
        return null;
      }
    }

    console.log(`❌ [Sentiment] API响应失败: ${response.status}`);
    return null;

  } catch (error) {
    console.error('[Sentiment] 情绪指标获取失败:', error);
    return null;
  }
}

/**
 * 格式化情绪指标为提示词文本
 */
export function formatSentimentForPrompt(sentiment: SentimentIndicators | null): string {
  if (!sentiment) {
    return 'Sentiment Indicators: Not available';
  }

  return `
SENTIMENT INDICATORS (BTC)
Data Time: ${sentiment.dataTime} (Delay: ${sentiment.dataDelayMinutes} minutes)
Positive Sentiment Ratio: ${sentiment.positiveRatio.toFixed(4)}
Negative Sentiment Ratio: ${sentiment.negativeRatio.toFixed(4)}
Net Sentiment: ${sentiment.netSentiment.toFixed(4)} ${sentiment.netSentiment > 0 ? '(Bullish)' : sentiment.netSentiment < 0 ? '(Bearish)' : '(Neutral)'}
  `.trim();
}

