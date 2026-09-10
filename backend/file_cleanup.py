"""
file_cleanup.py
Utility untuk cleanup file output yang sudah lebih dari RETENTION_DAYS hari.
Dipanggil dari setiap task setelah generate file.
"""
import os
from datetime import datetime, timedelta


RETENTION_DAYS = int(os.getenv("FILE_RETENTION_DAYS", "60"))


def cleanup_old_files(directory: str, prefix: str, extension: str, log=None, days: int = None):
    """
    Hapus file di `directory` yang:
      - nama diawali `prefix`
      - berekstensi `extension` (e.g. ".pptx", ".docx", ".txt")
      - usianya lebih dari `days` hari berdasarkan tanggal modifikasi file
        (default: RETENTION_DAYS dari env, default 60 hari = ~2 bulan)

    File yang belum melewati batas retention TIDAK akan dihapus.
    """
    def _log(msg):
        if log:
            log(msg)

    retention = days if days is not None else RETENTION_DAYS
    cutoff    = datetime.now() - timedelta(days=retention)
    deleted   = 0
    kept      = 0

    try:
        if not os.path.isdir(directory):
            return 0

        for fname in os.listdir(directory):
            if not fname.startswith(prefix):
                continue
            if not fname.lower().endswith(extension.lower()):
                continue

            fpath = os.path.join(directory, fname)
            try:
                mtime    = datetime.fromtimestamp(os.path.getmtime(fpath))
                age_days = (datetime.now() - mtime).days
                if mtime < cutoff:
                    os.remove(fpath)
                    _log(f"Auto-deleted (age={age_days}d > {retention}d): {fname}")
                    deleted += 1
                else:
                    kept += 1
            except Exception as e:
                _log(f"Cleanup skip {fname}: {e}")

        if deleted > 0:
            _log(f"Cleanup: deleted {deleted} file(s), kept {kept} file(s) (retention={retention} days)")

    except Exception as e:
        _log(f"Cleanup error: {e}")

    return deleted
