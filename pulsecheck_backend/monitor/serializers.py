from rest_framework import serializers
from .models import Site, Check, Incident


class CheckSerializer(serializers.ModelSerializer):
    class Meta:
        model = Check
        fields = ['status', 'response_time', 'checked_at']


class IncidentSerializer(serializers.ModelSerializer):
    site_name = serializers.CharField(source='site.name', read_only=True)

    class Meta:
        model = Incident
        fields = ['id', 'site', 'site_name', 'started_at', 'resolved_at']


class SiteSerializer(serializers.ModelSerializer):
    status = serializers.SerializerMethodField()
    responseTime = serializers.SerializerMethodField()
    lastChecked = serializers.SerializerMethodField()
    history = serializers.SerializerMethodField()
    uptime = serializers.SerializerMethodField()
    incidents = serializers.SerializerMethodField()

    class Meta:
        model = Site
        fields = [
            'id', 'name', 'url', 'created_at', 'slug', 'check_interval',
            'status', 'responseTime', 'lastChecked', 'history', 'uptime', 'incidents'
        ]
        read_only_fields = ['slug']

    # ------------------------------------------------------------------
    # Helpers — cache the latest check per instance so the six get_*
    # methods never duplicate the same query.
    # ------------------------------------------------------------------

    def _get_latest_check(self, obj):
        """Return the most recent Check for *obj* (from prefetched data)."""
        if not hasattr(obj, '_prefetched_latest_check'):
            checks = getattr(obj, '_prefetched_checks', None)
            if checks is not None:
                obj._prefetched_latest_check = (
                    max(checks, key=lambda c: c.checked_at) if checks else None
                )
            else:
                obj._prefetched_latest_check = (
                    Check.objects.filter(site=obj).order_by('-checked_at').first()
                )
        return obj._prefetched_latest_check

    def _get_checks(self, obj):
        """Return the full prefetched Check queryset/list."""
        checks = getattr(obj, '_prefetched_checks', None)
        if checks is not None:
            return checks
        return list(Check.objects.filter(site=obj).order_by('-checked_at'))

    # ------------------------------------------------------------------
    # Serialised fields
    # ------------------------------------------------------------------

    def get_status(self, obj):
        latest = self._get_latest_check(obj)
        return latest.status if latest else "pending"

    def get_responseTime(self, obj):
        latest = self._get_latest_check(obj)
        if latest and latest.response_time is not None:
            return int(latest.response_time)
        return None

    def get_lastChecked(self, obj):
        latest = self._get_latest_check(obj)
        if latest:
            return latest.checked_at.isoformat()
        return None

    def get_history(self, obj):
        checks = self._get_checks(obj)
        recent = sorted(checks, key=lambda c: c.checked_at)[:20]
        return [1 if c.status == "up" else 0 for c in reversed(recent)]

    def get_uptime(self, obj):
        checks = self._get_checks(obj)
        if not checks:
            return 100.0
        up_count = sum(1 for c in checks if c.status == "up")
        return round((up_count / len(checks)) * 100, 2)

    def get_incidents(self, obj):
        incidents = getattr(obj, '_prefetched_incidents', None)
        if incidents is not None:
            return sum(1 for i in incidents if i.resolved_at is None)
        return Incident.objects.filter(site=obj, resolved_at__isnull=True).count()


class StatusSummarySerializer(serializers.ModelSerializer):
    """Public /status hub list serializer.

    Uses prefetched data from the view to avoid N+1 queries.  Each site
    gets its latest Check and active incident count from the bulk-loaded
    prefetch, so the entire paginated response is just a few DB queries.
    """

    status = serializers.SerializerMethodField()
    uptime = serializers.SerializerMethodField()
    is_up = serializers.SerializerMethodField()
    responseTime = serializers.SerializerMethodField()
    lastChecked = serializers.SerializerMethodField()
    activeIncidents = serializers.SerializerMethodField()

    class Meta:
        model = Site
        fields = [
            'name', 'slug', 'url',
            'status', 'uptime', 'is_up',
            'responseTime', 'lastChecked', 'activeIncidents',
        ]

    def _latest(self, obj):
        """Get the latest check from prefetched data (no extra query)."""
        if not hasattr(obj, '_latest_check'):
            checks = getattr(obj, '_prefetched_checks', None)
            if checks is not None:
                obj._latest_check = (
                    max(checks, key=lambda c: c.checked_at) if checks else None
                )
            else:
                obj._latest_check = (
                    Check.objects.filter(site=obj).order_by('-checked_at').first()
                )
        return obj._latest_check

    def _checks(self, obj):
        """Get all prefetched checks (no extra query)."""
        checks = getattr(obj, '_prefetched_checks', None)
        if checks is not None:
            return checks
        return list(Check.objects.filter(site=obj).order_by('-checked_at'))

    def get_status(self, obj):
        latest = self._latest(obj)
        return latest.status if latest else 'pending'

    def get_is_up(self, obj):
        latest = self._latest(obj)
        return (latest.status == 'up') if latest else False

    def get_responseTime(self, obj):
        latest = self._latest(obj)
        if latest and latest.response_time is not None:
            return int(latest.response_time)
        return None

    def get_lastChecked(self, obj):
        latest = self._latest(obj)
        if latest:
            return latest.checked_at.isoformat()
        return None

    def get_uptime(self, obj):
        checks = self._checks(obj)
        if not checks:
            return 100.0
        up_count = sum(1 for c in checks if c.status == 'up')
        return round((up_count / len(checks)) * 100, 2)

    def get_activeIncidents(self, obj):
        incidents = getattr(obj, '_prefetched_incidents', None)
        if incidents is not None:
            return len(incidents)
        return Incident.objects.filter(site=obj, resolved_at__isnull=True).count()
