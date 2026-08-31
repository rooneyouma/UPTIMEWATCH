"""Management command to prune old Check records.

Usage:
    python manage.py prune_checks              # default: keep 30 days
    python manage.py prune_checks --days 90    # keep 90 days
    python manage.py prune_checks --dry-run    # preview without deleting
"""

from django.core.management.base import BaseCommand
from django.utils import timezone
from datetime import timedelta

from monitor.models import Check


class Command(BaseCommand):
    help = "Delete Check records older than the specified number of days."

    def add_arguments(self, parser):
        parser.add_argument(
            "--days",
            type=int,
            default=30,
            help="Number of days of checks to keep (default: 30).",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show how many records would be deleted without actually deleting.",
        )

    def handle(self, *args, **options):
        days = options["days"]
        dry_run = options["dry_run"]
        cutoff = timezone.now() - timedelta(days=days)

        qs = Check.objects.filter(checked_at__lt=cutoff)
        count = qs.count()

        if count == 0:
            self.stdout.write(self.style.SUCCESS(f"No checks older than {days} days to prune."))
            return

        if dry_run:
            self.stdout.write(
                self.style.WARNING(
                    f"[DRY RUN] Would delete {count} Check records older than {cutoff.isoformat()}."
                )
            )
        else:
            qs.delete()
            self.stdout.write(
                self.style.SUCCESS(f"Deleted {count} Check records older than {days} days.")
            )
