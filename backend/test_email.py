"""
Test kirim email — jalankan dari dalam container:
  docker exec automation-hub-worker-1 python3 /app/test_email.py
"""
import os, sys
sys.path.insert(0, "/app")

from email_helper import send_report_email
from datetime import datetime

print("Testing email configuration...")
print(f"  SMTP_HOST: {os.getenv('SMTP_HOST','not set')}")
print(f"  SMTP_PORT: {os.getenv('SMTP_PORT','not set')}")
print(f"  SMTP_USER: {os.getenv('SMTP_USER','not set')}")
print(f"  SMTP_PASS: {'***SET***' if os.getenv('SMTP_PASS') and os.getenv('SMTP_PASS') != 'YOUR_APP_PASSWORD_HERE' else 'NOT SET!'}")
print(f"  EMAIL_TO:  {os.getenv('EMAIL_TO','not set')}")
print()

to = [os.getenv("EMAIL_TO", "suhendi@icscompute.com")]
ok = send_report_email(
    to=to,
    subject=f"[TEST] Portal Report Email Test — {datetime.now().strftime('%Y-%m-%d %H:%M')}",
    body=(
        f"Ini adalah email test dari Portal Report.\n\n"
        f"Jika Anda menerima email ini, konfigurasi SMTP sudah benar.\n\n"
        f"Sent at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} WIB\n"
        f"From: noreply@icscompute.com\n"
        f"To: {', '.join(to)}\n\n"
        f"-- Portal Report · ICS Compute --"
    ),
)
print()
print("Result:", "✅ EMAIL SENT SUCCESSFULLY" if ok else "❌ EMAIL FAILED")
