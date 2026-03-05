#!/usr/bin/env python3
"""
clickup_notifications.py — ClickUp notification poller for Brandon.

Polls the ClickUp API for:
  1. Tasks assigned to Brandon (by user ID) updated in the last N hours
  2. Tasks mentioning "Brandon" in comments updated in the last N hours
  3. Tasks where Brandon is a watcher

Credentials loaded from ~/steelclaw/.env:
  - CLICKUP_API_TOKEN  (personal API token, starts with pk_)
  - CLICKUP_TEAM_ID    (workspace/team ID)
  - CLICKUP_USER_ID    (Brandon's ClickUp user ID — auto-detected if not set)

Usage:
  python3 clickup_notifications.py [--hours N] [--json] [--quiet]

Returns a concise summary of ClickUp activity relevant to Brandon.
"""

import json
import os
import sys
import time
import argparse
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode


# ── Configuration ─────────────────────────────────────────────────────────────
API_BASE = "https://api.clickup.com/api/v2"
DEFAULT_LOOKBACK_HOURS = 4  # Match email-triage cadence


# ── Credential loader ──────────────────────────────────────────────────────────
def load_env():
    """Load ClickUp credentials from env or ~/steelclaw/.env."""
    env = {}
    keys_needed = ["CLICKUP_API_TOKEN", "CLICKUP_TEAM_ID", "CLICKUP_USER_ID"]

    # Check environment first
    for key in keys_needed:
        val = os.environ.get(key)
        if val:
            env[key] = val.strip()

    # Fall back to .env file
    env_path = Path.home() / "steelclaw" / ".env"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            line = line.strip()
            if line.startswith("#") or "=" not in line:
                continue
            key, _, val = line.partition("=")
            key = key.strip()
            val = val.strip()
            if key in keys_needed and key not in env:
                env[key] = val

    return env


def api_get(endpoint, token, params=None):
    """Make a GET request to the ClickUp API."""
    url = f"{API_BASE}{endpoint}"
    if params:
        url += "?" + urlencode(params, doseq=True)

    req = Request(url)
    req.add_header("Authorization", token)
    req.add_header("Content-Type", "application/json")

    try:
        with urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode())
    except HTTPError as e:
        body = e.read().decode() if e.readable() else ""
        return {"error": f"HTTP {e.code}: {e.reason}", "detail": body}
    except URLError as e:
        return {"error": f"Connection error: {e.reason}"}
    except Exception as e:
        return {"error": str(e)}


def get_authorized_user(token):
    """Get the authenticated user's info (to auto-detect user ID)."""
    return api_get("/user", token)


def get_teams(token):
    """Get all teams/workspaces the user belongs to."""
    return api_get("/team", token)


def get_assigned_tasks(token, team_id, user_id, since_ms):
    """Get tasks assigned to user updated since a given timestamp."""
    params = {
        "assignees[]": [user_id],
        "date_updated_gt": str(since_ms),
        "subtasks": "true",
        "include_closed": "true",
        "order_by": "updated",
        "reverse": "true",
        "page": "0",
    }
    return api_get(f"/team/{team_id}/task", token, params)


def get_task_comments(token, task_id):
    """Get comments on a specific task."""
    return api_get(f"/task/{task_id}/comment", token)


def format_task(task):
    """Format a task into a readable summary line."""
    name = task.get("name", "Untitled")
    status = task.get("status", {}).get("status", "unknown")
    priority = task.get("priority")
    priority_str = priority.get("priority", "none") if priority else "none"
    url = task.get("url", "")

    # Assignees
    assignees = [a.get("username", a.get("email", "?")) for a in task.get("assignees", [])]
    assignee_str = ", ".join(assignees) if assignees else "unassigned"

    # Due date
    due = task.get("due_date")
    due_str = ""
    if due:
        try:
            due_dt = datetime.fromtimestamp(int(due) / 1000, tz=timezone.utc)
            due_str = f" | Due: {due_dt.strftime('%Y-%m-%d')}"
        except (ValueError, TypeError):
            pass

    # Date updated
    updated = task.get("date_updated")
    updated_str = ""
    if updated:
        try:
            updated_dt = datetime.fromtimestamp(int(updated) / 1000, tz=timezone.utc)
            updated_str = f" | Updated: {updated_dt.strftime('%Y-%m-%d %H:%M UTC')}"
        except (ValueError, TypeError):
            pass

    return (
        f"• [{status.upper()}] {name}\n"
        f"  Priority: {priority_str} | Assigned: {assignee_str}{due_str}{updated_str}\n"
        f"  {url}"
    )


def filter_mentions_brandon(tasks, token):
    """Check task comments for mentions of 'Brandon'. Returns list of (task, comment_snippets)."""
    mentions = []
    for task in tasks:
        task_id = task.get("id")
        if not task_id:
            continue
        comments_resp = get_task_comments(token, task_id)
        if "error" in comments_resp:
            continue
        relevant_comments = []
        for comment in comments_resp.get("comments", []):
            text = comment.get("comment_text", "")
            if "brandon" in text.lower():
                user = comment.get("user", {}).get("username", "unknown")
                snippet = text[:200] + ("..." if len(text) > 200 else "")
                relevant_comments.append(f"  💬 {user}: {snippet}")
        if relevant_comments:
            mentions.append((task, relevant_comments))
    return mentions


def run(hours=DEFAULT_LOOKBACK_HOURS, output_json=False, quiet=False):
    """Main execution."""
    env = load_env()

    token = env.get("CLICKUP_API_TOKEN")
    if not token:
        msg = (
            "ERROR: CLICKUP_API_TOKEN not found.\n"
            "To set up ClickUp integration:\n"
            "1. Go to ClickUp > Settings > Apps > Generate API Token\n"
            "2. Add to ~/steelclaw/.env:\n"
            "   CLICKUP_API_TOKEN=pk_YOUR_TOKEN_HERE\n"
            "   CLICKUP_TEAM_ID=YOUR_WORKSPACE_ID\n"
        )
        if output_json:
            print(json.dumps({"error": "CLICKUP_API_TOKEN not configured", "setup_instructions": msg}))
        else:
            print(msg)
        return 1

    # Auto-detect user ID if not set
    user_id = env.get("CLICKUP_USER_ID")
    if not user_id:
        if not quiet:
            print("Auto-detecting ClickUp user ID...", file=sys.stderr)
        user_resp = get_authorized_user(token)
        if "error" in user_resp:
            print(f"ERROR: Could not get user info: {user_resp['error']}", file=sys.stderr)
            return 1
        user_id = str(user_resp.get("user", {}).get("id", ""))
        if not user_id:
            print("ERROR: Could not determine user ID from API response.", file=sys.stderr)
            return 1
        if not quiet:
            username = user_resp.get("user", {}).get("username", "unknown")
            print(f"Detected user: {username} (ID: {user_id})", file=sys.stderr)

    # Auto-detect team ID if not set
    team_id = env.get("CLICKUP_TEAM_ID")
    if not team_id:
        if not quiet:
            print("Auto-detecting ClickUp team/workspace ID...", file=sys.stderr)
        teams_resp = get_teams(token)
        if "error" in teams_resp:
            print(f"ERROR: Could not get teams: {teams_resp['error']}", file=sys.stderr)
            return 1
        teams = teams_resp.get("teams", [])
        if not teams:
            print("ERROR: No teams/workspaces found.", file=sys.stderr)
            return 1
        team_id = str(teams[0].get("id", ""))
        if not quiet:
            team_name = teams[0].get("name", "unknown")
            print(f"Using workspace: {team_name} (ID: {team_id})", file=sys.stderr)

    # Calculate lookback timestamp
    since = datetime.now(timezone.utc) - timedelta(hours=hours)
    since_ms = int(since.timestamp() * 1000)

    if not quiet:
        print(f"Fetching ClickUp activity for last {hours}h...", file=sys.stderr)

    # 1. Get tasks assigned to Brandon, recently updated
    assigned_resp = get_assigned_tasks(token, team_id, user_id, since_ms)
    if "error" in assigned_resp:
        print(f"ERROR fetching assigned tasks: {assigned_resp['error']}", file=sys.stderr)
        assigned_tasks = []
    else:
        assigned_tasks = assigned_resp.get("tasks", [])

    # 2. Get ALL recently updated tasks (to scan for Brandon mentions)
    all_updated_params = {
        "date_updated_gt": str(since_ms),
        "subtasks": "true",
        "include_closed": "true",
        "order_by": "updated",
        "reverse": "true",
        "page": "0",
    }
    all_updated_resp = api_get(f"/team/{team_id}/task", token, all_updated_params)
    if "error" in all_updated_resp:
        all_updated_tasks = []
    else:
        all_updated_tasks = all_updated_resp.get("tasks", [])

    # Find tasks NOT already in assigned list that mention Brandon
    assigned_ids = {t.get("id") for t in assigned_tasks}
    other_tasks = [t for t in all_updated_tasks if t.get("id") not in assigned_ids]

    # Check comments for Brandon mentions (limit to avoid API rate limits)
    mention_tasks = []
    if other_tasks:
        # Only check first 25 to avoid rate limits
        check_limit = min(len(other_tasks), 25)
        if not quiet:
            print(f"Scanning {check_limit} tasks for Brandon mentions...", file=sys.stderr)
        mention_tasks = filter_mentions_brandon(other_tasks[:check_limit], token)

    # Build output
    if output_json:
        result = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "lookback_hours": hours,
            "assigned_tasks": [
                {
                    "id": t.get("id"),
                    "name": t.get("name"),
                    "status": t.get("status", {}).get("status"),
                    "priority": (t.get("priority") or {}).get("priority"),
                    "url": t.get("url"),
                    "due_date": t.get("due_date"),
                    "date_updated": t.get("date_updated"),
                }
                for t in assigned_tasks
            ],
            "mention_tasks": [
                {
                    "id": t.get("id"),
                    "name": t.get("name"),
                    "url": t.get("url"),
                    "comments": comments,
                }
                for t, comments in mention_tasks
            ],
        }
        print(json.dumps(result, indent=2))
    else:
        lines = []
        lines.append(f"📋 ClickUp Activity Summary (last {hours}h)")
        lines.append(f"   Generated: {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}")
        lines.append("")

        if assigned_tasks:
            lines.append(f"🎯 Tasks Assigned to You ({len(assigned_tasks)} updated):")
            for task in assigned_tasks:
                lines.append(format_task(task))
                lines.append("")
        else:
            lines.append("🎯 Tasks Assigned to You: None updated recently.")
            lines.append("")

        if mention_tasks:
            lines.append(f"💬 Tasks Mentioning Brandon ({len(mention_tasks)}):")
            for task, comments in mention_tasks:
                lines.append(format_task(task))
                for c in comments:
                    lines.append(c)
                lines.append("")
        else:
            lines.append("💬 Tasks Mentioning Brandon: None found.")
            lines.append("")

        total = len(assigned_tasks) + len(mention_tasks)
        if total == 0:
            lines.append("✅ No ClickUp activity requiring attention.")
        else:
            lines.append(f"📊 Total items requiring attention: {total}")

        print("\n".join(lines))

    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Poll ClickUp for Brandon's notifications")
    parser.add_argument("--hours", type=int, default=DEFAULT_LOOKBACK_HOURS,
                        help=f"Lookback period in hours (default: {DEFAULT_LOOKBACK_HOURS})")
    parser.add_argument("--json", action="store_true",
                        help="Output as JSON instead of human-readable text")
    parser.add_argument("--quiet", action="store_true",
                        help="Suppress progress messages on stderr")
    args = parser.parse_args()

    sys.exit(run(hours=args.hours, output_json=args.json, quiet=args.quiet))
