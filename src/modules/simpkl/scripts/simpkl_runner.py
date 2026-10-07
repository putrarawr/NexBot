#!/usr/bin/env python3
"""
SIMPKL CLI Runner for Telegram Integration.
Provides JSON output for fetch, submit, and history actions.
No emojis in output to respect user preference.
"""

import argparse
import json
import os
import sys
from datetime import datetime, timedelta

# Safe zero-dependency .env loader (does not require python-dotenv package)
def _load_env_file(filepath):
    if not os.path.exists(filepath):
        return
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                k = k.strip()
                v = v.strip().strip("'\"")
                if k and k not in os.environ:
                    os.environ[k] = v
    except Exception:
        pass

try:
    from dotenv import load_dotenv
except ImportError:
    load_dotenv = _load_env_file

# Ensure we are in project directory
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
os.chdir(BASE_DIR)

# Load environment variables from all candidate locations
CANDIDATE_ENVS = [
    os.path.join(BASE_DIR, ".env"),
    "/home/putra/Project-Coding/tools-scraping-jurnal/.env",
    os.path.abspath(os.path.join(BASE_DIR, "../../../../.env")),
    os.path.abspath(os.path.join(os.getcwd(), ".env")),
]
for env_file in CANDIDATE_ENVS:
    if os.path.exists(env_file):
        load_dotenv(env_file)

from github_fetcher import fetch_commits, summarize_commits, WIB

# Robust history.json resolution
CANDIDATE_HISTORIES = [
    os.getenv("SIMPKL_HISTORY_FILE", "").strip(),
    os.path.abspath(os.path.join(BASE_DIR, "../../../../data/simpkl_history.json")),
    os.path.abspath(os.path.join(BASE_DIR, "../../../data/simpkl_history.json")),
    os.path.abspath(os.path.join(BASE_DIR, "../../data/simpkl_history.json")),
    os.path.join(BASE_DIR, "history.json"),
    os.path.expanduser("~/Project-Coding/tools-scraping-jurnal/history.json"),
    "/home/putra/Project-Coding/tools-scraping-jurnal/history.json",
]
CANDIDATE_HISTORIES = [h for h in CANDIDATE_HISTORIES if h]
HISTORY_FILE = next((h for h in CANDIDATE_HISTORIES if os.path.exists(h)), os.path.join(BASE_DIR, "history.json"))

def load_history():
    for fpath in [HISTORY_FILE] + CANDIDATE_HISTORIES:
        if os.path.exists(fpath):
            try:
                with open(fpath, "r", encoding="utf-8") as f:
                    content = json.load(f)
                    if isinstance(content, dict) and len(content) > 0:
                        return content
            except Exception:
                pass
    return {}

def save_history(date_str, catatan):
    data = load_history()
    data[date_str] = {
        "catatan": catatan,
        "submitted_at": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    }
    targets = set([HISTORY_FILE, os.path.join(BASE_DIR, "history.json")])
    for cand in CANDIDATE_HISTORIES:
        if os.path.exists(cand) or os.path.basename(cand) in ["simpkl_history.json", "history.json"]:
            targets.add(cand)
    for tgt in targets:
        try:
            os.makedirs(os.path.dirname(tgt), exist_ok=True)
            with open(tgt, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
        except Exception:
            pass

def get_config():
    authors_raw = os.getenv("GITHUB_AUTHORS", "putrarawr,WisWho,Paissaiueo,broiosme,Fais Adhyasta Pratama").strip()
    authors = [a.strip() for a in authors_raw.split(",") if a.strip()]

    username = os.getenv("SIMPKL_USERNAME", "").strip()
    password = os.getenv("SIMPKL_PASSWORD", "").strip()

    if not username or not password:
        candidate_configs = [
            os.path.join(BASE_DIR, "simpkl_auth.json"),
            os.path.abspath(os.path.join(BASE_DIR, "../../../../data/simpkl_auth.json")),
            os.path.abspath(os.path.join(BASE_DIR, "../../../data/simpkl_auth.json")),
            os.path.abspath(os.path.join(BASE_DIR, "../../data/simpkl_auth.json")),
            os.path.abspath(os.path.join(BASE_DIR, "../../../../data/config.json")),
            os.path.abspath(os.path.join(BASE_DIR, "../../../data/config.json")),
            os.path.abspath(os.path.join(BASE_DIR, "../../data/config.json")),
        ]
        for cpath in candidate_configs:
            if os.path.exists(cpath):
                try:
                    with open(cpath, "r", encoding="utf-8") as f:
                        cdata = json.load(f)
                        if not username:
                            username = (cdata.get("simpklUsername") or cdata.get("username") or "").strip()
                        if not password:
                            password = (cdata.get("simpklPassword") or cdata.get("password") or "").strip()
                        if username and password:
                            break
                except Exception:
                    pass

    return {
        "username": username,
        "password": password,
        "github_token": os.getenv("GITHUB_TOKEN", "").strip() or None,
        "repos": [r.strip() for r in os.getenv("GITHUB_REPOS", "putrarawr/cafe-pos").split(",") if r.strip()],
        "authors": authors,
        "chrome_binary": os.getenv("CHROME_BINARY", "").strip() or None,
    }

def action_fetch(date_str):
    try:
        dt = datetime.strptime(date_str, "%Y-%m-%d")
    except ValueError:
        return {"status": "error", "message": "Format tanggal salah. Gunakan YYYY-MM-DD"}

    cfg = get_config()
    since_dt = dt.replace(tzinfo=WIB)
    until_dt = (dt + timedelta(days=1)).replace(tzinfo=WIB)

    commits_by_date = fetch_commits(cfg["repos"], cfg["authors"], since_dt, until_dt, cfg["github_token"])
    commits = commits_by_date.get(date_str, [])
    summary = summarize_commits(commits) if commits else ""

    history = load_history()
    already_submitted = date_str in history
    previous_catatan = history[date_str].get("catatan", "") if already_submitted and isinstance(history[date_str], dict) else ""

    day_names = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"]
    day_name = day_names[dt.weekday()]

    commit_list = [
        {
            "sha": c["sha"][:7],
            "message": c["message"],
            "author": c["author"],
            "repo": c["repo"]
        }
        for c in commits
    ]

    return {
        "status": "success",
        "date": date_str,
        "day": day_name,
        "is_weekend": dt.weekday() >= 5,
        "has_commits": bool(commits),
        "commit_count": len(commits),
        "summary": summary,
        "commits": commit_list,
        "already_submitted": already_submitted,
        "previous_catatan": previous_catatan
    }

def action_history(limit=10):
    data = load_history()
    sorted_dates = sorted(data.keys(), reverse=True)
    results = []
    for d in sorted_dates[:limit]:
        item = data[d]
        catatan = item.get("catatan", "") if isinstance(item, dict) else str(item)
        submitted_at = item.get("submitted_at", "") if isinstance(item, dict) else ""
        results.append({
            "date": d,
            "catatan": catatan,
            "submitted_at": submitted_at
        })
    return {
        "status": "success",
        "total": len(sorted_dates),
        "items": results,
        "all_dates": sorted_dates
    }

def action_submit(date_str, catatan):
    cfg = get_config()
    if not cfg["username"] or not cfg["password"]:
        return {"status": "error", "message": "SIMPKL_USERNAME atau SIMPKL_PASSWORD belum diisi di .env"}

    if not catatan or not catatan.strip():
        return {"status": "error", "message": "Catatan jurnal tidak boleh kosong"}

    try:
        dt = datetime.strptime(date_str, "%Y-%m-%d")
        tanggal_form = dt.strftime("%m/%d/%Y")
    except ValueError:
        return {"status": "error", "message": "Format tanggal salah. Gunakan YYYY-MM-DD"}

    bot = None
    try:
        try:
            from simpkl_bot import SIMPKLBot
        except ImportError as e:
            return {"status": "error", "message": f"Modul browser otomatisasi SIMPKL belum terpasang: {str(e)}"}

        # Headless mode for server / background execution
        bot = SIMPKLBot(chrome_binary=cfg["chrome_binary"], headless=True)
        logged_in = bot.login(cfg["username"], cfg["password"])
        if not logged_in:
            err_msg = getattr(bot, "last_error", "") or "Gagal login ke SIMPKL. Periksa NISN atau password"
            return {"status": "error", "message": err_msg}

        existing_dates = bot.get_existing_dates()
        for d in existing_dates:
            data = load_history()
            if d not in data:
                save_history(d, "Tercatat di SIMPKL")

        ok = bot.submit_jurnal(tanggal_form, catatan.strip())
        if ok:
            save_history(date_str, catatan.strip())
            return {
                "status": "success",
                "message": f"Jurnal {date_str} berhasil tersimpan di SIMPKL",
                "date": date_str,
                "catatan": catatan.strip()
            }
        else:
            return {"status": "error", "message": f"Gagal mengisi form jurnal {date_str} di SIMPKL"}
    except Exception as e:
        return {"status": "error", "message": f"Eksepsi SIMPKL bot: {str(e)}"}
    finally:
        if bot:
            bot.close()

def action_batch_fetch(start_date_str, count=5):
    try:
        start_dt = datetime.strptime(start_date_str, "%Y-%m-%d")
    except ValueError:
        return {"status": "error", "message": "Format tanggal salah. Gunakan YYYY-MM-DD"}

    workdays_dt = []
    curr = start_dt
    while len(workdays_dt) < count:
        if curr.weekday() < 5:
            workdays_dt.append(curr)
        curr += timedelta(days=1)

    end_dt = workdays_dt[-1]
    cfg = get_config()

    since_dt = workdays_dt[0].replace(tzinfo=WIB)
    until_dt = (end_dt + timedelta(days=1)).replace(tzinfo=WIB)

    commits_by_date = fetch_commits(cfg["repos"], cfg["authors"], since_dt, until_dt, cfg["github_token"])
    history = load_history()

    day_names = ["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu", "Minggu"]
    items = []

    for dt in workdays_dt:
        date_str = dt.strftime("%Y-%m-%d")
        commits = commits_by_date.get(date_str, [])
        summary = summarize_commits(commits) if commits else ""
        already_submitted = date_str in history
        prev_catatan = history[date_str].get("catatan", "") if already_submitted and isinstance(history[date_str], dict) else ""

        items.append({
            "date": date_str,
            "day": day_names[dt.weekday()],
            "has_commits": bool(commits),
            "commit_count": len(commits),
            "summary": summary,
            "already_submitted": already_submitted,
            "previous_catatan": prev_catatan
        })

    return {
        "status": "success",
        "start_date": workdays_dt[0].strftime("%Y-%m-%d"),
        "end_date": end_dt.strftime("%Y-%m-%d"),
        "total_days": len(items),
        "items": items
    }

def action_batch_submit(entries):
    if isinstance(entries, str):
        try:
            entries = json.loads(entries)
        except Exception:
            return {"status": "error", "message": "Format JSON entries tidak valid"}

    if not entries or not isinstance(entries, list):
        return {"status": "error", "message": "Daftar entri jurnal kosong"}

    cfg = get_config()
    if not cfg["username"] or not cfg["password"]:
        return {"status": "error", "message": "SIMPKL_USERNAME atau SIMPKL_PASSWORD belum diisi di .env"}

    bot = None
    results = []
    try:
        try:
            from simpkl_bot import SIMPKLBot
        except ImportError as e:
            return {"status": "error", "message": f"Modul browser otomatisasi SIMPKL belum terpasang: {str(e)}"}

        bot = SIMPKLBot(chrome_binary=cfg["chrome_binary"], headless=True)
        logged_in = bot.login(cfg["username"], cfg["password"])
        if not logged_in:
            err_msg = getattr(bot, "last_error", "") or "Gagal login ke SIMPKL. Periksa NISN atau password"
            return {"status": "error", "message": err_msg}

        existing_dates = bot.get_existing_dates()
        for d in existing_dates:
            data = load_history()
            if d not in data:
                save_history(d, "Tercatat di SIMPKL")

        for entry in entries:
            date_str = entry.get("date")
            catatan = entry.get("catatan", "").strip()

            if not date_str or not catatan:
                results.append({"date": date_str, "status": "skipped", "message": "Catatan kosong"})
                continue

            if date_str in existing_dates:
                results.append({"date": date_str, "status": "skipped", "message": "Sudah tercatat sebelumnya"})
                continue

            try:
                dt = datetime.strptime(date_str, "%Y-%m-%d")
                tanggal_form = dt.strftime("%m/%d/%Y")
            except ValueError:
                results.append({"date": date_str, "status": "failed", "message": "Format tanggal salah"})
                continue

            ok = bot.submit_jurnal(tanggal_form, catatan)
            if ok:
                save_history(date_str, catatan)
                results.append({"date": date_str, "status": "success", "message": "Berhasil disubmit"})
            else:
                results.append({"date": date_str, "status": "failed", "message": "Gagal isi form"})

        return {
            "status": "success",
            "total": len(entries),
            "results": results
        }
    except Exception as e:
        return {"status": "error", "message": f"Eksepsi SIMPKL bot: {str(e)}"}
    finally:
        if bot:
            bot.close()

def action_sync():
    """Sync submitted dates directly from SIMPKL portal without submitting."""
    cfg = get_config()
    if not cfg["username"] or not cfg["password"]:
        return {"status": "error", "message": "SIMPKL_USERNAME atau SIMPKL_PASSWORD belum diatur"}

    bot = None
    try:
        try:
            from simpkl_bot import SIMPKLBot
        except ImportError as e:
            return {"status": "error", "message": f"Modul browser otomatisasi SIMPKL belum terpasang: {str(e)}"}

        bot = SIMPKLBot(chrome_binary=cfg["chrome_binary"], headless=True)
        logged_in = bot.login(cfg["username"], cfg["password"])
        if not logged_in:
            err_msg = getattr(bot, "last_error", "") or "Gagal login ke SIMPKL. Periksa NISN atau password"
            return {"status": "error", "message": err_msg}

        existing_dates = bot.get_existing_dates()
        synced_count = 0
        data = load_history()
        for d in existing_dates:
            if d not in data:
                save_history(d, "Tercatat di SIMPKL")
                synced_count += 1

        return {
            "status": "success",
            "message": f"Berhasil sinkronisasi {len(existing_dates)} tanggal dari SIMPKL portal ({synced_count} entri baru)",
            "total_existing": len(existing_dates),
            "synced_new": synced_count,
            "dates": sorted(list(existing_dates))
        }
    except Exception as e:
        return {"status": "error", "message": f"Eksepsi SIMPKL sync: {str(e)}"}
    finally:
        if bot:
            bot.close()

def main():
    parser = argparse.ArgumentParser(description="SIMPKL Runner CLI")
    parser.add_argument("--action", choices=["fetch", "history", "submit", "batch-fetch", "batch-submit", "sync"], required=True)
    parser.add_argument("--date", help="Tanggal format YYYY-MM-DD")
    parser.add_argument("--catatan", help="Isi catatan kegiatan")
    parser.add_argument("--entries", help="JSON array entri untuk batch submit")
    parser.add_argument("--limit", type=int, default=10, help="Limit history")
    parser.add_argument("--count", type=int, default=5, help="Jumlah hari untuk batch fetch")
    parser.add_argument("--username", help="SIMPKL username / NISN")
    parser.add_argument("--password", help="SIMPKL password")

    args = parser.parse_args()

    if args.username:
        os.environ["SIMPKL_USERNAME"] = args.username.strip()
    if args.password:
        os.environ["SIMPKL_PASSWORD"] = args.password.strip()

    if args.action == "fetch":
        if not args.date:
            print(json.dumps({"status": "error", "message": "--date diperlukan"}))
            sys.exit(1)
        res = action_fetch(args.date)
        print(json.dumps(res, ensure_ascii=False))

    elif args.action == "history":
        res = action_history(args.limit)
        print(json.dumps(res, ensure_ascii=False))

    elif args.action == "submit":
        if not args.date or not args.catatan:
            print(json.dumps({"status": "error", "message": "--date dan --catatan diperlukan"}))
            sys.exit(1)
        res = action_submit(args.date, args.catatan)
        print(json.dumps(res, ensure_ascii=False))

    elif args.action == "batch-fetch":
        if not args.date:
            print(json.dumps({"status": "error", "message": "--date diperlukan"}))
            sys.exit(1)
        res = action_batch_fetch(args.date, args.count)
        print(json.dumps(res, ensure_ascii=False))

    elif args.action == "batch-submit":
        if not args.entries:
            print(json.dumps({"status": "error", "message": "--entries diperlukan"}))
            sys.exit(1)
        res = action_batch_submit(args.entries)
        print(json.dumps(res, ensure_ascii=False))

    elif args.action == "sync":
        res = action_sync()
        print(json.dumps(res, ensure_ascii=False))

if __name__ == "__main__":
    main()
