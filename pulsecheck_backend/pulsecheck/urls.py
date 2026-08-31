from django.contrib import admin
import os
import time
from django.urls import path, include
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

SECRET_ADMIN_PATH = os.getenv('ADMIN_URL', 'admin/').strip('/')

_start_time = time.time()


@csrf_exempt
def health_check(request):
    """Health check endpoint for cron-job.org keep-alive (Render + Supabase).

    - No auth / No CSRF — public GET/HEAD only.
    - Hits `SELECT 1` on the DB — this single query keeps both Render
      (HTTP hit) and Supabase (DB activity = prevents 7-day pause) alive.
    - Returns 200 when DB reachable, 503 otherwise.
    - cron-job.org: set to GET every 10-14 min (Render sleeps after 15 min).
    """
    status_code = 200
    db_status = "connected"

    try:
        from django.db import connection
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
    except Exception as e:
        status_code = 503
        db_status = f"disconnected: {type(e).__name__}"

    # HEAD support: cron-job.org / UptimeRobot sometimes use HEAD
    if request.method == "HEAD":
        resp = JsonResponse({}, status=status_code)
        resp["X-DB-Status"] = db_status
        resp["Cache-Control"] = "no-store, no-cache, must-revalidate"
        return resp

    resp = JsonResponse(
        {
            "status": "healthy" if status_code == 200 else "degraded",
            "db": db_status,
            "uptime_seconds": int(time.time() - _start_time),
        },
        status=status_code,
    )
    # Prevent CDN / proxy caching of health checks
    resp["Cache-Control"] = "no-store, no-cache, must-revalidate"
    resp["Pragma"] = "no-cache"
    return resp


urlpatterns = [
    # Both with and without trailing slash — prevents 301 redirect that
    # blocks cron-job.org keep-alive pings.
    path('health/', health_check, name='health_check'),
    path('health', health_check, name='health_check_no_slash'),
    # Duplicate under /api/ namespace so cron-job.org can hit either.
    path('api/health/', health_check, name='api_health_check'),
    path('api/health', health_check, name='api_health_check_no_slash'),
    path(f'{SECRET_ADMIN_PATH}/', admin.site.urls),
    path('api/', include('monitor.urls')),

    path('api/token/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
]
