"""
email_helper.py
Kirim email dengan attachment file laporan.

Config via environment variables:
  SMTP_HOST     — SMTP server host (default: smtp.gmail.com)
  SMTP_PORT     — SMTP port (default: 587)
  SMTP_USER     — Email pengirim
  SMTP_PASS     — Password / App Password
  SMTP_FROM     — Display name pengirim (default: Portal Report ICS)
"""
import os
import smtplib
import mimetypes
from email.mime.multipart import MIMEMultipart
from email.mime.text      import MIMEText
from email.mime.base      import MIMEBase
from email               import encoders
from datetime            import datetime


def send_report_email(
    to: list,
    subject: str,
    body: str,
    attachments: list = None,   # list of file paths
    log=None,
):
    """
    Kirim email laporan.

    Parameters
    ----------
    to          : list email penerima, e.g. ["a@b.com", "c@d.com"]
    subject     : judul email
    body        : isi email (plain text)
    attachments : list path file yang akan di-attach (opsional)
    log         : fungsi logging (opsional)
    """
    def _log(msg):
        if log:
            log(msg)
        else:
            print(msg)

    host     = os.getenv("SMTP_HOST", "smtp.gmail.com")
    port     = int(os.getenv("SMTP_PORT", "587"))
    user     = os.getenv("SMTP_USER", "")
    password = os.getenv("SMTP_PASS", "")
    from_name= os.getenv("SMTP_FROM", "Portal Report · ICS Compute")

    if not user or not password:
        _log("ERROR email: SMTP_USER atau SMTP_PASS belum diset di .env")
        return False

    msg = MIMEMultipart()
    msg["From"]    = f"{from_name} <{user}>"
    msg["To"]      = ", ".join(to)
    msg["Subject"] = subject

    # Body email
    msg.attach(MIMEText(body, "plain", "utf-8"))

    # Attachments
    for filepath in (attachments or []):
        if not os.path.exists(filepath):
            _log(f"WARN: attachment tidak ditemukan: {filepath}")
            continue
        mime_type, _ = mimetypes.guess_type(filepath)
        main_type, sub_type = (mime_type or "application/octet-stream").split("/", 1)
        with open(filepath, "rb") as f:
            part = MIMEBase(main_type, sub_type)
            part.set_payload(f.read())
        encoders.encode_base64(part)
        part.add_header(
            "Content-Disposition",
            "attachment",
            filename=os.path.basename(filepath)
        )
        msg.attach(part)
        _log(f"Attached: {os.path.basename(filepath)}")

    try:
        _log(f"Connecting to {host}:{port}...")
        with smtplib.SMTP(host, port, timeout=30) as server:
            server.ehlo()
            server.starttls()
            server.ehlo()
            server.login(user, password)
            server.sendmail(user, to, msg.as_string())
        _log(f"Email sent to: {', '.join(to)}")
        return True
    except Exception as e:
        _log(f"ERROR sending email: {e}")
        return False
