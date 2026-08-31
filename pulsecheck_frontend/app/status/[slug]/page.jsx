"use client";
import { useQuery } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import axios from "axios";
import StatusDot from "@/components/StatusDot";
import UptimeBar from "@/components/UptimeChart";
import ResponseTimeChart from "@/components/ResponseTimeChart";

const publicApi = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api",
  timeout: 15000,
});

const RANGES = [
  { key: "1h", label: "1H" },
  { key: "6h", label: "6H" },
  { key: "24h", label: "24H" },
  { key: "7d", label: "7D" },
  { key: "30d", label: "30D" },
];

function formatDuration(seconds) {
  if (seconds == null) return "—";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

function MetricCard({ label, value, unit, color }) {
  return (
    <div
      style={{
        background: "#0a0e1a",
        border: "1px solid #1a1f2e",
        borderRadius: "10px",
        padding: "20px",
      }}
    >
      <div
        style={{
          fontSize: "10px",
          color: "#4a5568",
          letterSpacing: "0.1em",
          marginBottom: "8px",
        }}
      >
        {label}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: "4px" }}>
        <span
          style={{
            fontSize: "28px",
            fontWeight: "500",
            color: color || "#e2e8f0",
            fontFamily: "'Syne', sans-serif",
          }}
        >
          {value}
        </span>
        {unit && (
          <span style={{ fontSize: "11px", color: "#4a5568" }}>{unit}</span>
        )}
      </div>
    </div>
  );
}

function IncidentRow({ incident }) {
  const isActive = !incident.resolved_at;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "auto 1fr auto auto",
        gap: "16px",
        alignItems: "center",
        padding: "14px 0",
        borderBottom: "1px solid #1a1f2e",
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: isActive ? "#ff3b5c" : "#00ff88",
          boxShadow: isActive ? "0 0 6px rgba(255,59,92,0.4)" : "none",
          flexShrink: 0,
        }}
      />
      <div>
        <div
          style={{
            fontSize: "12px",
            color: "#e2e8f0",
            fontWeight: "500",
            letterSpacing: "0.03em",
          }}
        >
          {isActive ? "Ongoing outage" : "Resolved"}
        </div>
        <div style={{ fontSize: "10px", color: "#4a5568", marginTop: "2px" }}>
          Started{" "}
          {new Date(incident.started_at).toLocaleString("en-GB", {
            day: "2-digit",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </div>
      </div>
      <div style={{ fontSize: "11px", color: "#4a5568", textAlign: "right" }}>
        {incident.duration_seconds != null
          ? formatDuration(incident.duration_seconds)
          : isActive
            ? "—"
            : ""}
      </div>
      <span
        style={{
          fontSize: "9px",
          letterSpacing: "0.1em",
          padding: "3px 8px",
          borderRadius: "4px",
          background: isActive
            ? "rgba(255,59,92,0.1)"
            : "rgba(0,255,136,0.1)",
          border: `1px solid ${isActive ? "rgba(255,59,92,0.2)" : "rgba(0,255,136,0.2)"}`,
          color: isActive ? "#ff3b5c" : "#00ff88",
          whiteSpace: "nowrap",
        }}
      >
        {isActive ? "ACTIVE" : "RESOLVED"}
      </span>
    </div>
  );
}

export default function StatusPage() {
  const params = useParams();
  const slug = params?.slug;
  const router = useRouter();
  const [range, setRange] = useState("24h");

  const { data, isLoading, isError } = useQuery({
    queryKey: [`/status/${slug}/`, range],
    queryFn: () =>
      publicApi
        .get(`/status/${slug}/`, { params: { range } })
        .then((r) => r.data),
    enabled: !!slug,
    refetchInterval: 15000,
  });

  if (isLoading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#070b14",
          color: "#e2e8f0",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "'DM Mono', monospace",
        }}
      >
        <span style={{ fontSize: "12px", color: "#4a5568", letterSpacing: "0.1em" }}>
          INITIALIZING STATUS ENGINE...
        </span>
      </div>
    );
  }

  if (isError) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#070b14",
          color: "#ff3b5c",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "'DM Mono', monospace",
          flexDirection: "column",
          gap: "10px",
        }}
      >
        <span style={{ fontSize: "12px", letterSpacing: "0.1em" }}>
          FAILED TO CONNECT TO MAIN ENGINE
        </span>
        <span style={{ fontSize: "10px", color: "#4a5568" }}>
          THIS MONITOR MIGHT NOT EXIST
        </span>
      </div>
    );
  }

  if (!data) return null;

  const { is_up, site_name, analytics, response_time_chart, uptime_chart, incident_timeline } = data;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#070b14",
        color: "#e2e8f0",
        fontFamily: "'DM Mono', monospace",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Syne:wght@700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: #070b14; }
        ::-webkit-scrollbar-thumb { background: #1a1f2e; border-radius: 2px; }
        @media (max-width: 640px) {
          .status-grid-4 { grid-template-columns: 1fr 1fr !important; }
          .status-grid-2 { grid-template-columns: 1fr !important; }
          .status-page-pad { padding: 32px 16px !important; }
        }
      `}</style>

      {/* Header */}
      <div
        style={{
          borderBottom: "1px solid #1a1f2e",
          padding: "0 32px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: "56px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span
            style={{
              fontSize: "13px",
              fontWeight: "500",
              letterSpacing: "0.15em",
              color: "#e2e8f0",
              cursor: "pointer",
            }}
            onClick={() => router.push("/")}
          >
            PULSECHECK
          </span>
          <span style={{ color: "#4a5568" }}>/</span>
          <span style={{ fontSize: "13px", color: "#4a5568", letterSpacing: "0.08em" }}>
            {site_name || slug}
          </span>
        </div>
        <span style={{ fontSize: "10px", color: "#2d3748", letterSpacing: "0.08em" }}>
          LIVE
        </span>
      </div>

      <div
        className="status-page-pad"
        style={{ padding: "48px 32px", maxWidth: "960px", margin: "0 auto" }}
      >
        {/* ── Status Banner ── */}
        <div
          style={{
            background: is_up ? "rgba(0,255,136,0.05)" : "rgba(255,59,92,0.05)",
            border: `1px solid ${is_up ? "rgba(0,255,136,0.2)" : "rgba(255,59,92,0.2)"}`,
            borderRadius: "12px",
            padding: "40px 32px",
            marginBottom: "32px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
          }}
        >
          <StatusDot status={is_up ? "up" : "down"} />
          <h1
            style={{
              fontSize: "32px",
              fontFamily: "'Syne', sans-serif",
              marginTop: "20px",
              marginBottom: "8px",
              color: is_up ? "#00ff88" : "#ff3b5c",
            }}
          >
            {is_up ? "ALL SYSTEMS OPERATIONAL" : "SERVICE OUTAGE DETECTED"}
          </h1>
          <p style={{ fontSize: "12px", color: "#4a5568", letterSpacing: "0.05em" }}>
            Monitoring {site_name} · Last checked{" "}
            {data.last_checked
              ? new Date(data.last_checked).toLocaleString("en-GB", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })
              : "PENDING"}
          </p>
        </div>

        {/* ── Time Range Selector ── */}
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: "4px",
            marginBottom: "24px",
          }}
        >
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              style={{
                background:
                  range === r.key ? "rgba(0,255,136,0.1)" : "transparent",
                border: `1px solid ${range === r.key ? "rgba(0,255,136,0.3)" : "#1a1f2e"}`,
                color: range === r.key ? "#00ff88" : "#4a5568",
                borderRadius: "6px",
                padding: "5px 12px",
                fontSize: "10px",
                fontWeight: "500",
                cursor: "pointer",
                letterSpacing: "0.1em",
                fontFamily: "'DM Mono', monospace",
                transition: "all 0.15s",
              }}
            >
              {r.label}
            </button>
          ))}
        </div>

        {/* ── Metrics Cards ── */}
        <div
          className="status-grid-4"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: "12px",
            marginBottom: "32px",
          }}
        >
          <MetricCard
            label="LIFETIME UPTIME"
            value={`${analytics.lifetime_uptime}%`}
            color="#00ff88"
          />
          <MetricCard
            label="AVG RESPONSE"
            value={analytics.avg_response_time != null ? Math.round(analytics.avg_response_time) : "—"}
            unit="ms"
          />
          <MetricCard
            label="P95 RESPONSE"
            value={analytics.p95_response_time != null ? Math.round(analytics.p95_response_time) : "—"}
            unit="ms"
          />
          <MetricCard
            label="INCIDENTS"
            value={analytics.incident_count}
            color={analytics.incident_count > 0 ? "#ff3b5c" : "#00ff88"}
          />
        </div>

        {/* ── Response Time Chart ── */}
        {response_time_chart && response_time_chart.length > 0 && (
          <div
            style={{
              background: "#0a0e1a",
              border: "1px solid #1a1f2e",
              borderRadius: "10px",
              padding: "28px",
              marginBottom: "24px",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "16px",
              }}
            >
              <span
                style={{
                  fontSize: "12px",
                  letterSpacing: "0.1em",
                  color: "#e2e8f0",
                }}
              >
                RESPONSE TIME
              </span>
              <span style={{ fontSize: "10px", color: "#4a5568" }}>
                {analytics.total_checks} checks in range
              </span>
            </div>
            <ResponseTimeChart data={response_time_chart} height={200} />
          </div>
        )}

        {/* ── Uptime History Bar ── */}
        {uptime_chart && uptime_chart.length > 0 && (
          <div
            style={{
              background: "#0a0e1a",
              border: "1px solid #1a1f2e",
              borderRadius: "10px",
              padding: "28px",
              marginBottom: "24px",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "16px",
              }}
            >
              <span
                style={{
                  fontSize: "12px",
                  letterSpacing: "0.1em",
                  color: "#e2e8f0",
                }}
              >
                UPTIME HISTORY
              </span>
              <span
                style={{
                  fontSize: "11px",
                  color:
                    analytics.uptime >= 99.9
                      ? "#00ff88"
                      : analytics.uptime >= 98
                        ? "#f6c90e"
                        : "#ff3b5c",
                  fontWeight: "500",
                }}
              >
                {analytics.uptime}% in range
              </span>
            </div>
            <UptimeBar data={uptime_chart} height={40} />
          </div>
        )}

        {/* ── Incident Timeline ── */}
        <div
          style={{
            background: "#0a0e1a",
            border: "1px solid #1a1f2e",
            borderRadius: "10px",
            padding: "28px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "16px",
            }}
          >
            <span
              style={{
                fontSize: "12px",
                letterSpacing: "0.1em",
                color: "#e2e8f0",
              }}
            >
              INCIDENT HISTORY
            </span>
            <span style={{ fontSize: "10px", color: "#4a5568" }}>
              {incident_timeline.length} in range
            </span>
          </div>

          {incident_timeline.length > 0 ? (
            incident_timeline.map((inc) => (
              <IncidentRow key={inc.id} incident={inc} />
            ))
          ) : (
            <div
              style={{
                padding: "32px",
                textAlign: "center",
                color: "#2d3748",
                fontSize: "11px",
                letterSpacing: "0.05em",
              }}
            >
              NO INCIDENTS IN THIS RANGE
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <p
          style={{
            fontSize: "10px",
            color: "#2d3748",
            letterSpacing: "0.08em",
            textAlign: "center",
            marginTop: "32px",
          }}
        >
          POWERED BY PULSECHECK · AUTO-REFRESHES EVERY 15S
        </p>
      </div>
    </div>
  );
}
