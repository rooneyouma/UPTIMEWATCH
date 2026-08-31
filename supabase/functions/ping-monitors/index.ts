import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

serve(async (req) => {
  try {
    // Connect to Supabase
    // Supabase automatically injects these into Edge Functions
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY");

    if (!supabaseUrl || !supabaseKey) {
      throw new Error("Missing Supabase Environment Variables");
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Fetch active monitors
    const { data: sites, error: sitesError } = await supabase
      .from("monitor_site")
      .select("id, url, name")
      .eq("is_active", true);

    if (sitesError) throw sitesError;

    if (!sites || sites.length === 0) {
      return new Response(JSON.stringify({ message: "No active sites to monitor." }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // 2. Ping sites concurrently — 10s timeout, DOWN on network error OR non-2xx/3xx
    const promises = sites.map(async (site) => {
      const start = Date.now();
      let status: "up" | "down" = "down";
      let statusCode: number | null = null;
      let responseTime: number | null = null;

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const res = await fetch(site.url, {
          signal: controller.signal,
          redirect: "follow",
        });
        clearTimeout(timeoutId);

        statusCode = res.status;
        responseTime = Date.now() - start;

        // Treat 2xx-3xx as UP, 4xx/5xx + network failures as DOWN
        // 500s are real outages; 4xx often means site misconfig but we still flag as DOWN
        if (res.ok || (res.status >= 300 && res.status < 400)) {
          status = "up";
        } else {
          status = "down";
          console.warn(`Site ${site.name} returned HTTP ${res.status} — marking DOWN`);
        }
      } catch (e) {
        status = "down";
        responseTime = Date.now() - start;
        statusCode = null;
        console.warn(`Fetch failed for ${site.name} (${site.url}):`, (e as Error).message);
      }

      return {
        site_id: site.id,
        status,
        status_code: statusCode,
        response_time: responseTime,
        checked_at: new Date().toISOString(),
      };
    });

    const checks = await Promise.all(promises);

    // 3. Insert fresh checks into the database
    const { error: insertError } = await supabase
      .from("monitor_check")
      .insert(checks);

    if (insertError) throw insertError;

    // 4. Ping the Django backend Webhook
    // This tells Django to process the results (creating Incidents and sending Emails)
    // AND keeps the Render host awake.
    const backendUrl = Deno.env.get("DJANGO_BACKEND_URL");
    const webhookSecret = Deno.env.get("PULSECHECK_WEBHOOK_SECRET");

    let webhookStatus = null;
    if (backendUrl) {
      try {
        // Strip trailing slash just in case
        const cleanBackendUrl = backendUrl.endsWith('/') ? backendUrl.slice(0, -1) : backendUrl;
        
        const webhookRes = await fetch(`${cleanBackendUrl}/api/webhooks/process-incidents/`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${webhookSecret}`,
          },
          body: JSON.stringify({ checks_ran: checks.length }),
        });
        webhookStatus = webhookRes.status;
      } catch (e) {
        console.error("Webhook trigger failed", e);
        webhookStatus = "Connection Failed";
      }
    } else {
      console.warn("DJANGO_BACKEND_URL not set. Skipping webhook.");
      webhookStatus = "Skipped";
    }

    return new Response(
      JSON.stringify({ success: true, processed: checks.length, webhookStatus }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Function encountered an error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
