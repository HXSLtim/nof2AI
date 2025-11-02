"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import { Card, Space, Typography } from 'antd';

const { Text, Title } = Typography;

/**
 * 账户总金额行结构
 * @property ts 毫秒时间戳
 * @property total 总金额（USDT）
 */
type EquityRow = { ts: number; total: number };

/**
 * 右侧空白比例（宽度的 10%）
 * @remarks 在保留未来可视区域的同时避免留白过多。
 */
const RIGHT_PAD_RATIO = 0.10;
/**
 * 垂直方向内边距（顶部/底部）
 */
const V_PAD = 8;

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
 * @returns 点列表与辅助缩放信息
 */
function computePoints(
  rows: EquityRow[],
  width: number,
  height: number
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
} {
  if (!rows.length) {
    return {
      points: [],
      leftPad: 0,
      rightPad: Math.floor(width * RIGHT_PAD_RATIO),
      topPad: V_PAD,
      bottomPad: V_PAD,
      stepX: 0,
      min: 0,
      max: 0,
      span: 1,
    };
  }
  const leftPad = 0;
  const rightPad = Math.floor(width * RIGHT_PAD_RATIO);
  const topPad = V_PAD;
  const bottomPad = V_PAD;
  const min = Math.min(...rows.map((r) => r.total));
  const max = Math.max(...rows.map((r) => r.total));
  const span = max - min || 1;
  const n = rows.length;
  const usableW = Math.max(1, width - leftPad - rightPad);
  const usableH = Math.max(1, height - topPad - bottomPad);
  const stepX = usableW / Math.max(1, n - 1);
  const points = rows.map((r, i) => {
    const x = leftPad + i * stepX;
    const y = height - bottomPad - ((r.total - min) / span) * usableH;
    return { x, y, i, row: r };
  });
  return { points, leftPad, rightPad, topPad, bottomPad, stepX, min, max, span };
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
  min: number,
  span: number,
  bottomPad: number
): { above: Array<Array<{ x: number; y: number }>>; below: Array<Array<{ x: number; y: number }>>; baselineY: number } {
  const EPS = 1e-9;
  const baseY = height - bottomPad - ((base - min) / (span || 1)) * (height - bottomPad - V_PAD);

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
    const yPrev = prev.y;
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
 * @remarks 每 3 秒自动刷新一次，与采集调度器默认间隔一致
 */
export default function EquityChart() {
  const [rows, setRows] = useState<EquityRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
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
   * @remarks POLL_MS 兜底为 3000ms（当环境变量缺失或非法时），AbortController 用于避免并发请求堆积。
   */
  const POLL_MS = useMemo(() => {
    const v = Number(process.env.NEXT_PUBLIC_EQUITY_POLL_MS);
    return Number.isFinite(v) && v >= 500 ? v : 3000;
  }, []);
  const abortRef = useRef<AbortController | null>(null);

  /**
   * 拉取数据
   * @returns void
   */
  const load = async () => {
    /**
     * 刷新流程（每 3 秒）：
     * 1) 先触发后端快照 `/api/equity/snapshot`，由服务器请求 OKX 并写入数据库；
     * 2) 再拉取最近 72 小时时间序列 `/api/equity`，追加时间戳参数 `_` 避免缓存。
     * @remarks 使用 AbortController 取消上一轮数据拉取，避免并发堆积；快照失败时仍会继续拉取旧数据以保证页面可用。
     */
    try {
      // 触发后端快照（OKX -> DB），不使用全局 abort，以免影响后续拉取
      try {
        const acSnap = new AbortController();
        await fetch('/api/equity/snapshot', { method: 'POST', signal: acSnap.signal });
      } catch (snapErr) {
        // 快照失败不影响后续拉取，仅记录
        // eslint-disable-next-line no-console
        console.warn('[EquityChart] snapshot failed (will still fetch series)', snapErr);
      }

      // 拉取时间序列
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

  const last = rows.length ? rows[rows.length - 1].total : 0;
  const first = rows.length ? rows[0].total : 0;
  const chgPct = first ? ((last - first) / first) * 100 : 0;

  const width = Math.max(240, Math.floor(boxWidth));
  const height = Math.max(160, Math.floor(boxHeight));
  const computed = useMemo(() => computePoints(rows, width, height), [rows, width, height]);
  const points = useMemo(() => computed.points.map((p) => `${p.x},${p.y}`).join(' '), [computed.points]);

  /**
   * 将鼠标屏幕坐标转换为 SVG 坐标
   * @param svg SVG 根元素
   * @param e 鼠标事件
   * @returns 在当前 viewBox 下的 SVG 坐标
   */
  function getSvgMouseCoords(svg: SVGSVGElement, e: React.MouseEvent<SVGSVGElement>): { x: number; y: number } {
    const pt = svg.createSVGPoint ? svg.createSVGPoint() : ({ x: 0, y: 0, matrixTransform: (m: any) => ({ x: 0, y: 0 }) } as any);
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
   */
  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    if (!svgRef.current || !computed.points.length) return;
    const { x: mxSvg, y: mySvg } = getSvgMouseCoords(svgRef.current, e);
    const effectiveW = width - computed.rightPad;
    const clampX = Math.max(0, Math.min(effectiveW, mxSvg));
    let idx = Math.round(clampX / Math.max(1e-6, computed.stepX));
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

  return (
    <Card
      style={{ background: '#0f1116', border: '1px solid #1a1d26', margin: 0 }}
      /**
       * 通过 styles.body 消除 Card 默认内边距，保证 SVG 左侧贴边。
       */
      styles={{ body: { padding: 0 } }}
      title={<span style={{ color: '#00e676' }}>账户总金额（USDT）</span>}
      extra={<Text style={{ color: chgPct >= 0 ? '#00e676' : '#ef4444' }}>{last.toFixed(2)} USDT（{chgPct >= 0 ? '+' : ''}{chgPct.toFixed(2)}%）</Text>}
    >
      {loading ? (
        <Text style={{ color: '#a1a9b7' }}>正在载入...</Text>
      ) : rows.length === 0 ? (
        <Space direction="vertical">
          <Text style={{ color: '#a1a9b7' }}>暂无数据，可稍后重试</Text>
        </Space>
      ) : (
        <div ref={boxRef} style={{ width: '100%', height: '65vh', position: 'relative' }}>
          <svg
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            style={{ display: 'block', width: '100%', height: '100%' }}
            preserveAspectRatio="none"
            ref={svgRef}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
          >
            {(() => {
              const base = first;
              const { above, below, baselineY } = splitByBaseline(
                computed.points,
                base,
                height,
                computed.min,
                computed.span,
                computed.bottomPad,
              );
              const effectiveW = width - computed.rightPad;
              return (
                <g>
                  {/* 基准线：初始金额 */}
                  <line x1={0} y1={baselineY} x2={effectiveW} y2={baselineY} stroke="#64748b" strokeDasharray="4 2" opacity={0.8} />
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
          <Text style={{ color: '#6b7280', fontSize: 12 }}>最近 72 小时 · 自适应宽高（父容器 65vh） · 每 3 秒刷新</Text>
        </div>
      )}
    </Card>
  );
}