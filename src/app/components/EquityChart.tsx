"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import { Card, Space, Typography } from 'antd';
import { useAccount, usePrices } from '@/contexts/DataContext';

const { Text } = Typography;

/**
 * 账户总金额行结构
 * @property ts 毫秒时间戳
 * @property total 总金额（USDT）
 */
type EquityRow = { ts: number; total: number };

/**
 * 左右两侧空白比例
 * @remarks 左侧无空白，右侧保留10%空白，曲线从最左边开始
 */
const LEFT_PAD_RATIO = 0.0;
const RIGHT_PAD_RATIO = 0.10;
/**
 * 垂直方向内边距（顶部/底部），增加空间以便自动缩放
 * @remarks 增大内边距，确保曲线不会触及边界
 */
const V_PAD = 30;

/**
 * 归一化为 SVG 折线点串
 * @param rows 账户总金额时间序列（升序）
 * @param width 画布宽度
 * @param height 画布高度
 * @returns 可直接用于 `polyline` 的点串，如 "x,y x,y ..."
 */
/**
 * 计算折线点坐标（左侧贴边、右侧保留 15% 空白）
 * @param rows 升序时间序列
 * @param width 画布宽度（视图坐标）
 * @param height 画布高度（视图坐标）
 * @param scaleMode Y轴缩放模式
 * @returns 点列表与辅助缩放信息
 */
function computePoints(
  rows: EquityRow[],
  width: number,
  height: number,
  scaleMode: 'smart' | 'full' | 'tight' = 'smart'
): {
  points: { x: number; y: number; i: number; row: EquityRow }[];
  leftPad: number;
  rightPad: number;
  topPad: number;
  bottomPad: number;
  stepX: number;
  min: number;
  max: number;
  span: number;
  baselineValue: number; // 基准值（初始金额）
  visualMin: number; // 可视化使用的最小值（考虑居中后）
  visualMax: number; // 可视化使用的最大值（考虑居中后）
} {
  if (!rows.length) {
    return {
      points: [],
      leftPad: Math.floor(width * LEFT_PAD_RATIO),
      rightPad: Math.floor(width * RIGHT_PAD_RATIO),
      topPad: V_PAD,
      bottomPad: V_PAD,
      stepX: 0,
      min: 0,
      max: 0,
      span: 1,
      baselineValue: 0,
      visualMin: 0,
      visualMax: 1,
    };
  }
  
  const leftPad = Math.floor(width * LEFT_PAD_RATIO);
  const rightPad = Math.floor(width * RIGHT_PAD_RATIO);
  const topPad = V_PAD;
  const bottomPad = V_PAD;
  
  // 实际数据范围
  const dataMin = Math.min(...rows.map((r) => r.total));
  const dataMax = Math.max(...rows.map((r) => r.total));
  const baseline = rows[0].total; // 初始金额作为基准
  const dataSpan = dataMax - dataMin || 1;
  
  // 🎯 Y轴缩放：让曲线清晰可见，基准线在合理位置
  let visualMin: number;
  let visualMax: number;
  
  if (scaleMode === 'tight') {
    // 紧凑模式：数据 + 10%留白
    const margin = dataSpan * 0.1;
    visualMin = dataMin - margin;
    visualMax = dataMax + margin;
  } else if (scaleMode === 'full') {
    // 完整模式：以基准线为中心，对称扩展
    const maxDist = Math.max(Math.abs(dataMax - baseline), Math.abs(baseline - dataMin));
    visualMin = baseline - maxDist * 2;
    visualMax = baseline + maxDist * 2;
  } else {
    // 智能模式：数据占画布的50-60%，留白适中
    const margin = dataSpan * 0.6; // 上下各留60%的数据范围
    
    visualMin = dataMin - margin;
    visualMax = dataMax + margin;
    
    // 确保基准线在画布的40-60%区域（中间偏下）
    const tempSpan = visualMax - visualMin;
    const baselinePos = (baseline - visualMin) / tempSpan;
    
    if (baselinePos < 0.35) {
      // 基准线太靠下，向下扩展可视范围
      const extraSpace = (0.45 - baselinePos) * tempSpan;
      visualMin = visualMin - extraSpace;
    } else if (baselinePos > 0.65) {
      // 基准线太靠上，向上扩展可视范围  
      const extraSpace = (baselinePos - 0.55) * tempSpan;
      visualMax = visualMax + extraSpace;
    }
  }
  
  const visualSpan = visualMax - visualMin || 1;
  
  // 调试信息 - 使用字符串输出，避免对象折叠
  if (typeof window !== 'undefined' && rows.length > 0) {
    const volatility = dataSpan / baseline;
    const baselinePosition = ((baseline - visualMin) / visualSpan * 100).toFixed(1);
    const dataOccupancy = (dataSpan / visualSpan * 100).toFixed(1);
    
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`[EquityChart] Y轴缩放模式: ${scaleMode}`);
    console.log(`  初始金额（基准线）: ${baseline.toFixed(2)} USDT`);
    console.log(`  最低点: ${dataMin.toFixed(2)} USDT`);
    console.log(`  最高点: ${dataMax.toFixed(2)} USDT`);
    console.log(`  数据跨度: ${dataSpan.toFixed(2)} USDT`);
    console.log(`  波动率: ${(volatility * 100).toFixed(2)}%`);
    console.log(`  ─────────────────────────────────────`);
    console.log(`  可视范围: ${visualMin.toFixed(2)} → ${visualMax.toFixed(2)}`);
    console.log(`  可视跨度: ${visualSpan.toFixed(2)} USDT`);
    console.log(`  基准线位置: ${baselinePosition}% ${Number(baselinePosition) >= 30 && Number(baselinePosition) <= 70 ? '✅' : '❌ 不在理想范围(30-70%)'}`);
    console.log(`  数据占画布: ${dataOccupancy}% ${Number(dataOccupancy) >= 40 && Number(dataOccupancy) <= 70 ? '✅' : Number(dataOccupancy) < 40 ? '⚠️ 太空(建议40-70%)' : '⚠️ 太满'}`);
    console.log(`  基准线可见: ${baseline >= visualMin && baseline <= visualMax ? '✅ 是' : '❌ 否'}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  }
  
  const n = rows.length;
  const usableW = Math.max(1, width - leftPad - rightPad);
  const usableH = Math.max(1, height - topPad - bottomPad);
  const stepX = usableW / Math.max(1, n - 1);
  
  // 映射到 SVG 坐标（使用对称的可视化范围）
  const points = rows.map((r, i) => {
    const x = leftPad + i * stepX;
    const y = height - bottomPad - ((r.total - visualMin) / visualSpan) * usableH;
    return { x, y, i, row: r };
  });
  
  return { 
    points, 
    leftPad, 
    rightPad, 
    topPad, 
    bottomPad, 
    stepX, 
    min: dataMin, 
    max: dataMax, 
    span: dataMax - dataMin,
    baselineValue: baseline,
    visualMin,
    visualMax,
  };
}

/**
 * 将折线按“相对初始金额”的上下位置分段，以上为绿色、以下为红色。
 * @param pts 计算后的点（含坐标与原始值）
 * @param base 初始金额（基准值）
 * @returns 上/下两组分段，每段是一个点数组
 */
function splitByBaseline(
  pts: { x: number; y: number; i: number; row: EquityRow }[],
  base: number,
  height: number,
  visualMin: number,
  visualSpan: number,
  bottomPad: number,
  topPad: number
): { above: Array<Array<{ x: number; y: number }>>; below: Array<Array<{ x: number; y: number }>>; baselineY: number } {
  const EPS = 1e-9;
  // 使用可视化范围计算基准线的 Y 坐标
  // 可用高度 = 总高度 - 顶部padding - 底部padding
  const usableH = height - topPad - bottomPad;
  const baseY = height - bottomPad - ((base - visualMin) / (visualSpan || 1)) * usableH;

  const above: Array<Array<{ x: number; y: number }>> = [];
  const below: Array<Array<{ x: number; y: number }>> = [];

  const pushPoint = (list: Array<Array<{ x: number; y: number }>>, pt: { x: number; y: number }) => {
    if (list.length === 0) list.push([pt]);
    else list[list.length - 1].push(pt);
  };

  for (let i = 0; i < pts.length; i++) {
    const cur = pts[i];
    const vCur = cur.row.total;
    const yCur = cur.y;
    const isAboveCur = vCur - base > EPS;
    const isBelowCur = base - vCur > EPS;

    if (i === 0) {
      const firstPoint = { x: cur.x, y: yCur };
      if (isAboveCur) above.push([firstPoint]);
      else if (isBelowCur) below.push([firstPoint]);
      // 等于基线则不归入任何颜色段（仅显示基线）
      continue;
    }

    const prev = pts[i - 1];
    const vPrev = prev.row.total;
    const isAbovePrev = vPrev - base > EPS;
    const isBelowPrev = base - vPrev > EPS;

    // 若当前与上一个在同一侧，直接追加
    if (isAboveCur && isAbovePrev) {
      pushPoint(above, { x: cur.x, y: yCur });
      continue;
    }
    if (isBelowCur && isBelowPrev) {
      pushPoint(below, { x: cur.x, y: yCur });
      continue;
    }

    // 发生跨越：计算与基线的交点，分割为两段
    if ((isAbovePrev && isBelowCur) || (isBelowPrev && isAboveCur)) {
      const t = (base - vPrev) / (vCur - vPrev);
      const xi = prev.x + t * (cur.x - prev.x);
      const yi = baseY; // 线性映射下，值为 base 的 y 即基线 y

      // 将交点分别追加到对应的末尾与起始
      if (isAbovePrev) {
        pushPoint(above, { x: xi, y: yi });
        below.push([{ x: xi, y: yi }, { x: cur.x, y: yCur }]);
      } else if (isBelowPrev) {
        pushPoint(below, { x: xi, y: yi });
        above.push([{ x: xi, y: yi }, { x: cur.x, y: yCur }]);
      }
      continue;
    }

    // 若某一点恰好在基线上，则将交点只加入另一侧段的起点
    if (!isAboveCur && !isBelowCur) {
      if (isAbovePrev) pushPoint(above, { x: cur.x, y: baseY });
      if (isBelowPrev) pushPoint(below, { x: cur.x, y: baseY });
      continue;
    }
    if (!isAbovePrev && !isBelowPrev) {
      if (isAboveCur) above.push([{ x: cur.x, y: baseY }]);
      if (isBelowCur) below.push([{ x: cur.x, y: baseY }]);
      continue;
    }
  }

  return { above, below, baselineY: baseY };
}

/**
 * 格式化时间戳（本地时区）
 * @param ts 毫秒时间戳
 * @returns 形如 `YYYY-MM-DD HH:mm:ss`
 */
function formatTs(ts: number): string {
  const d = new Date(ts);
  const pad2 = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

/**
 * 账户总金额折线卡片
 * @description 从 `/api/equity` 拉取账户总金额时间序列，并以简单 SVG 折线展示
 * @remarks 
 * - 曲线历史数据：每1分钟更新一次（减少数据库负载）
 * - 当前总金额和币种价格：每3秒更新一次（与仓位同步，实时感更强）
 */
export default function EquityChart() {
  // 使用DataContext的实时数据
  const { account } = useAccount();
  const { prices } = usePrices();
  
  const [rows, setRows] = useState<EquityRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  /** 当前账户总金额（从DataContext获取，实时更新） */
  const currentTotal = Number(account.totalEq || 0);
  /** Y轴自动缩放模式 */
  const [autoScale, setAutoScale] = useState<'smart' | 'full' | 'tight'>("smart");
  /**
   * 容器宽度（自适应）
   * @remarks 使用 ResizeObserver 观测父容器尺寸变化，SVG 宽度随之调整，避免出现横向滚动条。
   */
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [boxWidth, setBoxWidth] = useState<number>(320);
  /**
   * 容器高度（自适应）
   * @remarks 通过 ResizeObserver 观测父容器高度，以同步 SVG 高度。
   */
  const [boxHeight, setBoxHeight] = useState<number>(240);
  /**
   * 悬停信息（用于显示提示与十字线）
   */
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hover, setHover] = useState<null | { x: number; y: number; idx: number; row: EquityRow; mx: number; my: number }>(null);

  /**
   * 轮询与请求控制
   * @remarks POLL_MS 默认60000ms（1分钟），与后端采集频率同步。可通过环境变量NEXT_PUBLIC_EQUITY_POLL_MS覆盖。
   */
  const POLL_MS = useMemo(() => {
    const v = Number(process.env.NEXT_PUBLIC_EQUITY_POLL_MS);
    return Number.isFinite(v) && v >= 500 ? v : 60000; // ✅ 改为1分钟
  }, []);
  const abortRef = useRef<AbortController | null>(null);

  /**
   * 拉取数据
   * @returns void
   */
  const load = async () => {
    /**
     * 刷新流程（每 1 分钟）：
     * 从数据库读取最近 72 小时的总资产时间序列并更新图表
     * @remarks 后端scheduler负责采集OKX数据，前端只负责显示数据库中的数据
     */
    try {
      // 拉取时间序列（仅读取数据库，不触发OKX API调用）
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      const url = `/api/equity?hours=72&_=${Date.now()}`;
      const res = await fetch(url, { cache: 'no-store', signal: ac.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'failed');
      setRows(Array.isArray(json.data) ? json.data : []);
    } catch (e: any) {
      if (e?.name === 'AbortError') return; // 正常中断，不作错误提示
      // 控制台日志仅用于开发；生产环境可接入监控
      console.error('[EquityChart] load failed', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    /**
     * 初始化立即拉取，并按 POLL_MS 间隔轮询。
     * @remarks 使用可见性监听在标签页隐藏时减轻请求压力（仍保持定时器，但可根据需要拓展为暂停）。
     */
    let timer: any;
    load();
    timer = setInterval(load, POLL_MS);
    return () => {
      timer && clearInterval(timer);
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * 监听容器宽度变化
   * @returns void
   */
  useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = entry.contentRect.width;
        const h = entry.contentRect.height;
        if (w && Math.abs(w - boxWidth) > 1) setBoxWidth(w);
        if (h && Math.abs(h - boxHeight) > 1) setBoxHeight(h);
      }
    });
    ro.observe(el);
    // 初始化设置一次宽高
    setBoxWidth(el.clientWidth || boxWidth);
    setBoxHeight(el.clientHeight || boxHeight);
    return () => ro.disconnect();
    // 仅在挂载时注册观察器
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 使用实时总金额（如果有的话），否则使用曲线最后一个点
  const last = currentTotal > 0 ? currentTotal : (rows.length ? rows[rows.length - 1].total : 0);
  const first = rows.length ? rows[0].total : 0;
  const chgPct = first ? ((last - first) / first) * 100 : 0;

  const width = Math.max(240, Math.floor(boxWidth));
  const height = Math.max(160, Math.floor(boxHeight));
  
    
  const computed = useMemo(() => computePoints(rows, width, height, autoScale), [rows, width, height, autoScale]);

  /**
   * 将鼠标屏幕坐标转换为 SVG 坐标
   * @param svg SVG 根元素
   * @param e 鼠标事件
   * @returns 在当前 viewBox 下的 SVG 坐标
   */
  function getSvgMouseCoords(svg: SVGSVGElement, e: React.MouseEvent<SVGSVGElement>): { x: number; y: number } {
    const pt = svg.createSVGPoint ? svg.createSVGPoint() : ({ x: 0, y: 0, matrixTransform: () => ({ x: 0, y: 0 }) } as any);
    (pt as any).x = e.clientX;
    (pt as any).y = e.clientY;
    const ctm = svg.getScreenCTM?.();
    if (!ctm || !('inverse' in ctm)) {
      const rect = svg.getBoundingClientRect();
      return { x: ((e.clientX - rect.left) / rect.width) * width, y: ((e.clientY - rect.top) / rect.height) * height };
    }
    const inv = (ctm as any).inverse();
    const p = (pt as any).matrixTransform(inv);
    return { x: p.x, y: p.y };
  }

  /**
   * 鼠标移动时根据位置推断最近的数据点
   * @param e 鼠标事件
   * @remarks 考虑左右padding，在有效区域内计算最近点
   */
  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!svgRef.current || !computed.points.length) return;
    const { x: mxSvg } = getSvgMouseCoords(svgRef.current, e);
    // 有效区域：从 leftPad 到 width - rightPad
    const effectiveStartX = computed.leftPad;
    const effectiveEndX = width - computed.rightPad;
    // 将鼠标X坐标限制在有效区域内
    const clampX = Math.max(effectiveStartX, Math.min(effectiveEndX, mxSvg));
    // 计算相对于有效区域起点的偏移
    const relativeX = clampX - effectiveStartX;
    let idx = Math.round(relativeX / Math.max(1e-6, computed.stepX));
    idx = Math.max(0, Math.min(rows.length - 1, idx));
    const p = computed.points[idx];
    // 十字线与 tooltip 均锚定最近数据点，避免可视偏移
    setHover({ x: p.x, y: p.y, idx, row: p.row, mx: p.x, my: p.y });
  }

  /**
   * 鼠标移出时隐藏悬停提示
   */
  function handleMouseLeave() {
    setHover(null);
  }

  /**
   * 🔥 使用DataContext的实时数据更新曲线
   * @remarks 
   * - 账户总金额：从DataContext自动获取（WebSocket或3秒轮询）
   * - 币种价格：从DataContext自动获取（WebSocket或3秒轮询）
   * - 无需独立的API调用，数据由DataService统一管理
   * - 实时性：WebSocket推送 < 100ms，比之前的3秒轮询快30倍
   */
  useEffect(() => {
    if (currentTotal > 0) {
      const timestamp = Date.now();
      console.log(`[EquityChart] 🔄 总金额更新: $${currentTotal.toFixed(2)} (从DataContext)`);
      
      // 实时更新曲线：更新或添加最新的点
      setRows(prevRows => {
        if (prevRows.length === 0) {
          // 如果没有历史数据，创建第一个点
          return [{ ts: timestamp, total: currentTotal }];
        }
        
        const lastRow = prevRows[prevRows.length - 1];
        const timeDiff = timestamp - lastRow.ts;
        
        // 如果最后一个点是30秒内的，更新它
        if (timeDiff < 30000) {
          const newRows = [...prevRows];
          newRows[newRows.length - 1] = { ts: timestamp, total: currentTotal };
          return newRows;
        }
        
        // 如果超过30秒，添加新点
        return [...prevRows, { ts: timestamp, total: currentTotal }];
      });
    }
  }, [currentTotal]);

  // 🔍 监听prices变化（从DataContext）
  useEffect(() => {
    if (Object.keys(prices).length > 0) {
      const priceCount = Object.keys(prices).length;
      const priceDetails = Object.entries(prices).map(([id, price]) => {
        const coin = id.split('-')[0];
        return `${coin}=$${Number(price).toFixed(2)}`;
      }).join(', ');
      
      console.log(`[EquityChart] 📊 价格更新 (${priceCount}个，从DataContext): ${priceDetails}`);
    }
  }, [prices]);

  return (
    <Card
      style={{ background: '#0f1116', border: '1px solid #1a1d26', margin: 0, height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}
      /**
       * 通过 styles.body 消除 Card 默认内边距，保证 SVG 左侧贴边。
       * @remarks 使 body 使用 flex: 1 填满剩余空间
       */
      styles={{ 
        header: { flexShrink: 0, borderBottom: '1px solid #1a1d26' },
        body: { padding: 0, flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' } 
      }}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ color: '#00e676' }}>账户总金额（USDT）</span>
          <div style={{ 
            display: 'flex', 
            gap: 4, 
            padding: '2px 4px', 
            background: '#1a1d26', 
            borderRadius: 4,
            fontSize: 11
          }}>
            <button
              onClick={() => setAutoScale('tight')}
              style={{
                padding: '2px 8px',
                border: 'none',
                background: autoScale === 'tight' ? '#00e676' : 'transparent',
                color: autoScale === 'tight' ? '#000' : '#64748b',
                borderRadius: 3,
                cursor: 'pointer',
                fontSize: 11,
                fontWeight: 500
              }}
              title="紧凑模式：数据占满画布，留白最小"
            >
              紧凑
            </button>
            <button
              onClick={() => setAutoScale('smart')}
              style={{
                padding: '2px 8px',
                border: 'none',
                background: autoScale === 'smart' ? '#00e676' : 'transparent',
                color: autoScale === 'smart' ? '#000' : '#64748b',
                borderRadius: 3,
                cursor: 'pointer',
                fontSize: 11,
                fontWeight: 500
              }}
              title="智能模式：基准线居中，清晰显示初始金额和最高/最低点"
            >
              智能
            </button>
            <button
              onClick={() => setAutoScale('full')}
              style={{
                padding: '2px 8px',
                border: 'none',
                background: autoScale === 'full' ? '#00e676' : 'transparent',
                color: autoScale === 'full' ? '#000' : '#64748b',
                borderRadius: 3,
                cursor: 'pointer',
                fontSize: 11,
                fontWeight: 500
              }}
              title="完整模式：以初始金额为中心对称显示"
            >
              完整
            </button>
          </div>
        </div>
      }
      extra={
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', maxWidth: '100%' }}>
          <Text style={{ color: chgPct >= 0 ? '#00e676' : '#ef4444', whiteSpace: 'nowrap' }}>
            {last.toFixed(2)} USDT（{chgPct >= 0 ? '+' : ''}{chgPct.toFixed(2)}%）
          </Text>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 8, 
            color: '#a1a9b7',
            flexWrap: 'wrap',
            fontSize: 12,
            flex: 1,
            justifyContent: 'flex-end'
          }}>
            {Object.entries(prices).length === 0 ? (
              <Text style={{ color: '#a1a9b7', fontSize: 12 }}>加载价格...</Text>
            ) : (
              Object.entries(prices).map(([instId, price]) => {
                const coin = instId.split('-')[0];
                const val = Number(price);
                return (
                  <span 
                    key={instId} 
                    style={{ 
                      color: '#a1a9b7', 
                      whiteSpace: 'nowrap',
                      fontSize: 12,
                      padding: '2px 6px',
                      background: '#1a1d26',
                      borderRadius: 4
                    }}
                  >
                    {coin} ${Number.isFinite(val) ? val.toLocaleString('en-US', { maximumFractionDigits: 2 }) : '-'}
                  </span>
                );
              })
            )}
          </div>
        </div>
      }
    >
      {loading ? (
        <div style={{ padding: 24 }}>
          <Text style={{ color: '#a1a9b7' }}>正在载入...</Text>
        </div>
      ) : rows.length === 0 ? (
        <div style={{ padding: 24 }}>
          <Space direction="vertical">
            <Text style={{ color: '#a1a9b7' }}>暂无数据，可稍后重试</Text>
          </Space>
        </div>
      ) : (
        <div ref={boxRef} style={{ width: '100%', flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden' }}>
          <svg
            viewBox={`0 0 ${width} ${height}`}
            style={{ display: 'block', width: '100%', height: '100%' }}
            preserveAspectRatio="xMidYMid meet"
            ref={svgRef}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
          >
            {(() => {
              const base = computed.baselineValue;
              const visualSpan = computed.visualMax - computed.visualMin;
              const { above, below, baselineY } = splitByBaseline(
                computed.points,
                base,
                height,
                computed.visualMin,
                visualSpan,
                computed.bottomPad,
                computed.topPad,
              );
              const effectiveStartX = computed.leftPad;
              const effectiveEndX = width - computed.rightPad;
              
                
              return (
                <g>
                  {/* 基准线：初始金额 - 简洁灰色风格 */}
                  <line
                    x1={effectiveStartX}
                    y1={baselineY}
                    x2={effectiveEndX}
                    y2={baselineY}
                    stroke="#6b7280"
                    strokeWidth={1.5}
                    strokeDasharray="8 4"
                    opacity={0.6}
                  />
                  {/* 绿色段：高于初始金额 */}
                  {above.map((seg, i) => (
                    <polyline key={`a-${i}`} points={seg.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#00e676" strokeWidth={2} vectorEffect="non-scaling-stroke" />
                  ))}
                  {/* 红色段：低于初始金额 */}
                  {below.map((seg, i) => (
                    <polyline key={`b-${i}`} points={seg.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#ef4444" strokeWidth={2} vectorEffect="non-scaling-stroke" />
                  ))}
                </g>
              );
            })()}
            /**
             * 取消鼠标滑过显示的圆球，仅保留纵向十字线。
             * @remarks 用户需求：去除折线上的 hover 圆点，以简化视觉。
             */
            {hover && (
              <g>
                <line x1={hover.x} y1={V_PAD} x2={hover.x} y2={height - V_PAD} stroke="#3b82f6" strokeDasharray="4 2" opacity={0.7} />
              </g>
            )}
          </svg>
          {hover && (
            <div
              style={{
                position: 'absolute',
                left: `${Math.min(hover.x + 10, width - 160) / width * 100}%`,
                top: `${Math.max(hover.y - 60, 0) / height * 100}%`,
                background: '#0b0d13',
                border: '1px solid #1a1d26',
                borderRadius: 6,
                color: '#e5e7eb',
                fontSize: 12,
                padding: '8px 10px',
                pointerEvents: 'none',
                boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
                maxWidth: 180,
              }}
            >
              <div>时间：{formatTs(hover.row.ts)}</div>
              <div>总金额：{hover.row.total.toFixed(2)} USDT</div>
              {hover.idx > 0 && (
                <div>
                  涨跌：{
                    (((hover.row.total - computed.points[hover.idx - 1].row.total) /
                      computed.points[hover.idx - 1].row.total) * 100
                    ).toFixed(2)
                  }%
                </div>
              )}
            </div>
          )}
          <div style={{ position: 'absolute', bottom: 8, left: 8 }}>
            <Text style={{ color: '#6b7280', fontSize: 12 }}>
              最近 72 小时 · 🔴 实时数据（每3秒更新）
            </Text>
          </div>
        </div>
      )}
    </Card>
  );
}