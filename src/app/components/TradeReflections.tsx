'use client';

import { useEffect, useState } from 'react';
import styles from './TradeReflections.module.css';

interface TradeStats {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  breakevenTrades: number;
  winRate: number;
  avgPnl: number;
  totalPnl: number;
  avgHoldingTime: number;
}

interface ReflectionSummary {
  stats: TradeStats;
  topMistakes: string[];
  topInsights: string[];
  recommendations: string[];
}

interface TradeReflection {
  id: number;
  decision_id: string;
  symbol: string;
  action: string;
  outcome: 'profit' | 'loss' | 'breakeven' | 'pending';
  reasoning?: string;
  pnl_amount?: number;
  pnl_percentage?: number;
  holding_time_minutes?: number;
  entry_price?: number;
  exit_price?: number;
  mistakes?: string;
  insights?: string;
  improvement?: string;
  confidence?: number;
  created_at: number;
}

export default function TradeReflections() {
  const [summary, setSummary] = useState<ReflectionSummary | null>(null);
  const [recentReflections, setRecentReflections] = useState<TradeReflection[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDays, setSelectedDays] = useState(7);
  const [selectedSymbol, setSelectedSymbol] = useState<string>('ALL');

  useEffect(() => {
    loadData();
    // 每30秒刷新一次
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [selectedDays, selectedSymbol]);

  async function loadData() {
    try {
      setLoading(true);
      
      // 获取摘要报告
      const symbolParam = selectedSymbol !== 'ALL' ? `&symbol=${selectedSymbol}` : '';
      const summaryRes = await fetch(`/api/reflections?action=summary&days=${selectedDays}${symbolParam}`);
      const summaryData = await summaryRes.json();
      
      if (summaryData.success) {
        setSummary(summaryData.data);
      }
      
      // 获取最近的反思记录
      const reflectionsRes = await fetch(`/api/reflections?limit=10${symbolParam}`);
      const reflectionsData = await reflectionsRes.json();
      
      if (reflectionsData.success) {
        setRecentReflections(reflectionsData.data);
      }
    } catch (error) {
      console.error('加载反思数据失败:', error);
    } finally {
      setLoading(false);
    }
  }

  function formatTime(minutes: number): string {
    if (minutes < 60) return `${minutes}分钟`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}小时${mins}分钟`;
  }

  function getOutcomeLabel(outcome: string): string {
    switch (outcome) {
      case 'profit': return '盈利';
      case 'loss': return '亏损';
      case 'breakeven': return '平衡';
      case 'pending': return '进行中';
      default: return '未知';
    }
  }

  function getOutcomeColor(outcome: string): string {
    switch (outcome) {
      case 'profit': return '#22c55e';
      case 'loss': return '#ef4444';
      case 'breakeven': return '#94a3b8';
      case 'pending': return '#f59e0b';
      default: return '#64748b';
    }
  }

  if (loading && !summary) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>加载中...</div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2>交易反思与学习</h2>
        <div className={styles.filters}>
          <select 
            value={selectedDays} 
            onChange={(e) => setSelectedDays(Number(e.target.value))}
            className={styles.select}
          >
            <option value={1}>过去1天</option>
            <option value={7}>过去7天</option>
            <option value={30}>过去30天</option>
            <option value={90}>过去90天</option>
          </select>
          
          <select 
            value={selectedSymbol} 
            onChange={(e) => setSelectedSymbol(e.target.value)}
            className={styles.select}
          >
            <option value="ALL">所有币种</option>
            <option value="BTC">BTC</option>
            <option value="ETH">ETH</option>
            <option value="SOL">SOL</option>
            <option value="BNB">BNB</option>
            <option value="XRP">XRP</option>
            <option value="DOGE">DOGE</option>
          </select>
        </div>
      </div>

      {summary && (
        <>
          {/* 统计卡片 */}
          <div className={styles.statsGrid}>
            <div className={styles.statCard}>
              <div className={styles.statLabel}>总交易</div>
              <div className={styles.statValue}>{summary.stats.totalTrades}</div>
            </div>
            
            <div className={styles.statCard}>
              <div className={styles.statLabel}>胜率</div>
              <div className={styles.statValue} style={{ 
                color: summary.stats.winRate >= 60 ? '#22c55e' : 
                       summary.stats.winRate >= 50 ? '#f59e0b' : '#ef4444' 
              }}>
                {summary.stats.winRate.toFixed(1)}%
              </div>
              <div className={styles.statSubtext}>
                {summary.stats.winningTrades}胜 / {summary.stats.losingTrades}负
              </div>
            </div>
            
            <div className={styles.statCard}>
              <div className={styles.statLabel}>总盈亏</div>
              <div className={styles.statValue} style={{ 
                color: summary.stats.totalPnl >= 0 ? '#22c55e' : '#ef4444' 
              }}>
                ${summary.stats.totalPnl.toFixed(2)}
              </div>
            </div>
            
            <div className={styles.statCard}>
              <div className={styles.statLabel}>平均盈亏</div>
              <div className={styles.statValue} style={{ 
                color: summary.stats.avgPnl >= 0 ? '#22c55e' : '#ef4444' 
              }}>
                ${summary.stats.avgPnl.toFixed(2)}
              </div>
            </div>
            
            <div className={styles.statCard}>
              <div className={styles.statLabel}>平均持仓</div>
              <div className={styles.statValue}>
                {formatTime(Math.round(summary.stats.avgHoldingTime))}
              </div>
            </div>
          </div>

          {/* 改进建议 */}
          {summary.recommendations.length > 0 && (
            <div className={styles.section}>
              <h3>系统建议</h3>
              <div className={styles.recommendationsList}>
                {summary.recommendations.map((rec, idx) => (
                  <div key={idx} className={styles.recommendationItem}>
                    {rec}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 常见错误 */}
          {summary.topMistakes.length > 0 && (
            <div className={styles.section}>
              <h3>常见错误</h3>
              <div className={styles.list}>
                {summary.topMistakes.map((mistake, idx) => (
                  <div key={idx} className={styles.listItem}>
                    <span className={styles.errorIcon}>X</span>
                    {mistake}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 成功经验 */}
          {summary.topInsights.length > 0 && (
            <div className={styles.section}>
              <h3>成功经验</h3>
              <div className={styles.list}>
                {summary.topInsights.map((insight, idx) => (
                  <div key={idx} className={styles.listItem}>
                    <span className={styles.successIcon}>+</span>
                    {insight}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* 最近交易记录 */}
      <div className={styles.section}>
        <h3>最近交易</h3>
        <div className={styles.reflectionsList}>
          {recentReflections.length === 0 ? (
            <div className={styles.empty}>暂无交易记录</div>
          ) : (
            recentReflections.map((reflection) => (
              <div key={reflection.id} className={styles.reflectionCard}>
                <div className={styles.reflectionHeader}>
                  <div className={styles.reflectionTitle}>
                    <span className={styles.outcomeLabel} style={{ color: getOutcomeColor(reflection.outcome) }}>
                      [{getOutcomeLabel(reflection.outcome)}]
                    </span>
                    <strong>{reflection.symbol}</strong>
                    <span className={styles.action}>{reflection.action}</span>
                  </div>
                  <div className={styles.reflectionDate}>
                    {new Date(reflection.created_at).toLocaleString('zh-CN')}
                  </div>
                </div>

                {reflection.pnl_amount !== undefined && (
                  <div className={styles.pnlInfo}>
                    <span style={{ 
                      color: reflection.pnl_amount >= 0 ? '#22c55e' : '#ef4444',
                      fontWeight: 'bold'
                    }}>
                      ${reflection.pnl_amount.toFixed(2)}
                    </span>
                    {reflection.pnl_percentage !== undefined && (
                      <span style={{ 
                        color: reflection.pnl_percentage >= 0 ? '#22c55e' : '#ef4444',
                        marginLeft: '8px'
                      }}>
                        ({reflection.pnl_percentage > 0 ? '+' : ''}{reflection.pnl_percentage.toFixed(2)}%)
                      </span>
                    )}
                    {reflection.holding_time_minutes !== undefined && (
                      <span className={styles.holdingTime}>
                        持仓 {formatTime(reflection.holding_time_minutes)}
                      </span>
                    )}
                  </div>
                )}

                {reflection.reasoning && (
                  <div className={styles.reasoning}>
                    <strong>决策理由：</strong>
                    <p>{reflection.reasoning}</p>
                  </div>
                )}

                {reflection.mistakes && reflection.mistakes !== '无明显错误' && (
                  <div className={styles.mistakes}>
                    <strong>错误分析：</strong>
                    <p>{reflection.mistakes}</p>
                  </div>
                )}

                {reflection.insights && reflection.insights !== '常规交易' && (
                  <div className={styles.insights}>
                    <strong>经验总结：</strong>
                    <p>{reflection.insights}</p>
                  </div>
                )}

                {reflection.improvement && reflection.improvement !== '继续保持' && (
                  <div className={styles.improvement}>
                    <strong>改进方向：</strong>
                    <p>{reflection.improvement}</p>
                  </div>
                )}

                {reflection.confidence && (
                  <div className={styles.confidence}>
                    置信度: {reflection.confidence}%
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

