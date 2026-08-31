"use client";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import SiteRow from "@/components/SiteCard";
import AddSiteModal from "@/components/AddSiteModal";
import StatusDot from "@/components/StatusDot";
import UptimeBar from "@/components/UptimeChart";
import api from "@/providers/api";
import { useRouter } from "next/navigation";
import IncidentsTab from "@/components/IncidentsTab";
import SettingsTab from "@/components/SettingsTab";

export default function Dashboard() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("MONITORS");
  const [showModal, setShowModal] = useState(false);
  const [selected, setSelected] = useState(null);
  const [time, setTime] = useState(null);
  const [page, setPage] = useState(1);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const queryClient = useQueryClient();

  // Auth guard — redirect to login if no token present
  useEffect(() => {
    if (typeof window !== "undefined" && !localStorage.getItem("access_token")) {
      router.replace("/login");
    }
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    router.push("/login");
  };

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: [`/sites/?page=${page}`],
    refetchInterval: 10000, 
  });
  
  const sites = data?.results || [];
  const totalCount = data?.count || 0;

  
  const deleteMutation = useMutation({
    mutationFn: async (siteId) => {
      return await api.delete(`/sites/${siteId}/`);
    },
    // Optimistic update: remove from cache immediately before server responds
    onMutate: async (siteId) => {
      const queryKey = [`/sites/?page=${page}`];
      await queryClient.cancelQueries({ queryKey });
      const previousData = queryClient.getQueryData(queryKey);
      queryClient.setQueryData(queryKey, (old) => {
        if (!old) return old;
        return {
          ...old,
          count: Math.max(0, (old.count || 1) - 1),
          results: old.results.filter((s) => s.id !== siteId),
        };
      });
      setSelected(null);
      return { previousData, queryKey };
    },
    onError: (err, _siteId, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(context.queryKey, context.previousData);
      }
      console.error("Delete Error:", err);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/sites/"], exact: false });
    },
  });

  const handleDeleteClick = (siteId) => {
    const site = sites.find(s => s.id === siteId) || currentSelectedDetail;
    const name = site?.name || `monitor #${siteId}`;
    if (!window.confirm(`Remove "${name}"? This permanently deletes its checks & incidents and cannot be undone.`)) return;
    deleteMutation.mutate(siteId);
  };

  const stats = {
    totalSites: totalCount,
    upSites: sites.filter(s => s.status === "up" || s.status === "operational").length,
    avgUptime: sites.length 
      ? parseFloat((sites.reduce((acc, s) => acc + (s.uptime || 100), 0) / sites.length).toFixed(2)) 
      : 100,
    avgResponse: sites.length
      ? Math.round(sites.reduce((acc, s) => acc + (s.responseTime || s.last_response_time || 0), 0) / sites.length)
      : 0,
    activeIncidents: sites.filter(s => s.status === "down").length,
  };

  const currentSelectedDetail = selected ? sites.find(s => s.id === selected.id) || selected : null;

  useEffect(() => {
    setTime(new Date());
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  if (isError) {
    return (
      <div style={{ minHeight: "100vh", background: "#070b14", color: "#ff3b5c", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Mono', monospace" }}>
        <span style={{ fontSize: "12px", letterSpacing: "0.1em" }}>FAILED TO CONNECT TO MONITOR BACKEND ENGINE</span>
      </div>
    );
  }

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
        input::placeholder { color: #2d3748; }
        @keyframes shimmer {
          0% { background-position: -600px 0; }
          100% { background-position: 600px 0; }
        }
        .skeleton-row {
          background: linear-gradient(90deg, #0d1117 25%, #1a1f2e 50%, #0d1117 75%);
          background-size: 600px 100%;
          animation: shimmer 1.4s infinite linear;
          border-radius: 4px;
          height: 14px;
        }
        /* hamburger + mobile clock: hidden by default, shown only in mobile media query */
        .hamburger-btn { display: none !important; }
        .mob-clock { display: none !important; }
        .mob-actions { display: none !important; }
        @media (max-width: 768px) {
          body, html { overflow-x: hidden; width: 100vw; }
          .desk-tabs { display: none !important; }
          .desk-slash { display: none !important; }
          .desk-actions { display: none !important; }
          .mob-actions { display: flex !important; }
          .hamburger-btn { display: flex !important; align-items: center; justify-content: center; }
          .mob-clock { display: block !important; }
          .mobile-page-pad { padding: 24px 16px !important; width: 100%; box-sizing: border-box; }
          .mobile-grid-stats { grid-template-columns: 1fr 1fr !important; gap: 10px; }
          .mobile-grid-stats > div:first-child { grid-column: 1 / -1; }
          .mobile-table-header { display: none !important; }
          .mobile-grid-2 { grid-template-columns: 1fr !important; }
          .mobile-modal-panel { width: 100vw !important; left: 0 !important; right: 0 !important; top: auto !important; bottom: 0 !important; max-height: 80vh; border-left: none !important; border-top: 1px solid #1a1f2e !important; }
          .mobile-footer { flex-direction: column !important; gap: 6px !important; text-align: center !important; }
        }
      `}</style>


      {/* ───── HEADER ───── */}
      <div style={{
        borderBottom: "1px solid #1a1f2e", flexShrink: 0,
        padding: "0 48px", height: "56px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        {/* Left: brand + desktop tabs */}
        <div style={{ display: "flex", alignItems: "center", gap: "32px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span
              style={{ fontSize: "13px", fontWeight: "500", letterSpacing: "0.15em", color: "#e2e8f0", cursor: "pointer", whiteSpace: "nowrap" }}
              onClick={() => router.push("/")}
            >
              PULSECHECK
            </span>
            <span className="desk-slash" style={{ color: "#4a5568" }}>/</span>
            <span className="desk-slash" style={{ fontSize: "13px", color: "#4a5568", letterSpacing: "0.08em" }}>DASHBOARD</span>
          </div>
          <div className="desk-tabs" style={{ display: "flex", gap: "24px" }}>
            {["MONITORS", "INCIDENTS", "SETTINGS"].map(item => (
              <span key={item} onClick={() => setActiveTab(item)} style={{
                fontSize: "11px", color: activeTab === item ? "#00ff88" : "#4a5568",
                letterSpacing: "0.08em", cursor: "pointer",
                borderBottom: activeTab === item ? "1px solid #00ff88" : "none",
                paddingBottom: "2px", whiteSpace: "nowrap",
              }}>{item}</span>
            ))}
          </div>
        </div>

        {/* Right side wrapper (keeps exactly 2 children for space-between) */}
        <div style={{ display: "flex", alignItems: "center" }}>
          {/* Right on desktop: clock + buttons */}
          <div className="desk-actions" style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <span style={{ fontSize: "11px", color: "#2d3748", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>
              {time ? time.toLocaleTimeString("en-GB") : "--:--:--"}
            </span>
            <button onClick={() => setShowModal(true)} style={{
              background: "#00ff88", color: "#070b14", border: "none",
              borderRadius: "6px", padding: "7px 14px", fontSize: "11px",
              fontWeight: "700", cursor: "pointer", letterSpacing: "0.08em",
              fontFamily: "'DM Mono', monospace", whiteSpace: "nowrap",
            }}>+ ADD MONITOR</button>
            <button
              onClick={handleLogout}
              style={{
                background: "transparent", color: "#ff3b5c", border: "1px solid #ff3b5c",
                borderRadius: "6px", padding: "7px 14px", fontSize: "11px",
                fontWeight: "700", cursor: "pointer", letterSpacing: "0.08em",
                fontFamily: "'DM Mono', monospace", whiteSpace: "nowrap",
              }}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,59,92,0.1)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
            >TERMINATE SESSION</button>
          </div>

          {/* Right on mobile: live clock + hamburger */}
          <div className="mob-actions" style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span className="mob-clock" style={{ fontSize: "12px", color: "#4a5568", letterSpacing: "0.05em", fontFamily: "'DM Mono', monospace" }}>
              {time ? time.toLocaleTimeString("en-GB") : "--:--:--"}
            </span>
            <button
              className="hamburger-btn"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              style={{ background: "none", border: "none", color: "#e2e8f0", fontSize: "22px", cursor: "pointer", padding: "4px", lineHeight: 1 }}
            >
              {mobileMenuOpen ? "✕" : "☰"}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile dropdown — conditionally rendered so it NEVER appears on desktop */}
      {mobileMenuOpen && (
        <div style={{
          position: "fixed", top: "56px", left: 0, right: 0,
          background: "#070b14", borderBottom: "1px solid #1a1f2e",
          zIndex: 200, padding: "0 24px 24px",
          display: "flex", flexDirection: "column",
        }}>
          {["MONITORS", "INCIDENTS", "SETTINGS"].map(item => (
            <span
              key={item + "-mob"}
              onClick={() => { setActiveTab(item); setMobileMenuOpen(false); }}
              style={{
                fontSize: "12px", color: activeTab === item ? "#00ff88" : "#4a5568",
                letterSpacing: "0.08em", cursor: "pointer", padding: "16px 0",
                borderBottom: "1px solid #1a1f2e", textAlign: "center",
                fontFamily: "'DM Mono', monospace",
                background: activeTab === item ? "rgba(0,255,136,0.04)" : "transparent",
              }}
            >{item}</span>
          ))}
          <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "16px" }}>
            <button
              onClick={() => { setShowModal(true); setMobileMenuOpen(false); }}
              style={{
                background: "#00ff88", color: "#070b14", border: "none",
                borderRadius: "6px", padding: "13px", fontSize: "13px",
                fontWeight: "700", cursor: "pointer", letterSpacing: "0.08em",
                fontFamily: "'DM Mono', monospace",
              }}
            >+ ADD MONITOR</button>
            <button
              onClick={() => { handleLogout(); setMobileMenuOpen(false); }}
              style={{
                background: "transparent", color: "#ff3b5c", border: "1px solid #ff3b5c",
                borderRadius: "6px", padding: "13px", fontSize: "13px",
                fontWeight: "700", cursor: "pointer", letterSpacing: "0.08em",
                fontFamily: "'DM Mono', monospace",
              }}
            >TERMINATE SESSION</button>
          </div>
        </div>
      )}

      <div className="mobile-page-pad" style={{ padding: "96px 48px 48px", maxWidth: "1400px", margin: "0 auto", width: "100%", boxSizing: "border-box" }}>

        {/* Stats Row */}
        <div className="mobile-grid-stats" style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "12px", marginBottom: "32px" }}>
          {[
            { label: "TOTAL MONITORS", value: stats.totalSites, unit: "" },
            { label: "OPERATIONAL", value: stats.upSites, unit: `/ ${stats.totalSites}`, color: "#00ff88" },
            { label: "AVG UPTIME", value: stats.avgUptime, unit: "%", color: "#00ff88" },
            { label: "AVG RESPONSE", value: stats.avgResponse, unit: "ms" },
            { label: "ACTIVE INCIDENTS", value: stats.activeIncidents, unit: "", color: stats.activeIncidents > 0 ? "#ff3b5c" : "#00ff88" },
          ].map((stat, i) => (
            <div key={i} style={{
              background: "#0a0e1a", border: "1px solid #1a1f2e",
              borderRadius: "8px", padding: "16px 18px",
            }}>
              <div style={{ fontSize: "10px", color: "#4a5568", letterSpacing: "0.1em", marginBottom: "8px" }}>
                {stat.label}
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: "4px" }}>
                <span style={{ fontSize: "22px", fontWeight: "500", color: stat.color || "#e2e8f0", fontFamily: "'Syne', sans-serif" }}>
                  {stat.value}
                </span>
                <span style={{ fontSize: "11px", color: "#4a5568" }}>{stat.unit}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Active Incident Banner */}
        {stats.activeIncidents > 0 && (
          <div style={{
            background: "rgba(255, 59, 92, 0.08)", border: "1px solid rgba(255,59,92,0.2)",
            borderRadius: "8px", padding: "12px 18px", marginBottom: "20px",
            display: "flex", alignItems: "center", gap: "10px",
          }}>
            <span style={{ color: "#ff3b5c", fontSize: "11px" }}>●</span>
            <span style={{ color: "#ff3b5c", fontSize: "12px", letterSpacing: "0.05em" }}>
              ACTIVE INCIDENT — {stats.activeIncidents} of your tracked endpoints are reporting operational outages
            </span>
          </div>
        )}

        {/* Tab Logic Rendering */}
        {activeTab === "MONITORS" && (
          <>
            {/* Sites Table */}
            <div style={{
              background: "#0a0e1a", border: "1px solid #1a1f2e",
              borderRadius: "10px", overflow: "hidden",
            }}>
              {/* Table Header */}
              <div className="mobile-table-header" style={{
                display: "grid",
                gridTemplateColumns: "1.5fr 1fr 1fr 1.2fr 1.5fr",
                padding: "12px 20px",
                borderBottom: "1px solid #1a1f2e",
                gap: "12px",
              }}>
                {["MONITOR", "UPTIME", "RESPONSE", "CHECKED", "LAST 20 CHECKS"].map(h => (
                  <span key={h} style={{ fontSize: "10px", color: "#2d3748", letterSpacing: "0.1em" }}>{h}</span>
                ))}
              </div>

              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} style={{
                    display: "grid",
                    gridTemplateColumns: "1.5fr 1fr 1fr 1.2fr 1.5fr",
                    padding: "16px 20px",
                    borderBottom: "1px solid #1a1f2e",
                    gap: "12px",
                    alignItems: "center",
                  }}>
                    <div className="skeleton-row" style={{ width: "60%" }} />
                    <div className="skeleton-row" style={{ width: "40%" }} />
                    <div className="skeleton-row" style={{ width: "50%" }} />
                    <div className="skeleton-row" style={{ width: "70%" }} />
                    <div className="skeleton-row" style={{ width: "80%" }} />
                  </div>
                ))
              ) : sites.length > 0 ? (
                sites.map(site => (
                  <SiteRow key={site.id} site={site} onClick={setSelected} />
                ))
              ) : (
                <div style={{ padding: "48px", textAlign: "center", color: "#4a5568", fontSize: "12px", letterSpacing: "0.05em" }}>
                  NO MONITORS REGISTERED ON CORE ENGINE NETWORK
                </div>
              )}
            </div>

            {/* Pagination Controls */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "16px" }}>
              <button 
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                style={{
                  background: "transparent", color: page === 1 ? "#4a5568" : "#00ff88", 
                  border: `1px solid ${page === 1 ? '#1a1f2e' : '#00ff88'}`, padding: "6px 12px", borderRadius: "6px",
                  cursor: page === 1 ? "not-allowed" : "pointer", fontSize: "11px",
                  fontFamily: "'DM Mono', monospace", letterSpacing: "0.1em"
                }}
              >
                ← PREV
              </button>
              <span style={{ fontSize: "11px", color: "#4a5568", letterSpacing: "0.1em" }}>
                PAGE {page} {data?.count ? `(TOTAL: ${data.count})` : ''}
              </span>
              <button 
                onClick={() => setPage(p => p + 1)}
                disabled={!data?.next}
                style={{
                  background: "transparent", color: !data?.next ? "#4a5568" : "#00ff88", 
                  border: `1px solid ${!data?.next ? '#1a1f2e' : '#00ff88'}`, padding: "6px 12px", borderRadius: "6px",
                  cursor: !data?.next ? "not-allowed" : "pointer", fontSize: "11px",
                  fontFamily: "'DM Mono', monospace", letterSpacing: "0.1em"
                }}
              >
                NEXT →
              </button>
            </div>
          </>
        )}

        {activeTab === "INCIDENTS" && <IncidentsTab />}
        {activeTab === "SETTINGS" && <SettingsTab />}

        {/* Footer */}
        <div className="mobile-footer" style={{
          marginTop: "20px", display: "flex",
          justifyContent: "space-between", alignItems: "center",
        }}>
          <span style={{ fontSize: "11px", color: "#2d3748" }}>
            Checks run automatically via pipeline systems
          </span>
          <span style={{ fontSize: "11px", color: "#2d3748" }}>
            {totalCount} monitors active
          </span>
        </div>
      </div>

      {/* Site Detail Panel */}
      {currentSelectedDetail && (
        <div className="mobile-modal-panel" style={{
          position: "fixed", right: 0, top: 0, bottom: 0, width: "360px",
          background: "#0a0e1a", borderLeft: "1px solid #1a1f2e",
          padding: "28px", overflowY: "auto", zIndex: 50,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "24px" }}>
            <span style={{ fontSize: "12px", letterSpacing: "0.1em", color: "#4a5568" }}>MONITOR DETAIL</span>
            <button onClick={() => setSelected(null)} style={{ background: "none", border: "none", color: "#4a5568", cursor: "pointer" }}>✕</button>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px" }}>
            <StatusDot status={currentSelectedDetail.status} />
            <div>
              <div style={{ fontSize: "16px", fontWeight: "500", color: "#e2e8f0", fontFamily: "'Syne', sans-serif" }}>{currentSelectedDetail.name}</div>
              <div style={{ fontSize: "11px", color: "#4a5568", marginTop: "2px" }}>{currentSelectedDetail.url}</div>
            </div>
          </div>

          <div className="mobile-grid-2" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "24px" }}>
            {[
              { label: "UPTIME", value: `${currentSelectedDetail.uptime || 100}%` },
              { label: "RESPONSE", value: (currentSelectedDetail.responseTime || currentSelectedDetail.last_response_time) ? `${currentSelectedDetail.responseTime || currentSelectedDetail.last_response_time}ms` : "—" },
              { label: "INCIDENTS", value: currentSelectedDetail.incidents ?? 0 },
              { label: "LAST CHECK", value: currentSelectedDetail.lastChecked || currentSelectedDetail.last_checked ? new Date(currentSelectedDetail.lastChecked || currentSelectedDetail.last_checked).toLocaleString("en-GB", { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : "PENDING" },
            ].map((item, i) => (
              <div key={i} style={{
                background: "#070b14", border: "1px solid #1a1f2e",
                borderRadius: "6px", padding: "12px",
              }}>
                <div style={{ fontSize: "10px", color: "#4a5568", letterSpacing: "0.1em", marginBottom: "6px" }}>{item.label}</div>
                <div style={{ fontSize: "16px", color: "#e2e8f0", fontFamily: "'Syne', sans-serif" }}>{item.value}</div>
              </div>
            ))}
          </div>

          <div style={{ marginBottom: "16px" }}>
            <div style={{ fontSize: "10px", color: "#4a5568", letterSpacing: "0.1em", marginBottom: "10px" }}>UPTIME HISTORY</div>
            <UptimeBar history={currentSelectedDetail.history || currentSelectedDetail.ping_history || []} />
          </div>

          <div style={{ display: "flex", gap: "8px", marginTop: "24px" }}>
            <button 
              onClick={() => router.push(`/status/${currentSelectedDetail.slug}`)}
              style={{
              flex: 1, background: "transparent", border: "1px solid #1a1f2e",
              color: "#4a5568", borderRadius: "6px", padding: "9px",
              fontSize: "11px", cursor: "pointer", fontFamily: "'DM Mono', monospace",
              letterSpacing: "0.06em",
            }}>
              VIEW STATUS PAGE
            </button>
            <button 
              onClick={() => handleDeleteClick(currentSelectedDetail.id)}
              disabled={deleteMutation.isPending}
              style={{
                flex: 1, background: "transparent", border: "1px solid #ff3b5c",
                color: "#ff3b5c", borderRadius: "6px", padding: "9px",
                fontSize: "11px", cursor: deleteMutation.isPending ? "not-allowed" : "pointer", 
                fontFamily: "'DM Mono', monospace",
                letterSpacing: "0.06em",
                opacity: deleteMutation.isPending ? 0.5 : 1
              }}
            >
              REMOVE
            </button>
          </div>
        </div>
      )}

      {showModal && <AddSiteModal onClose={() => setShowModal(false)} onAdd={refetch} />}
    </div>
  );
}
