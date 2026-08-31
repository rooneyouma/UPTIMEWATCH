import statistics
from datetime import timedelta

from django.db.models import Prefetch
from django.utils import timezone
from rest_framework.decorators import action
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import ModelViewSet, ReadOnlyModelViewSet

from .models import Check, Configuration, Incident, Site
from .serializers import (
    CheckSerializer,
    IncidentSerializer,
    SiteSerializer,
    StatusSummarySerializer,
)

# ---------------------------------------------------------------------------
# Prefetch helpers
# ---------------------------------------------------------------------------

def _latest_checks_prefetch(limit=20):
    """Bulk-load the *limit* most-recent checks per site (newest-first)."""
    return Prefetch(
        "check_set",
        queryset=Check.objects.order_by("-checked_at")[:limit],
        to_attr="_prefetched_checks",
    )


def _active_incidents_prefetch():
    """Bulk-load only unresolved incidents per site."""
    return Prefetch(
        "incident_set",
        queryset=Incident.objects.filter(resolved_at__isnull=True),
        to_attr="_prefetched_incidents",
    )


# ---------------------------------------------------------------------------
# Pagination
# ---------------------------------------------------------------------------

class StatusPagePagination(PageNumberPagination):
    """Paginate the /api/status/ list at 5 per page."""
    page_size = 5
    page_size_query_param = "page_size"
    max_page_size = 20

    def get_paginated_response(self, data):
        return Response({
            "count": self.page.paginator.count,
            "total_pages": self.page.paginator.num_pages,
            "current_page": self.page.number,
            "next": self.get_next_link(),
            "previous": self.get_previous_link(),
            "results": data,
        })


# ---------------------------------------------------------------------------
# ViewSets
# ---------------------------------------------------------------------------

class SiteViewSet(ModelViewSet):
    serializer_class = SiteSerializer

    def get_queryset(self):
        return (
            Site.objects.all()
            .order_by("-created_at")
            .prefetch_related(
                _latest_checks_prefetch(),
                _active_incidents_prefetch(),
            )
        )

    @action(detail=True, methods=["get"])
    def checks(self, request, pk=None):
        site = self.get_object()
        checks = Check.objects.filter(site=site)
        serializer = CheckSerializer(checks, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=["get"])
    def incidents(self, request, pk=None):
        site = self.get_object()
        incidents = Incident.objects.filter(site=site)
        serializer = IncidentSerializer(incidents, many=True)
        return Response(serializer.data)


class IncidentViewSet(ModelViewSet):
    queryset = Incident.objects.all().order_by("-started_at")
    serializer_class = IncidentSerializer


# ---------------------------------------------------------------------------
# Time-range helpers
# ---------------------------------------------------------------------------

_RANGE_MAP = {
    "1h": timedelta(hours=1),
    "6h": timedelta(hours=6),
    "24h": timedelta(hours=24),
    "7d": timedelta(days=7),
    "30d": timedelta(days=30),
}


def _compute_analytics(checks, incidents):
    """Derive analytics from a list of Check / Incident objects."""
    n = len(checks)

    # Response-time stats (only from checks that have a response_time)
    rt_values = [c.response_time for c in checks if c.response_time is not None]
    avg_rt = round(statistics.mean(rt_values), 1) if rt_values else None
    p50 = round(statistics.median(rt_values), 1) if rt_values else None
    p95 = (
        round(sorted(rt_values)[int(len(rt_values) * 0.95)], 1)
        if len(rt_values) >= 2
        else avg_rt
    )

    up_count = sum(1 for c in checks if c.status == "up")
    uptime = round((up_count / n) * 100, 2) if n else 100.0

    return {
        "total_checks": n,
        "uptime": uptime,
        "avg_response_time": avg_rt,
        "p50_response_time": p50,
        "p95_response_time": p95,
        "incident_count": len(incidents),
    }


class StatusPageViewSet(ReadOnlyModelViewSet):
    """Public status page API.

    retrieve() returns a rich payload including analytics, response-time
    history, and incident history.  Supports ``?range=<1h|6h|24h|7d|30d>``
    query parameter (default 24h) to control the time window.

    list() is server-side paginated at 5 per page (configurable via
    ``?page_size=<n>``).
    """

    permission_classes = [AllowAny]
    lookup_field = "slug"
    pagination_class = StatusPagePagination

    def get_queryset(self):
        return Site.objects.filter(is_active=True).order_by("-created_at")

    def get_serializer_class(self):
        if self.action == "list":
            return StatusSummarySerializer
        return SiteSerializer

    # ------------------------------------------------------------------

    def list(self, request, *args, **kwargs):
        """Override list to attach prefetch data before serialization."""
        queryset = self.filter_queryset(
            self.get_queryset()
            .prefetch_related(
                _latest_checks_prefetch(limit=20),
                _active_incidents_prefetch(),
            )
        )
        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    def retrieve(self, request, *args, **kwargs):
        site = self.get_object()

        # --- time range ------------------------------------------------
        range_key = request.query_params.get("range", "24h")
        delta = _RANGE_MAP.get(range_key, timedelta(hours=24))
        since = timezone.now() - delta

        # --- fetch checks in range (newest first) ----------------------
        checks = list(
            Check.objects.filter(site=site, checked_at__gte=since)
            .order_by("-checked_at")
        )

        # --- fetch ALL checks for lifetime uptime calc -----------------
        total_up = Check.objects.filter(site=site, status="up").count()
        total_checks_all = Check.objects.filter(site=site).count()
        lifetime_uptime = (
            round((total_up / total_checks_all) * 100, 2)
            if total_checks_all
            else 100.0
        )

        # --- incidents in range ----------------------------------------
        incidents = list(
            Incident.objects.filter(site=site, started_at__gte=since).order_by(
                "-started_at"
            )
        )

        # --- analytics -------------------------------------------------
        analytics = _compute_analytics(checks, incidents)
        analytics["lifetime_uptime"] = lifetime_uptime

        # --- chart data (chronological for charts) ---------------------
        checks_chrono = list(reversed(checks))  # oldest → newest
        response_time_chart = [
            {
                "time": c.checked_at.isoformat(),
                "value": c.response_time,
                "status": c.status,
            }
            for c in checks_chrono
            if c.response_time is not None
        ]
        uptime_chart = [
            {"time": c.checked_at.isoformat(), "status": c.status}
            for c in checks_chrono
        ]

        # --- incident timeline -----------------------------------------
        incident_timeline = [
            {
                "id": inc.id,
                "started_at": inc.started_at.isoformat(),
                "resolved_at": inc.resolved_at.isoformat() if inc.resolved_at else None,
                "duration_seconds": (
                    int((inc.resolved_at - inc.started_at).total_seconds())
                    if inc.resolved_at
                    else None
                ),
            }
            for inc in incidents
        ]

        # --- latest check ----------------------------------------------
        latest = checks[0] if checks else None

        return Response(
            {
                "site_name": site.name,
                "slug": site.slug,
                "url": site.url,
                "is_up": latest.status == "up" if latest else False,
                "last_checked": latest.checked_at.isoformat() if latest else None,
                "check_interval": site.check_interval,
                # analytics
                "analytics": analytics,
                # chart data
                "response_time_chart": response_time_chart,
                "uptime_chart": uptime_chart,
                # incidents
                "incident_timeline": incident_timeline,
                # range metadata
                "range": range_key,
                "range_since": since.isoformat(),
            }
        )


# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------

class AlertEmailView(APIView):
    def get(self, request):
        config = Configuration.load()
        return Response(
            {
                "alert_email": config.alert_email,
                "check_interval": config.check_interval,
            }
        )

    def post(self, request):
        email = request.data.get("alert_email", "")
        config = Configuration.load()
        if email:
            config.alert_email = email
        config.save()
        return Response({"alert_email": config.alert_email})
