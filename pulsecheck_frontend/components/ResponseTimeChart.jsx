"use client";
import { useState, useRef, useCallback, useMemo } from "react";

/**
 * ResponseTimeChart — SVG area chart for response time history.
 *
 * Props:
 *   data: Array<{ time: string, value: number|null, status: string }>
 *   height?: number (default 180)
 */
export default function ResponseTimeChart({ data = [], height = 180 }) {
  const svgRef = useRef(null);
  const [tooltip, setTooltip] = useState(null);

  const padding = { top: 20, right: 16, bottom: 32, left: 52 };

  const validData = useMemo(
    () => data.filter((d) => d.value != null && d.value > 0),
    [data]
  );

  if (validData.length === 0) {
    return (
      <div
        style={{
          height,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#2d3748",
          fontSize: "11px",
          letterSpacing: "0.05em",
        }}
      >
        NO RESPONSE TIME DATA FOR THIS RANGE
      </div>
    );
  }

  const values = validData.map((d) => d.value);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const range = maxVal - minVal || 1;

  const W = 700;
  const H = height;
  const plotW = W - padding.left - padding.right;
  const plotH = H - padding.top - padding.bottom;

  const toX = (i) => padding.left + (i / Math.max(validData.length - 1, 1)) * plotW;
  const toY = (v) => padding.top + plotH - ((v - minVal) / range) * plotH;

  // Build SVG path
  const linePoints = validData.map((d, i) => `${toX(i)},${toY(d.value)}`);
  const linePath = `M${linePoints.join(" L")}`;
  const areaPath = `${linePath} L${toX(validData.length - 1)},${padding.top + plotH} L${toX(0)},${padding.top + plotH} Z`;

  // Y-axis tick values
  const yTicks = 4;
  const yTickValues = Array.from({ length: yTicks + 1 }, (_, i) =>
    Math.round(minVal + (range * i) / yTicks)
  );

  // X-axis labels (show ~5 time labels spread across) — guard divide-by-zero when 1 point
  const xLabelCount = Math.min(5, validData.length);
  const xLabelIndices =
    xLabelCount <= 1
      ? [0]
      : Array.from({ length: xLabelCount }, (_, i) =>
          Math.round((i / (xLabelCount - 1)) * (validData.length - 1))
        );

  const handleMouseMove = useCallback(
    (e) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const mouseX = ((e.clientX - rect.left) / rect.width) * W;
      // Find nearest data point
      let closest = 0;
      let closestDist = Infinity;
      validData.forEach((_, i) => {
        const dist = Math.abs(toX(i) - mouseX);
        if (dist < closestDist) {
          closestDist = dist;
          closest = i;
        }
      });
      const d = validData[closest];
      setTooltip({
        x: toX(closest),
        y: toY(d.value),
        value: d.value,
        time: d.time,
        status: d.status,
      });
    },
    [validData, W]
  );

  const formatTime = (iso) => {
    const d = new Date(iso);
    return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  };

  const avgMs = Math.round(values.reduce((a, b) => a + b, 0) / values.length);

  return (
    <div style={{ position: "relative" }}>
      {/* Stats row above chart */}
      <div
        style={{
          display: "flex",
          gap: "24px",
          marginBottom: "12px",
        }}
      >
        <span style={{ fontSize: "10px", color: "#4a5568", letterSpacing: "0.08em" }}>
          AVG{" "}
          <span style={{ color: "#e2e8f0", fontWeight: "500" }}>{avgMs}ms</span>
        </span>
        <span style={{ fontSize: "10px", color: "#4a5568", letterSpacing: "0.08em" }}>
          MIN{" "}
          <span style={{ color: "#00ff88", fontWeight: "500" }}>
            {Math.round(minVal)}ms
          </span>
        </span>
        <span style={{ fontSize: "10px", color: "#4a5568", letterSpacing: "0.08em" }}>
          MAX{" "}
          <span style={{ color: "#ff3b5c", fontWeight: "500" }}>
            {Math.round(maxVal)}ms
          </span>
        </span>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: "100%", height: H, overflow: "visible" }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setTooltip(null)}
      >
        <defs>
          <linearGradient id="rtGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#00ff88" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#00ff88" stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {yTickValues.map((v, i) => (
          <g key={i}>
            <line
              x1={padding.left}
              y1={toY(v)}
              x2={W - padding.right}
              y2={toY(v)}
              stroke="#1a1f2e"
              strokeWidth="1"
            />
            <text
              x={padding.left - 8}
              y={toY(v) + 3}
              textAnchor="end"
              fill="#4a5568"
              fontSize="9"
              fontFamily="'DM Mono', monospace"
            >
              {v}
            </text>
          </g>
        ))}

        {/* X-axis labels — guard undefined */}
        {xLabelIndices.map((idx) => {
          const d = validData[idx];
          if (!d) return null;
          return (
            <text
              key={idx}
              x={toX(idx)}
              y={H - 6}
              textAnchor="middle"
              fill="#4a5568"
              fontSize="9"
              fontFamily="'DM Mono', monospace"
            >
              {formatTime(d.time)}
            </text>
          );
        })}

        {/* Area fill */}
        <path d={areaPath} fill="url(#rtGradient)" />

        {/* Line */}
        <path
          d={linePath}
          fill="none"
          stroke="#00ff88"
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Tooltip crosshair + dot */}
        {tooltip && (
          <>
            <line
              x1={tooltip.x}
              y1={padding.top}
              x2={tooltip.x}
              y2={padding.top + plotH}
              stroke="#4a5568"
              strokeWidth="1"
              strokeDasharray="3,3"
            />
            <circle cx={tooltip.x} cy={tooltip.y} r="4" fill="#00ff88" stroke="#070b14" strokeWidth="2" />
            <rect
              x={tooltip.x + (tooltip.x > W / 2 ? -110 : 10)}
              y={tooltip.y - 32}
              width="100"
              height="28"
              rx="4"
              fill="#0a0e1a"
              stroke="#1a1f2e"
              strokeWidth="1"
            />
            <text
              x={tooltip.x + (tooltip.x > W / 2 ? -60 : 60)}
              y={tooltip.y - 14}
              textAnchor="middle"
              fill="#e2e8f0"
              fontSize="10"
              fontFamily="'DM Mono', monospace"
            >
              {Math.round(tooltip.value)}ms · {formatTime(tooltip.time)}
            </text>
          </>
        )}

        {/* Unit label */}
        <text
          x={padding.left - 8}
          y={padding.top - 6}
          textAnchor="end"
          fill="#4a5568"
          fontSize="8"
          fontFamily="'DM Mono', monospace"
        >
          ms
        </text>
      </svg>
    </div>
  );
}
