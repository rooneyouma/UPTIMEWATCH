"use client";
import { useState, useCallback } from "react";

/**
 * UptimeBar — visual uptime history bar chart.
 *
 * Props:
 *   data: Array<{ time: string, status: string }>  (chronological, oldest → newest)
 *   OR
 *   history: Array<1|0>  (legacy binary format)
 *   height?: number (default 36)
 */
export default function UptimeBar({ data, history, height = 36 }) {
  const [hoveredIdx, setHoveredIdx] = useState(null);

  // Support both new data format and legacy binary format
  const items = data
    ? data
    : Array.isArray(history)
      ? history.map((v, i) => ({
          time: null,
          status: v === 1 ? "up" : "down",
        }))
      : [];

  if (items.length === 0) {
    return (
      <div
        style={{
          height,
          display: "flex",
          alignItems: "center",
          color: "#2d3748",
          fontSize: "10px",
          letterSpacing: "0.05em",
        }}
      >
        NO RECENT PING DATA
      </div>
    );
  }

  const formatTime = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  };

  const barWidth = Math.max(3, Math.min(8, Math.floor(600 / items.length)));
  const gap = items.length > 50 ? 1 : 2;

  // Calculate uptime % for the displayed range
  const upCount = items.filter((i) => i.status === "up").length;
  const uptimePct = ((upCount / items.length) * 100).toFixed(1);

  return (
    <div style={{ position: "relative" }}>
      {/* Uptime % badge */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "8px",
        }}
      >
        <span
          style={{
            fontSize: "10px",
            color: "#4a5568",
            letterSpacing: "0.08em",
          }}
        >
          {items.length} CHECKS
        </span>
        <span
          style={{
            fontSize: "11px",
            fontWeight: "500",
            color: parseFloat(uptimePct) >= 99.9 ? "#00ff88" : parseFloat(uptimePct) >= 98 ? "#f6c90e" : "#ff3b5c",
            fontFamily: "'DM Mono', monospace",
          }}
        >
          {uptimePct}%
        </span>
      </div>

      {/* Bar container */}
      <div
        style={{
          display: "flex",
          gap: `${gap}px`,
          alignItems: "flex-end",
          height,
          overflow: "hidden",
          position: "relative",
        }}
      >
        {items.map((item, i) => {
          const isUp = item.status === "up";
          const isHovered = hoveredIdx === i;
          const barH = isUp ? height : height * 0.4;

          return (
            <div
              key={i}
              style={{
                width: barWidth,
                height: barH,
                borderRadius: "2px",
                background: isUp ? "#00ff88" : "#ff3b5c",
                opacity: hoveredIdx !== null ? (isHovered ? 1 : 0.3) : isUp ? 0.85 : 1,
                transition: "opacity 0.15s, height 0.15s",
                cursor: "default",
                flexShrink: 0,
                position: "relative",
              }}
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
            />
          );
        })}
      </div>

      {/* Time labels below */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: "6px",
        }}
      >
        <span style={{ fontSize: "9px", color: "#2d3748", letterSpacing: "0.05em" }}>
          OLDER
        </span>
        <span style={{ fontSize: "9px", color: "#2d3748", letterSpacing: "0.05em" }}>
          NOW
        </span>
      </div>

      {/* Tooltip */}
      {hoveredIdx !== null && items[hoveredIdx] && (
        <div
          style={{
            position: "absolute",
            bottom: height + 32,
            left: "50%",
            transform: "translateX(-50%)",
            background: "#0a0e1a",
            border: "1px solid #1a1f2e",
            borderRadius: "6px",
            padding: "6px 10px",
            whiteSpace: "nowrap",
            zIndex: 20,
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                background: items[hoveredIdx].status === "up" ? "#00ff88" : "#ff3b5c",
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontSize: "10px",
                color: "#e2e8f0",
                fontFamily: "'DM Mono', monospace",
                letterSpacing: "0.03em",
              }}
            >
              {items[hoveredIdx].status === "up" ? "OPERATIONAL" : "DOWN"}
              {items[hoveredIdx].time
                ? ` · ${formatTime(items[hoveredIdx].time)}`
                : ""}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
