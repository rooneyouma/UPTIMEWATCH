"use client";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import axios from "axios";
import { useEffect, useState } from "react";

const publicApi = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api",
  timeout: 10000,
  headers: { "Content-Type": "application/json" },
});

function useClock() {
  const [time, setTime] = useState("");
  useEffect(() => {
    const tick = () =>
      setTime(new Date().toLocaleTimeString("en-GB", { hour12: false }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return time;
}

function SkeletonRow() {
  return (
    <div className="hub-table-row" style={{
      borderBottom: "1px solid #1a1f2e",
      animation: "pulse 1.5s ease-in-out infinite",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#1a1f2e", flexShrink: 0 }} />
        <div style={{ height: 12, width: "55%", background: "#1a1f2e", borderRadius: 4 }} />
      </div>
      <div style={{ height: 11, width: "60%", background: "#111827", borderRadius: 4 }} className="mobile-hide" />
      <div style={{ height: 12, width: "50%", background: "#1a1f2e", borderRadius: 4 }} />
      <div style={{ height: 22, width: 90, background: "#1a1f2e", borderRadius: 6 }} />
    </div>
  );
}

function MiniBar({ is_up }) {
  const bars = Array.from({ length: 12 }, (_, i) => i);
  return (
    <div style={{ display: "flex", gap: 3, alignItems: "flex-end" }}>
      {bars.map((i) => (
        <div
          key={i}
          style={{
            width: 4,
            height: 10 + Math.sin(i * 1.3) * 4,
            borderRadius: 2,
            background: is_up ? "rgba(0,255,136,0.6)" : "rgba(255,59,92,0.5)",
          }}
        />
      ))}
    </div>
  );
}

export default function StatusHubPage() {
  const router = useRouter();
  const clock = useClock();

  const { data: sites = [], isLoading, isError } = useQuery({
    queryKey: ["status-hub"],
    queryFn: () => publicApi.get("/status/").then((r) => r.data?.results ?? r.data ?? []),
    refetchInterval: 15000,
  });

  const total = sites.length;
  const operational = sites.filter((s) => s.is_up).length;
  const issues = total - operational;

  return (
    <div style={{
      minHeight: "100vh",
      background: "#070b14",
      color: "#e2e8f0",
      fontFamily: "'DM Mono', monospace",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Syne:wght@700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: #070b14; }
        ::-webkit-scrollbar-thumb { background: #1a1f2e; border-radius: 2px; }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @keyframes ping {
          0% { transform: scale(1); opacity: 1; }
          75%, 100% { transform: scale(2.2); opacity: 0; }
        }

        .hub-table-row {
          display: grid;
          grid-template-columns: 2fr 2fr 160px 120px 32px;
          gap: 16px;
          align-items: center;
          padding: 18px 24px;
          border-left: 3px solid transparent;
          cursor: pointer;
          transition: background 0.15s, border-left-color 0.15s;
        }
        .hub-table-header {
          display: grid;
          grid-template-columns: 2fr 2fr 160px 120px 32px;
          gap: 16px;
          align-items: center;
          padding: 12px 24px;
          border-bottom: 1px solid #1a1f2e;
        }
        .hub-row-up:hover { background: rgba(255,255,255,0.02); border-left-color: #00ff88; }
        .hub-row-up:hover .hub-arrow { opacity: 1; transform: translateX(2px); }
        .hub-row-down:hover { background: rgba(255,59,92,0.03); border-left-color: #ff3b5c; }
        .hub-row-down:hover .hub-arrow { opacity: 1; transform: translateX(2px); }
        .hub-arrow {
          opacity: 0.3;
          transition: opacity 0.15s, transform 0.15s;
          flex-shrink: 0;
        }

        @media (max-width: 640px) {
          .hub-table-header { display: none; }
          .hub-table-row {
            grid-template-columns: 1fr auto auto;
            grid-template-rows: auto auto;
            gap: 8px 12px;
            padding: 16px;
          }
          .hub-col-url { display: none; }
          .hub-col-uptime { grid-column: 1 / 2; grid-row: 2 / 3; }
          .hub-col-badge { grid-column: 2 / 3; grid-row: 1 / 3; align-self: center; }
          .hub-col-arrow { grid-column: 3 / 4; grid-row: 1 / 3; align-self: center; }
          .hub-stat-grid { grid-template-columns: 1fr 1fr !important; }
          .hub-page-pad { padding: 24px 16px !important; }
          .hub-header-pad { padding: 0 16px !important; }
        }
      `}</style>

      {/* Header */}
      <div className="hub-header-pad" style={{
        borderBottom: "1px solid #1a1f2e",
        padding: "0 32px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        height: "56px",
        position: "sticky", top: 0, zIndex: 10,
        background: "#070b14",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <span style={{ fontSize: "13px", fontWeight: "500", letterSpacing: "0.15em", color: "#e2e8f0" }}>
            PULSECHECK
          </span>
          <span style={{ color: "#4a5568" }}>/</span>
          <span style={{ fontSize: "13px", color: "#4a5568", letterSpacing: "0.08em" }}>STATUS</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <span style={{ fontSize: "11px", color: "#4a5568", letterSpacing: "0.12em", fontVariantNumeric: "tabular-nums" }}>
            {clock}
          </span>
        </div>
      </div>

      <div className="hub-page-pad" style={{ maxWidth: "960px", margin: "0 auto", padding: "40px 32px" }}>

        {/* Page title */}
        <div style={{ marginBottom: "32px", textAlign: "center" }}>
          <h1 style={{
            fontFamily: "'Syne', sans-serif",
            fontSize: "28px", fontWeight: 800,
            letterSpacing: "0.04em", color: "#e2e8f0",
            marginBottom: "6px",
          }}>
            MONITOR STATUS
          </h1>
          <p style={{ fontSize: "12px", color: "#4a5568", letterSpacing: "0.06em", textAlign: "center" }}>
            Live status for all active monitors · refreshes every 15s
          </p>
        </div>

        {/* Stat Pills */}
        <div className="hub-stat-grid" style={{
          display: "grid", gridTemplateColumns: "repeat(3, 1fr)",
          gap: "12px", marginBottom: "32px",
        }}>
          {[
            { label: "MONITORS", value: isLoading ? "—" : total, color: "#e2e8f0" },
            { label: "OPERATIONAL", value: isLoading ? "—" : operational, color: "#00ff88" },
            { label: "ISSUES", value: isLoading ? "—" : issues, color: issues > 0 ? "#ff3b5c" : "#4a5568" },
          ].map(({ label, value, color }) => (
            <div key={label} style={{
              background: "#0a0e1a", border: "1px solid #1a1f2e",
              borderRadius: "10px", padding: "20px 24px",
              display: "flex", flexDirection: "column", gap: "6px",
            }}>
              <span style={{ fontSize: "10px", color: "#4a5568", letterSpacing: "0.12em" }}>{label}</span>
              <span style={{ fontFamily: "'Syne', sans-serif", fontSize: "28px", fontWeight: 800, color }}>{value}</span>
            </div>
          ))}
        </div>

        {/* Site Table */}
        <div style={{ background: "#0a0e1a", border: "1px solid #1a1f2e", borderRadius: "12px", overflow: "hidden" }}>
          <div className="hub-table-header">
            <span style={{ fontSize: "10px", color: "#4a5568", letterSpacing: "0.12em" }}>MONITOR</span>
            <span className="hub-col-url" style={{ fontSize: "10px", color: "#4a5568", letterSpacing: "0.12em" }}>URL</span>
            <span style={{ fontSize: "10px", color: "#4a5568", letterSpacing: "0.12em" }}>UPTIME</span>
            <span style={{ fontSize: "10px", color: "#4a5568", letterSpacing: "0.12em" }}>STATUS</span>
            <span className="hub-col-arrow"></span>
          </div>

          {isLoading && (
            <><SkeletonRow /><SkeletonRow /><SkeletonRow /><SkeletonRow /></>
          )}

          {isError && !isLoading && (
            <div style={{ padding: "48px 24px", textAlign: "center" }}>
              <span style={{ fontSize: "11px", color: "#ff3b5c", letterSpacing: "0.1em" }}>
                FAILED TO LOAD MONITORS — BACKEND UNREACHABLE
              </span>
            </div>
          )}

          {!isLoading && !isError && sites.length === 0 && (
            <div style={{ padding: "64px 24px", textAlign: "center" }}>
              <p style={{ fontSize: "12px", color: "#4a5568", letterSpacing: "0.1em", marginBottom: "8px" }}>
                NO ACTIVE MONITORS
              </p>
              <p style={{ fontSize: "11px", color: "#2d3748" }}>
                Add a site from your dashboard to start monitoring.
              </p>
            </div>
          )}

          {!isLoading && !isError && sites.map((site, idx) => {
            const isUp = site.is_up;
            const dotColor = isUp ? "#00ff88" : site.status === "pending" ? "#fbbf24" : "#ff3b5c";
            const isLast = idx === sites.length - 1;
            return (
              <div
                key={site.slug}
                className={`hub-table-row ${isUp ? "hub-row-up" : "hub-row-down"}`}
                onClick={() => router.push(`/status/${site.slug}`)}
                style={{ borderBottom: isLast ? "none" : "1px solid #1a1f2e" }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0 }}>
                  <div style={{ position: "relative", flexShrink: 0 }}>
                    <div style={{ width: 10, height: 10, borderRadius: "50%", background: dotColor }} />
                    {isUp && (
                      <div style={{
                        position: "absolute", inset: 0, borderRadius: "50%",
                        background: dotColor, opacity: 0.4,
                        animation: "ping 2s cubic-bezier(0,0,0.2,1) infinite",
                      }} />
                    )}
                  </div>
                  <span style={{ fontSize: "13px", fontWeight: "500", color: "#e2e8f0", letterSpacing: "0.06em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {site.name}
                  </span>
                </div>

                <span className="hub-col-url" style={{ fontSize: "11px", color: "#4a5568", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {site.url.replace(/^https?:\/\//, "")}
                </span>

                <div className="hub-col-uptime" style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <MiniBar is_up={isUp} />
                  <span style={{ fontSize: "12px", color: isUp ? "#00ff88" : "#ff3b5c", fontWeight: "500", minWidth: "42px", textAlign: "right" }}>
                    {site.uptime}%
                  </span>
                </div>

                <div className="hub-col-badge" style={{
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  padding: "5px 10px", borderRadius: "6px",
                  background: isUp ? "rgba(0,255,136,0.08)" : site.status === "pending" ? "rgba(251,191,36,0.08)" : "rgba(255,59,92,0.08)",
                  border: `1px solid ${isUp ? "rgba(0,255,136,0.2)" : site.status === "pending" ? "rgba(251,191,36,0.2)" : "rgba(255,59,92,0.2)"}`,
                }}>
                  <span style={{ fontSize: "9px", letterSpacing: "0.12em", color: dotColor, whiteSpace: "nowrap" }}>
                    {isUp ? "OPERATIONAL" : site.status === "pending" ? "PENDING" : "DOWN"}
                  </span>
                </div>

                <div className="hub-col-arrow" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg className="hub-arrow" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4a5568" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </div>
              </div>
            );
          })}
        </div>

        <p style={{ fontSize: "10px", color: "#2d3748", letterSpacing: "0.08em", textAlign: "center", marginTop: "24px" }}>
          Click any monitor to view its detailed status page
        </p>
      </div>
    </div>
  );
}
