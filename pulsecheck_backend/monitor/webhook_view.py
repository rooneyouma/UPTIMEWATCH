import logging
import os

from django.conf import settings
from django.core.mail import send_mail
from django.db import transaction
from django.utils import timezone
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Check, Configuration, Incident, Site

logger = logging.getLogger("monitor")


def _send_email(to_email: str, subject: str, text: str, html: str | None = None):
    """Send via Resend API if RESEND_API_KEY is set, else fallback to Django send_mail."""
    resend_key = getattr(settings, "RESEND_API_KEY", "") or os.getenv("RESEND_API_KEY", "")
    from_email = getattr(settings, "RESEND_FROM_EMAIL", settings.DEFAULT_FROM_EMAIL)

    if resend_key:
        try:
            import resend

            resend.api_key = resend_key
            params = {
                "from": from_email,
                "to": [to_email],
                "subject": subject,
                "text": text,
            }
            if html:
                params["html"] = html
            resp = resend.Emails.send(params)
            logger.info("Resend email sent to %s subject='%s' id=%s", to_email, subject, resp.get("id"))
            return True
        except Exception as exc:
            logger.exception("Resend send failed to %s: %s", to_email, exc)
            # fall through to SMTP attempt
            pass

    # Fallback — SMTP or console backend
    try:
        sent = send_mail(subject, text, settings.DEFAULT_FROM_EMAIL, [to_email], html_message=html, fail_silently=False)
        logger.info("SMTP email sent to %s subject='%s' sent=%s", to_email, subject, sent)
        return bool(sent)
    except Exception as exc:
        logger.exception("send_mail failed to %s: %s", to_email, exc)
        return False


class ProcessIncidentsWebhookView(APIView):
    authentication_classes = []  # Disable JWT auth — we use Bearer webhook secret, not JWT
    permission_classes = [AllowAny]

    def post(self, request):
        auth_header = request.headers.get("Authorization")
        expected_secret = os.getenv("PULSECHECK_WEBHOOK_SECRET") or getattr(settings, "PULSECHECK_WEBHOOK_SECRET", "")

        # Require secret if configured — missing/invalid => 401 (don't silently allow)
        if expected_secret:
            if auth_header != f"Bearer {expected_secret}":
                logger.warning("Webhook unauthorized: bad Authorization header")
                return Response({"error": "Unauthorized"}, status=401)
        else:
            logger.warning("PULSECHECK_WEBHOOK_SECRET not set — webhook is open (set env var in Render + Supabase)")

        sites = Site.objects.filter(is_active=True)
        config = Configuration.load()
        alert_email = config.alert_email if config.alert_email else settings.ALERT_EMAIL

        processed_count = 0
        new_incidents = 0
        resolved_incidents = 0

        for site in sites:
            latest_check = Check.objects.filter(site=site).order_by("-checked_at").first()
            if not latest_check:
                logger.info("No checks for site %s (%s) — skipping", site.name, site.id)
                continue

            processed_count += 1

            # Atomic per site to avoid duplicate incidents on concurrent webhooks
            with transaction.atomic():
                active_incident = (
                    Incident.objects.select_for_update()
                    .filter(site=site, resolved_at__isnull=True)
                    .order_by("-started_at")
                    .first()
                )

                # Use the check's timestamp as the incident boundary (not "now")
                check_time = latest_check.checked_at or timezone.now()

                # DOWN -> open incident if none active
                if latest_check.status == "down" and not active_incident:
                    incident = Incident.objects.create(site=site, started_at=check_time)
                    new_incidents += 1
                    logger.info(
                        "INCIDENT OPENED site=%s check_id=%s status=%s status_code=%s started_at=%s",
                        site.name,
                        latest_check.id,
                        latest_check.status,
                        latest_check.status_code,
                        incident.started_at.isoformat(),
                    )

                    subject = f"🚨 UPTIME ALERT: {site.name} is DOWN"
                    text = (
                        f"PulseCheck monitoring detected {site.name} ({site.url}) is DOWN.\n\n"
                        f"Status: {latest_check.status} | HTTP: {latest_check.status_code} | "
                        f"Response time: {latest_check.response_time}ms\n"
                        f"Checked at: {check_time.isoformat()}\n"
                        f"Incident #{incident.id} opened at {incident.started_at.isoformat()}\n\n"
                        f"Check dashboard: {getattr(settings, 'FRONTEND_URL', '')}"
                    )
                    html = (
                        f"<h2>🚨 {site.name} is DOWN</h2>"
                        f"<p><strong>URL:</strong> <a href='{site.url}'>{site.url}</a><br>"
                        f"<strong>Status:</strong> {latest_check.status}<br>"
                        f"<strong>HTTP code:</strong> {latest_check.status_code or '—'}<br>"
                        f"<strong>Checked at:</strong> {check_time.isoformat()}</p>"
                        f"<p>Incident #{incident.id} opened. Respond immediately.</p>"
                    )
                    _send_email(alert_email, subject, text, html=html)

                # UP -> resolve active incident
                elif latest_check.status == "up" and active_incident:
                    # Don't resolve if check is older than incident start (stale data)
                    active_incident.resolved_at = check_time
                    active_incident.save(update_fields=["resolved_at"])
                    resolved_incidents += 1
                    duration = active_incident.resolved_at - active_incident.started_at
                    logger.info(
                        "INCIDENT RESOLVED site=%s incident_id=%s duration=%s resolved_at=%s",
                        site.name,
                        active_incident.id,
                        str(duration),
                        active_incident.resolved_at.isoformat(),
                    )

                    subject = f"✅ RECOVERY: {site.name} is UP"
                    text = (
                        f"PulseCheck confirms {site.name} ({site.url}) is back UP.\n\n"
                        f"Incident #{active_incident.id} resolved.\n"
                        f"Downtime: {duration} (from {active_incident.started_at.isoformat()} to {active_incident.resolved_at.isoformat()})\n"
                        f"HTTP: {latest_check.status_code} | Response time: {latest_check.response_time}ms\n"
                    )
                    html = (
                        f"<h2>✅ {site.name} is back UP</h2>"
                        f"<p>Incident #{active_incident.id} resolved.</p>"
                        f"<p><strong>Downtime:</strong> {duration}<br>"
                        f"<strong>URL:</strong> <a href='{site.url}'>{site.url}</a><br>"
                        f"<strong>HTTP code:</strong> {latest_check.status_code or '—'}</p>"
                    )
                    _send_email(alert_email, subject, text, html=html)

                else:
                    logger.debug(
                        "No incident transition site=%s status=%s active_incident=%s",
                        site.name,
                        latest_check.status,
                        bool(active_incident),
                    )

        logger.info(
            "Webhook processed=%s new=%s resolved=%s alert_email=%s",
            processed_count,
            new_incidents,
            resolved_incidents,
            alert_email,
        )
        return Response(
            {
                "status": "success",
                "processed": processed_count,
                "new_incidents": new_incidents,
                "resolved_incidents": resolved_incidents,
            }
        )
