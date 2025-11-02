"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import { Card, Typography, Button, Space, Radio } from 'antd';
import { ReloadOutlined, LineChartOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

/**
 * 账户总金额曲线图（SVG 简易实现）
 * - 数据来源：`/api/equity`（SQLite）
 * - 支持手动刷新与记录一次快照
 * - 支持鼠标/触摸悬停查看「时间与金额」信息（十字准线 + 浮层）
 * - 图表高度：SVG 使用 `height: '100%'`，随父容器高度自适应
 *   （父容器需具有明确高度，否则百分比高度将无效）。
 */
/**
 * 金额曲线组件
 *
 * 功能概述：
 * - 支持两种显示模式：
 *   1) 总金额（absolute total）
 *   2) 盈亏（相对初始金额的差值）
 * - Y 轴为动态缩放：根据当前模式下数据的最小/最大值自适应，
 *   并自动添加少量边距以避免贴边。
 * - 支持鼠标/触摸悬停显示十字准线与信息浮层。
 */
export default function EquityChart() {
  const [rows, setRows] = useState<Array<{ ts: number; total: number }>>([]);
  const [loading, setLoading] = useState(false);
  /** SVG 引用，用于从像素坐标换算到 viewBox 用户坐标 */
  const svgRef = useRef<SVGSVGElement | null>(null);
  /** 当前悬停点索引（最近数据点） */
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  /** 悬停浮层的像素位置（相对于 SVG 容器） */
  const [tooltipPos, setTooltipPos] = useState<{ left: number; top: number } | null>(null);
  /** 显示模式：total（总金额）| pnl（盈亏差值） */
  const [mode, setMode] = useState<'total' | 'pnl'>('total');

  /** 拉取时间序列 */
  const pull = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/equity?hours=168'); // 最近 7 天
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json?.error || 'fetch equity failed');
      setRows(json.data || []);
    } finally {
      setLoading(false);
    }
  };

  /** 记录一次快照 */
  const snapshot = async () => {
    const res = await fetch('/api/equity/snapshot', { method: 'POST' });
    const json = await res.json();
    if (res.ok && json.success) {
      await pull();
    } else {
      console.error(json?.error || 'snapshot failed');
    }
  };

  useEffect(() => {
    pull();
    // 前端自动记录开关（默认关闭，改用服务端调度器）
    const clientAuto = process.env.NEXT_PUBLIC_EQUITY_CLIENT_AUTO === 'true';
    /**
     * 前端自动采集间隔（毫秒）
     * @remarks 默认 3000ms；可通过 `NEXT_PUBLIC_EQUITY_CLIENT_MS` 覆盖，仅在前端自动开启时生效
     */
    const clientMs = Number(process.env.NEXT_PUBLIC_EQUITY_CLIENT_MS || 3000);
    /**
     * 前端自动刷新曲线数据的轮询间隔（毫秒）
     * @remarks 默认 3000ms；可通过 `NEXT_PUBLIC_EQUITY_CLIENT_REFRESH_MS` 覆盖
     */
    const refreshMs = Number(process.env.NEXT_PUBLIC_EQUITY_CLIENT_REFRESH_MS || 3000);
    let id: any;
    let refreshId: any;
    if (clientAuto) {
      id = setInterval(() => {
        snapshot().catch(() => {});
      }, clientMs);
    }
    // 始终开启数据刷新轮询：从服务端读取最新时间序列
    refreshId = setInterval(() => {
      pull().catch(() => {});
    }, refreshMs);
    return () => {
      id && clearInterval(id);
      refreshId && clearInterval(refreshId);
    };
  }, []);

  // 坐标系常量（viewBox 尺寸与留白）
  const W = 720;
  const H = 320; // 拉高整体高度，提升可视空间
  const padding = 36;

  /**
   * 计算坐标系与点位（根据显示模式动态缩放 Y 轴）
   * 并将折线按“相对基线的上下”进行分段着色（绿色/红色）。
   *
   * 算法说明：
   * - 以 `mode==='total' ? base : 0` 为数值基线；将其映射到 `yBase`。
   * - 遍历相邻点，若两点在同侧则直接连线；若不同侧则在 `y=yBase` 上求交点，分段后分别加入对应颜色路径。
   */
  const { abovePath, belowPath, minY, maxY, start, end, points, base, yZero, yBase } = useMemo(() => {
    if (!rows.length) {
      return {
        abovePath: '', belowPath: '', minY: 0, maxY: 0, start: 0, end: 0,
        points: [] as Array<{ x: number; y: number; ts: number; total: number; pnl: number; val: number }>,
        base: 0, yZero: 0, yBase: 0
      };
    }
    const xs = rows.map((r) => r.ts);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const base = rows[0].total;
    const values = mode === 'total' ? rows.map((r) => r.total) : rows.map((r) => r.total - base);
    const minYRaw = Math.min(...values);
    const maxYRaw = Math.max(...values);
    const span = Math.max(1, maxYRaw - minYRaw);
    const pad = Math.max(1, span * 0.05);
    const minY = minYRaw - pad;
    const maxY = maxYRaw + pad;
    const dx = Math.max(1, maxX - minX);
    const dy = Math.max(1, maxY - minY);
    const toX = (x: number) => padding + ((x - minX) / dx) * (W - padding * 2);
    const toY = (val: number) => H - padding - ((val - minY) / dy) * (H - padding * 2);
    const pts = rows.map((r) => {
      const pnl = r.total - base;
      const val = mode === 'total' ? r.total : pnl;
      return { x: toX(r.ts), y: toY(val), ts: r.ts, total: r.total, pnl, val };
    });
    const yZero = toY(0);
    const yBase = mode === 'total' ? toY(base) : yZero;

    // 分段着色路径构建
    let aboveSegments: string[] = [];
    let belowSegments: string[] = [];
    if (pts.length > 0) {
      let prev = pts[0];
      let prevAbove = prev.y <= yBase ? true : false; // 注意：SVG y 越小越靠上
      let currentPath = `M ${prev.x.toFixed(2)} ${prev.y.toFixed(2)}`;
      for (let i = 1; i < pts.length; i++) {
        const p = pts[i];
        const isAbove = p.y <= yBase ? true : false;
        const dySeg = p.y - prev.y;
        if (isAbove === prevAbove || Math.abs(dySeg) < 1e-6) {
          // 同侧或几乎水平，不需要求交点
          currentPath += ` L ${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
        } else {
          // 求与 yBase 的交点（线性插值）
          const t = (yBase - prev.y) / (dySeg === 0 ? 1e-6 : dySeg);
          const xCross = prev.x + t * (p.x - prev.x);
          const yCross = yBase;
          currentPath += ` L ${xCross.toFixed(2)} ${yCross.toFixed(2)}`;
          // 推入当前侧路径
          if (prevAbove) aboveSegments.push(currentPath); else belowSegments.push(currentPath);
          // 切换侧并从交点开始新的路径
          currentPath = `M ${xCross.toFixed(2)} ${yCross.toFixed(2)} L ${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
          prevAbove = isAbove;
        }
        prev = p;
      }
      // 收尾
      if (prevAbove) aboveSegments.push(currentPath); else belowSegments.push(currentPath);
    }

    return {
      abovePath: aboveSegments.join(' '),
      belowPath: belowSegments.join(' '),
      minY, maxY, start: minX, end: maxX, points: pts, base, yZero, yBase,
    };
  }, [rows, mode]);

  const fmt = (v: number) => v.toLocaleString('en-US', { maximumFractionDigits: 2 });
  const fmtTime = (t: number) => new Date(t).toLocaleString();

  /**
   * 悬停事件处理：将鼠标/触摸的像素坐标映射到 viewBox，找到最近点并更新浮层位置
   * @param clientX 鼠标或触摸的页面 X 像素坐标
   * @param clientY 鼠标或触摸的页面 Y 像素坐标
   */
  const handleHover = (clientX: number, clientY: number) => {
    if (!svgRef.current || points.length === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    // 将像素坐标映射到 viewBox 用户坐标（0..W）
    const vx = ((clientX - rect.left) / rect.width) * W;
    // 限制在绘图区域
    const clampedX = Math.max(padding, Math.min(vx, W - padding));
    // 找到最近的数据点
    let idx = 0;
    let best = Infinity;
    for (let i = 0; i < points.length; i++) {
      const d = Math.abs(points[i].x - clampedX);
      if (d < best) {
        best = d;
        idx = i;
      }
    }
    setHoverIndex(idx);
    setTooltipPos({ left: clientX - rect.left, top: clientY - rect.top });
  };

  /** 清除悬停状态 */
  const clearHover = () => {
    setHoverIndex(null);
    setTooltipPos(null);
  };

  return (
    <Card
      /**
       * 外层卡片高度 100%，随父容器等高；使用列式 flex 让 body 可撑满剩余空间。
       */
      style={{ background: '#0f1116', border: '1px solid #1a1d26', height: '100%', display: 'flex', flexDirection: 'column' }}
      /**
       * 设定卡片内容区最小高度以保证 SVG 百分比高度有参照。
       * @remarks 当外层未提供明确高度时，`minHeight: H` 可确保图表不塌陷。
       */
      styles={{ header: { borderBottom: '1px solid #1a1d26' }, body: { padding: 16, minHeight: H, flex: 1, display: 'flex', flexDirection: 'column' } }}
      title={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/**
           * 曲线卡片标题颜色
           * @remarks 与全局主题主色一致（绿色）。
           */}
          <Title level={5} style={{ margin: 0, color: '#00e676' }}>
            <LineChartOutlined /> 金额曲线
          </Title>
          <Space size={8}>
            <Button size="small" icon={<ReloadOutlined />} onClick={pull} disabled={loading}>刷新</Button>
            <Button size="small" type="primary" onClick={snapshot}>记录一次</Button>
            <Radio.Group
              size="small"
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              style={{ marginLeft: 8 }}
            >
              <Radio.Button value="total">总金额</Radio.Button>
              <Radio.Button value="pnl">盈亏</Radio.Button>
            </Radio.Group>
          </Space>
        </div>
      }
    >
      {rows.length === 0 ? (
        <Text style={{ color: '#a1a9b7' }}>暂无数据，点击“记录一次”采集快照</Text>
      ) : (
        <div style={{ width: '100%', position: 'relative', height: '100%' }}>
          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="xMidYMid meet"
            style={{ display: 'block', width: '100%', height: '100%' }}
          >
            {/* 边框与网格 */}
            <rect x={0} y={0} width={W} height={H} fill="#0f1116" stroke="#1a1d26" />
            {/* 轴文本（调整位置避免重叠与裁剪） */}
            <text x={12} y={padding - 16} fill="#a1a9b7" fontSize={12}>高：{fmt(maxY)}</text>
            <text x={12} y={H - padding + 12} fill="#a1a9b7" fontSize={12}>低：{fmt(minY)}</text>
            <text x={12} y={H - 12} fill="#a1a9b7" fontSize={12}>{fmtTime(start)}</text>
            <text x={W - 12} y={H - 12} fill="#a1a9b7" fontSize={12} textAnchor="end">{fmtTime(end)}</text>
            {/* 分段着色折线：高于基线为绿色，低于基线为红色 */}
            {abovePath && <path d={abovePath} stroke="#00e676" strokeWidth={2} fill="none" />}
            {belowPath && <path d={belowPath} stroke="#ff4d4f" strokeWidth={2} fill="none" />}
            {/* 参考线：总金额模式画出初始金额基线；盈亏模式画出 0 轴 */}
            {mode === 'total' && (
              <line x1={padding} x2={W - padding} y1={yBase} y2={yBase} stroke="#39404f" strokeDasharray="4 4" />
            )}
            {mode === 'pnl' && (
              <line x1={padding} x2={W - padding} y1={yZero} y2={yZero} stroke="#39404f" strokeDasharray="4 4" />
            )}
            {/* 悬停十字线与点位 */}
            {hoverIndex !== null && points[hoverIndex] && (
              <>
                <line x1={points[hoverIndex].x} y1={padding} x2={points[hoverIndex].x} y2={H - padding} stroke="#39404f" strokeDasharray="4 4" />
                <circle
                  cx={points[hoverIndex].x}
                  cy={points[hoverIndex].y}
                  r={3}
                  fill={(() => {
                    const val = mode === 'total' ? points[hoverIndex].total : points[hoverIndex].pnl;
                    const baseVal = mode === 'total' ? base : 0;
                    return val >= baseVal ? '#00e676' : '#ff4d4f';
                  })()}
                />
              </>
            )}
            {/* 透明事件捕获层（鼠标/触摸） */}
            <rect
              x={0}
              y={0}
              width={W}
              height={H}
              fill="transparent"
              onMouseMove={(e) => handleHover(e.clientX, e.clientY)}
              onMouseLeave={clearHover}
              onTouchMove={(e) => {
                const t = e.touches?.[0];
                if (t) handleHover(t.clientX, t.clientY);
              }}
              onTouchEnd={clearHover}
            />
          </svg>
          {/* 悬停信息浮层（HTML，避免 SVG 文本换行限制） */}
          {hoverIndex !== null && points[hoverIndex] && tooltipPos && (
            <div
              style={{
                position: 'absolute',
                left: tooltipPos.left + 8,
                top: Math.max(tooltipPos.top - 40, 8),
                background: '#0f1116',
                border: '1px solid #1a1d26',
                color: '#a1a9b7',
                padding: 8,
                borderRadius: 6,
                pointerEvents: 'none',
                fontSize: 12,
                boxShadow: '0 2px 8px rgba(0,0,0,0.35)'
              }}
            >
              <div>时间：{fmtTime(points[hoverIndex].ts)}</div>
              {mode === 'total' ? (
                <div>金额：{fmt(points[hoverIndex].total)}</div>
              ) : (
                <div>盈亏：{fmt(points[hoverIndex].pnl)}（相对初始 {fmt(base)}）</div>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}