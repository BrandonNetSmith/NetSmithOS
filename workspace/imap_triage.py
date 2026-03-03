#!/usr/bin/env python3
"""
imap_triage.py — iCloud IMAP triage for bscinc@me.com
Searches INBOX for emails received in the last hour, filters out
non-actionable content, and surfaces legitimate emails requiring
manual action by Brandon.

Credentials loaded from ~/steelclaw/.env (ICLOUD_IMAP_PASSWORD).
"""

import imaplib
import email
import email.utils
import os
import sys
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path


# ── Configuration ─────────────────────────────────────────────────────────────
IMAP_SERVER    = "imap.mail.me.com"
IMAP_PORT      = 993
EMAIL_ACCOUNT  = "bscinc@me.com"
LOOKBACK_HOURS = 1


# ── Credential loader ──────────────────────────────────────────────────────────
def load_password():
    """Load ICLOUD_IMAP_PASSWORD from env or from ~/steelclaw/.env file."""
    pwd = os.environ.get("ICLOUD_IMAP_PASSWORD")
    if pwd:
        return pwd.strip()

    env_path = Path.home() / "steelclaw" / ".env"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            line = line.strip()
            if line.startswith("#") or "=" not in line:
                continue
            key, _, val = line.partition("=")
            if key.strip() == "ICLOUD_IMAP_PASSWORD":
                return val.strip()

    raise RuntimeError(
        "ICLOUD_IMAP_PASSWORD not found. "
        "Set it in ~/steelclaw/.env or export it as an env var."
    )


# ── Filtering heuristics ───────────────────────────────────────────────────────

SUBJECT_SPAM_PATTERNS = re.compile(
    r"newsletter|unsubscribe|job alert|job opportunity|promotion|promo|"
    r"discount|% off|sale|deal|offer expires|marketing|digest|weekly update|"
    r"monthly update|noreply|no-reply|auto.?generated|automated|"
    r"do not reply|shipping update|order confirm|invoice|receipt|"
    r"account statement|billing statement|your bill|password reset|"
    r"verify your|confirm your|activate your|welcome to|subscription",
    re.IGNORECASE,
)

SENDER_SPAM_PATTERNS = re.compile(
    r"noreply|no-reply|donotreply|do-not-reply|mailer-daemon|"
    r"notifications?@|alerts?@|updates?@|info@|support@|help@|"
    r"billing@|payments?@|newsletter@|news@|marketing@|promo@|"
    r"automated@|system@|admin@|postmaster@|bounce@|daemon@",
    re.IGNORECASE,
)

AUTOMATED_HEADERS = {
    "X-Mailer": re.compile(
        r"MailChimp|Constant Contact|SendGrid|Marketo|HubSpot|"
        r"Salesforce|Campaign Monitor|ActiveCampaign|Klaviyo|"
        r"Mailgun|Mandrill|SparkPost|Amazon SES",
        re.IGNORECASE,
    ),
    "List-Unsubscribe": re.compile(r".+"),
    "X-Spam-Status":    re.compile(r"Yes", re.IGNORECASE),
    "Precedence":       re.compile(r"bulk|list|junk", re.IGNORECASE),
    "Auto-Submitted":   re.compile(r"auto-generated|auto-replied", re.IGNORECASE),
}


def is_actionable(msg):
    subject = msg.get("Subject", "") or ""
    sender  = msg.get("From",    "") or ""

    if SUBJECT_SPAM_PATTERNS.search(subject):
        return False, "subject match: " + subject[:60]

    if SENDER_SPAM_PATTERNS.search(sender):
        return False, "sender pattern: " + sender[:60]

    for header, pattern in AUTOMATED_HEADERS.items():
        val = msg.get(header, "")
        if val and pattern.search(val):
            return False, header + ": " + val[:60]

    return True, ""


def extract_body(msg):
    plain = ""
    html  = ""

    if msg.is_multipart():
        for part in msg.walk():
            ctype       = part.get_content_type()
            disposition = part.get("Content-Disposition", "") or ""
            if "attachment" in disposition:
                continue
            if ctype == "text/plain" and not plain:
                try:
                    plain = part.get_payload(decode=True).decode(errors="replace")
                except Exception:
                    pass
            elif ctype == "text/html" and not html:
                try:
                    html = part.get_payload(decode=True).decode(errors="replace")
                except Exception:
                    pass
    else:
        try:
            raw = msg.get_payload(decode=True)
            if raw:
                plain = raw.decode(errors="replace")
        except Exception:
            pass

    if plain:
        return plain.strip()

    if html:
        text = re.sub(r"<[^>]+>", " ", html)
        text = re.sub(r"[ \t]+", " ", text)
        text = re.sub(r"\n{3,}", "\n\n", text)
        return text.strip()

    return "(no readable body)"


def extract_raw_from_fetch(data):
    """
    imaplib.fetch returns a list that may contain tuples or literal bytes/strings.
    This helper robustly extracts the RFC822 bytes from the response.
    """
    for item in data:
        if isinstance(item, tuple) and len(item) == 2:
            raw = item[1]
            if isinstance(raw, bytes):
                return raw
            if isinstance(raw, str):
                return raw.encode()
    return None


# ── Main triage logic ──────────────────────────────────────────────────────────

def triage_icloud():
    password = load_password()

    mail = imaplib.IMAP4_SSL(IMAP_SERVER, IMAP_PORT)
    try:
        mail.login(EMAIL_ACCOUNT, password)
    except imaplib.IMAP4.error as e:
        print("[ERROR] IMAP login failed: " + str(e), file=sys.stderr)
        sys.exit(1)

    mail.select("INBOX")

    now_utc    = datetime.now(timezone.utc)
    cutoff_utc = now_utc - timedelta(hours=LOOKBACK_HOURS)

    # IMAP SINCE has date-only granularity; go back an extra day to be safe
    since_date      = (cutoff_utc - timedelta(days=1)).strftime("%d-%b-%Y")
    status, ids_raw = mail.search(None, "SINCE", since_date)

    if status != "OK" or not ids_raw[0]:
        mail.logout()
        return []

    email_ids = ids_raw[0].split()
    print("[iCloud Triage] Found " + str(len(email_ids)) + " candidate(s) since " + since_date + ", filtering ...")

    actionable = []

    for eid in email_ids:
        try:
            status, data = mail.fetch(eid, "(RFC822)")
            if status != "OK" or not data:
                continue

            raw = extract_raw_from_fetch(data)
            if not raw:
                continue

            msg = email.message_from_bytes(raw)
        except Exception as e:
            print("[WARN] Could not fetch/parse email id " + str(eid) + ": " + str(e), file=sys.stderr)
            continue

        # Precise timestamp filter
        date_str = msg.get("Date", "")
        try:
            msg_dt = email.utils.parsedate_to_datetime(date_str)
            if msg_dt.tzinfo is None:
                msg_dt = msg_dt.replace(tzinfo=timezone.utc)
            if msg_dt < cutoff_utc:
                continue
        except Exception:
            pass  # Include if date unparseable

        ok, _ = is_actionable(msg)
        if not ok:
            continue

        actionable.append({
            "from":       msg.get("From",       "(unknown)"),
            "to":         msg.get("To",         "(unknown)"),
            "subject":    msg.get("Subject",    "(no subject)"),
            "date":       msg.get("Date",       "(unknown)"),
            "message_id": msg.get("Message-ID", ""),
            "body":       extract_body(msg),
        })

    mail.logout()
    return actionable


# ── Output ─────────────────────────────────────────────────────────────────────

DIVIDER = "=" * 70

def print_report(emails):
    if not emails:
        print(
            "\n[iCloud Triage] No actionable emails found for "
            + EMAIL_ACCOUNT
            + " in the last "
            + str(LOOKBACK_HOURS)
            + "h.\n"
        )
        return

    print("\n" + DIVIDER)
    print("  MANUAL ACTION REQUIRED — iCloud IMAP Triage (" + EMAIL_ACCOUNT + ")")
    print("  " + str(len(emails)) + " actionable email(s) found in the last " + str(LOOKBACK_HOURS) + "h.")
    print("  These emails require review and response by Brandon.")
    print(DIVIDER + "\n")

    for i, em in enumerate(emails, start=1):
        print("─" * 70)
        print("  EMAIL #" + str(i))
        print("  From    : " + em["from"])
        print("  To      : " + em["to"])
        print("  Subject : " + em["subject"])
        print("  Date    : " + em["date"])
        if em["message_id"]:
            print("  Msg-ID  : " + em["message_id"])
        print("\n  --- Body ---")
        body = em["body"]
        if len(body) > 800:
            print(body[:800])
            print("  ... [truncated — " + str(len(body) - 800) + " more chars]")
        else:
            print(body)
        print()

    print(DIVIDER)
    print("  ACTION REQUIRED: Brandon must manually review and respond to")
    print("  the " + str(len(emails)) + " email(s) listed above at " + EMAIL_ACCOUNT + ".")
    print("  iCloud IMAP does not support automated reply drafting.")
    print(DIVIDER + "\n")


if __name__ == "__main__":
    print("[iCloud Triage] Checking " + EMAIL_ACCOUNT + " — last " + str(LOOKBACK_HOURS) + "h ...")
    results = triage_icloud()
    print_report(results)
