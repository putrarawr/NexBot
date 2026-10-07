"""
GitHub commit fetcher — pulls commits from configured repos and groups them by date.
"""

import json
from datetime import datetime, timezone, timedelta
from typing import Optional

try:
    import requests
except ImportError:
    import urllib.request
    import urllib.error
    import urllib.parse

    class RequestsShimResponse:
        def __init__(self, data_bytes, status_code, headers):
            self._data = data_bytes
            self.status_code = status_code
            self.headers = headers or {}

        def json(self):
            try:
                return json.loads(self._data.decode("utf-8"))
            except Exception:
                return {}

    class RequestsShim:
        @staticmethod
        def get(url, headers=None, params=None, timeout=30):
            if params:
                query_str = urllib.parse.urlencode(params)
                url = f"{url}?{query_str}"
            req_headers = {
                "User-Agent": "NexBot-SIMPKL-Fetcher",
            }
            if headers:
                req_headers.update(headers)
            req = urllib.request.Request(url, headers=req_headers)
            try:
                with urllib.request.urlopen(req, timeout=timeout) as resp:
                    return RequestsShimResponse(resp.read(), resp.status, dict(resp.headers))
            except urllib.error.HTTPError as e:
                return RequestsShimResponse(e.read(), e.code, dict(e.headers))
            except Exception:
                return RequestsShimResponse(b"{}", 500, {})

    requests = RequestsShim

WIB = timezone(timedelta(hours=7))


def fetch_commits(
    repos: list[str],
    authors: list[str],
    since: datetime,
    until: datetime,
    token: Optional[str] = None,
) -> dict[str, list[dict]]:
    """
    Fetch commits from GitHub API for given repos/authors within a date range.
    Returns dict keyed by date string (YYYY-MM-DD) → list of commit info dicts.
    """
    headers = {"Accept": "application/vnd.github.v3+json"}
    if token:
        headers["Authorization"] = f"token {token}"

    commits_by_date: dict[str, list[dict]] = {}

    for repo in repos:
        page = 1
        while True:
            url = f"https://api.github.com/repos/{repo}/commits"
            params = {
                "since": since.isoformat(),
                "until": until.isoformat(),
                "per_page": 100,
                "page": page,
            }
            resp = requests.get(url, headers=headers, params=params, timeout=30)

            if resp.status_code == 403:
                remaining = resp.headers.get("X-RateLimit-Remaining", "?")
                reset_ts = resp.headers.get("X-RateLimit-Reset", "")
                reset_str = ""
                if reset_ts:
                    from datetime import datetime as _dt
                    try:
                        reset_time = _dt.fromtimestamp(int(reset_ts), tz=WIB)
                        reset_str = f" (reset jam {reset_time.strftime('%H:%M WIB')})"
                    except Exception:
                        pass
                print(f"\n  [!!] RATE LIMITED oleh GitHub API!{reset_str}")
                print(f"  [!!] Tanpa token: max 60 request/jam.")
                print(f"  [!!] FIX: Buat token di https://github.com/settings/tokens")
                print(f"  [!!]      Lalu isi GITHUB_TOKEN di file .env\n")
                break
            if resp.status_code != 200:
                print(f"  [!] Error fetching {repo}: {resp.status_code}")
                break

            data = resp.json()
            if not data:
                break

            for item in data:
                commit = item["commit"]
                author_login = (item.get("author") or {}).get("login", "")
                author_name = commit["author"]["name"]

                if not _author_matches(author_login, author_name, authors):
                    continue

                commit_dt = _parse_github_date(commit["author"]["date"])
                commit_dt_wib = commit_dt.astimezone(WIB)
                date_key = commit_dt_wib.strftime("%Y-%m-%d")

                entry = {
                    "repo": repo,
                    "sha": item["sha"][:7],
                    "message": commit["message"].split("\n")[0],
                    "author": author_login or author_name,
                    "datetime": commit_dt_wib,
                }

                commits_by_date.setdefault(date_key, []).append(entry)

            page += 1

    for date_key in commits_by_date:
        commits_by_date[date_key].sort(key=lambda c: c["datetime"])

    return commits_by_date


def summarize_commits(commits: list[dict]) -> str:
    """
    Turn a list of commits into a formal Indonesian paragraph for the jurnal.
    Groups by repo, describes what was done.
    """
    if not commits:
        return ""

    by_repo: dict[str, list[str]] = {}
    for c in commits:
        by_repo.setdefault(c["repo"], []).append(c["message"])

    parts = []
    for repo, messages in by_repo.items():
        repo_short = repo.split("/")[-1]
        if len(messages) == 1:
            parts.append(
                f"Melakukan pengembangan pada proyek {repo_short}: {messages[0]}."
            )
        else:
            detail = "; ".join(messages)
            parts.append(
                f"Melakukan pengembangan pada proyek {repo_short} "
                f"dengan rincian pekerjaan sebagai berikut: {detail}."
            )

    return "\n\n".join(parts)


def _author_matches(login: str, name: str, targets: list[str]) -> bool:
    login_lower = login.lower()
    name_lower = name.lower()
    for t in targets:
        t_lower = t.lower()
        if t_lower == login_lower or t_lower == name_lower:
            return True
    return False


def _parse_github_date(date_str: str) -> datetime:
    return datetime.fromisoformat(date_str.replace("Z", "+00:00"))
