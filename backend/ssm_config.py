"""
ssm_config.py
Fetch secrets dari AWS SSM Parameter Store saat startup.
Fallback ke environment variable jika SSM tidak tersedia.

Semua parameter disimpan di prefix: /portal-report/<KEY>
"""

import os
import logging

logger = logging.getLogger(__name__)

# SSM prefix — bisa di-override via env var
SSM_PREFIX = os.getenv("SSM_PREFIX", "/portal-report")

# Cache hasil fetch agar tidak hit SSM setiap request
_cache: dict = {}
_loaded: bool = False


def _load_from_ssm():
    """Fetch semua parameter /portal-report/* sekaligus (lebih efisien)."""
    global _loaded
    try:
        import boto3
        region  = os.getenv("AWS_REGION", "ap-southeast-1")
        session = boto3.Session(region_name=region)
        ssm     = session.client("ssm")

        paginator = ssm.get_paginator("get_parameters_by_path")
        for page in paginator.paginate(
            Path=SSM_PREFIX,
            WithDecryption=True,
            Recursive=False,
        ):
            for param in page.get("Parameters", []):
                # /portal-report/SECRET_KEY → SECRET_KEY
                key = param["Name"].replace(SSM_PREFIX + "/", "")
                _cache[key] = param["Value"]

        _loaded = True
        logger.info(f"SSM: loaded {len(_cache)} parameters from {SSM_PREFIX}")
    except ImportError:
        logger.warning("SSM: boto3 not installed — using env vars only")
        _loaded = True
    except Exception as e:
        logger.warning(f"SSM: failed to load ({e}) — falling back to env vars")
        _loaded = True


def get_secret(key: str, default: str = "") -> str:
    """
    Ambil secret dengan prioritas:
      1. SSM Parameter Store  (/portal-report/<key>)
      2. Environment variable (<key>)
      3. default value
    """
    global _loaded
    if not _loaded:
        _load_from_ssm()

    # SSM cache
    if key in _cache:
        return _cache[key]

    # Env var fallback
    return os.getenv(key, default)


def load_all_into_env():
    """
    Load semua SSM secrets dan inject ke os.environ
    sehingga library lain (boto3, smtp, dll) otomatis dapat nilai yang benar.
    Dipanggil sekali di awal startup app.py dan celery_worker.py.
    """
    global _loaded
    if not _loaded:
        _load_from_ssm()

    for key, value in _cache.items():
        # Nilai non-kosong di .env boleh menjadi fallback/override eksplisit.
        # Namun variabel kosong dari template .env tidak boleh memblokir SSM.
        if not os.environ.get(key):
            os.environ[key] = value

    logger.info("SSM: all secrets injected into os.environ")
