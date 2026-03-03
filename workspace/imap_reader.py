
import imaplib
import email
import os
import datetime

def get_emails_from_last_hour(username, password, imap_server='imap.mail.me.com'):
    actionable_emails = []
    try:
        mail = imaplib.IMAP4_SSL(imap_server)
        mail.login(username, password)
        mail.select('INBOX')

        # Calculate time for last hour
        time_ago = datetime.datetime.now() - datetime.timedelta(hours=1)
        since_date = time_ago.strftime("%d-%b-%Y %H:%M:%S")

        # Search for emails in the last hour
        status, email_ids = mail.search(None, 'SINCE', f'"{since_date}"')
        if status != 'OK':
            print(f"Error searching emails: {status}")
            return actionable_emails

        for email_id in email_ids[0].split():
            status, msg_data = mail.fetch(email_id, '(RFC822)')
            if status != 'OK':
                print(f"Error fetching email {email_id}: {status}")
                continue

            raw_email = msg_data[0][1]
            msg = email.message_from_bytes(raw_email)

            subject = msg['Subject']
            sender = msg['From']
            email_date = msg['Date']

            # Basic filtering for non-automated, non-promotional content
            # This is a heuristic and can be improved with more rules
            lower_subject = subject.lower()
            if any(keyword in lower_subject for keyword in ['newsletter', 'promotion', ' desconto', 'update', 'alert', 'shipping', 'invoice', 'receipt', 'job alert', 'fwd:', 're:']):
                continue
            if 'noreply' in sender.lower() or 'mailer-daemon' in sender.lower():
                continue

            body = ""
            if msg.is_multipart():
                for part in msg.walk():
                    ctype = part.get_content_type()
                    cdisposition = part.get('Content-Disposition')

                    if ctype == 'text/plain' and 'attachment' not in (cdisposition or ''):
                        body = part.get_payload(decode=True).decode(errors='ignore')
                        break
            else:
                body = msg.get_payload(decode=True).decode(errors='ignore')

            if body:
                actionable_emails.append({
                    'subject': subject,
                    'sender': sender,
                    'date': email_date,
                    'body': body.strip()
                })
        mail.logout()
    except Exception as e:
        print(f"IMAP operation failed: {e}")
    return actionable_emails

if __name__ == "__main__":
    # In a real scenario, use environment variables or a secure configuration for credentials
    # For now, these are placeholders. The agent requires credentials to be provided.
    IMAP_USERNAME = os.getenv('IMAP_USERNAME') 
    IMAP_PASSWORD = os.getenv('IMAP_PASSWORD')

    if not IMAP_USERNAME or not IMAP_PASSWORD:
        print("IMAP_USERNAME and IMAP_PASSWORD environment variables must be set.")
    else:
        print(f"Checking for emails for {IMAP_USERNAME}...")
        emails = get_emails_from_last_hour(IMAP_USERNAME, IMAP_PASSWORD)
        if emails:
            print("\n--- Actionable IMAP Emails (bscinc@me.com) ---")
            for mail in emails:
                print(f"From: {mail['sender']}")
                print(f"Subject: {mail['subject']}")
                print(f"Date: {mail['date']}")
                print("Body Preview:")
                print(mail['body'][:400] + ('...' if len(mail['body']) > 400 else ''))
                print("-" * 20)
            print("These emails require manual action by Brandon.")
        else:
            print("No new actionable IMAP emails found in the last hour for bscinc@me.com.")
