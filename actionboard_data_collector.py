import aiohttp
import asyncio
from tqdm.asyncio import tqdm_asyncio
from datetime import datetime, timezone
import json
import os
from typing import Dict, List, Set, Any, Optional

# Environment variables
GITHUB_TOKEN = os.getenv("GITHUB_TOKEN", "")
ORG_NAME = os.getenv("GITHUB_ORG", "")
BASE_URL = "https://api.github.com"
HEADERS = {
    "Authorization": f"Bearer {GITHUB_TOKEN}",
    "Accept": "application/vnd.github+json",
}

# Data storage
workflow_runs_data: List[Dict[str, Any]] = []
failed_runs_data: List[Dict[str, Any]] = []
daily_usage_data: Dict[str, Dict[str, float]] = {}
processed_run_ids: Set[int] = set()
remaining_api_calls = 0

def load_existing_data(file_path: str, expected_type: type = dict) -> Any:
    """Load existing data from a file or return an empty instance of the expected type."""
    if os.path.exists(file_path):
        try:
            with open(file_path, "r") as f:
                data = json.load(f)
                if isinstance(data, expected_type):
                    return data
                if expected_type is dict and isinstance(data, list):
                    return {
                        item["date"]: {
                            "Ubuntu": item.get("Ubuntu", 0),
                            "Windows": item.get("Windows", 0),
                            "MacOS": item.get("MacOS", 0),
                            "Self-hosted": item.get("Self-hosted", 0),
                            "Total": item.get("Total", 0),
                        }
                        for item in data
                        if "date" in item
                    }
        except (json.JSONDecodeError, KeyError, TypeError) as e:
            print(f"Error: Invalid format in {file_path}. {e}. Returning empty {expected_type.__name__}.")
    return expected_type()

async def fetch_run_timing(repo_name: str, owner: str, run_id: int, session: aiohttp.ClientSession) -> Optional[Dict[str, Any]]:
    """Fetch timing data for a single workflow run."""
    url = f"{BASE_URL}/repos/{owner}/{repo_name}/actions/runs/{run_id}/timing"
    data, _ = await fetch(session, url)
    return data

def save_data(file_path, data):
    """Save data to a file."""
    try:
        with open(file_path, "w") as f:
            json.dump(data, f, indent=2)
    except Exception as e:
        print(f"Error saving data to {file_path}: {e}")


async def fetch_all_pages(session: aiohttp.ClientSession, url: str, key: Optional[str] = None) -> List[Dict[str, Any]]:
    """Fetch all paginated data for a given URL."""
    data = []
    while url:
        response_data, next_url = await fetch(session, url)
        if response_data:
            if key and isinstance(response_data, dict):
                data.extend(response_data.get(key, []))
            elif not key:
                data.extend(response_data if isinstance(response_data, list) else [response_data])
            url = next_url
        else:
            break
    return data

def get_dynamic_time_limit():
    """Get the dynamic time limit based on the last processed run."""
    time_limit_path = "data/last_processed_time.json"
    last_processed_time = load_existing_data(time_limit_path, expected_type=dict)
    if last_processed_time:
        return last_processed_time.get("last_processed_time", datetime.combine(datetime.now(timezone.utc).date(), datetime.min.time()).isoformat())
    return datetime.combine(datetime.now(timezone.utc).date(), datetime.min.time()).isoformat()


async def fetch(session, url):
    """Make a GET request and log errors."""
    global remaining_api_calls
    for attempt in range(3):  # Retry mechanism
        async with session.get(url, headers=HEADERS) as response:
            if response.status == 200:
                remaining_api_calls = response.headers.get('X-RateLimit-Remaining', remaining_api_calls)
                json_data = await response.json()
                next_url = response.links.get("next", {}).get("url")
                return json_data, next_url
            else:
                try:
                    error_message = await response.json()
                    print(f"Error fetching {url}: {response.status} - {error_message.get('message', 'No message provided')}")
                except Exception:
                    # Fall back if the response body is not JSON
                    print(f"Error fetching {url}: {response.status} - {response.reason}")

        await asyncio.sleep(2 ** attempt)  # Exponential backoff
    print(f"Failed to fetch {url} after 3 retries.")
    return None, None


async def fetch_run_timing(repo_name, owner, run_id, session):
    """Fetch timing data for a single workflow run."""
    url = f"{BASE_URL}/repos/{owner}/{repo_name}/actions/runs/{run_id}/timing"
    async with session.get(url, headers=HEADERS) as response:
        if response.status == 200:
            return await response.json()
        else:
            print(f"Error fetching timing data for {repo_name}, run ID {run_id}: {response.status} - {response.reason}")
            return None

async def fetch_workflow_runs(repo_name: str, owner: str, session: aiohttp.ClientSession, time_limit: str) -> List[Dict[str, Any]]:
    """Fetch workflow runs created within the time limit."""
    url = f"{BASE_URL}/repos/{owner}/{repo_name}/actions/runs?per_page=100&created=>{time_limit}"
    return await fetch_all_pages(session, url, "workflow_runs")


async def process_repository(repo: Dict[str, Any], org_name: str, session: aiohttp.ClientSession, time_limit: str) -> None:
    """Process a single repository to fetch workflow runs and timing data."""
    global workflow_runs_data, daily_usage_data, processed_run_ids

    repo_name = repo["name"]
    runs = await fetch_workflow_runs(repo_name, org_name, session, time_limit)

    for run in runs:
        run_id = run["id"]
        if run_id in processed_run_ids:
            continue

        processed_run_ids.add(run_id)
        created_date = run["created_at"][:10]

        if created_date not in daily_usage_data:
            daily_usage_data[created_date] = {
                "Ubuntu": 0, "Windows": 0, "MacOS": 0, 
                "Self-hosted": 0, "Total": 0
            }

        # Fetch timing data for the run
        timing_data = await fetch_run_timing(repo_name, org_name, run_id, session)
        
        billable_time = {"Ubuntu": 0, "Windows": 0, "MacOS": 0}
        total_billable_time = 0
        run_duration_ms = 0
        
        if timing_data:
            run_duration_ms = timing_data.get("run_duration_ms", 0)
            run_duration_minutes = round(run_duration_ms / (1000 * 60), 2) if run_duration_ms else 0
            
            # Process billable time if present
            if "billable" in timing_data:
                for os_name, os_data in timing_data["billable"].items():
                    minutes = os_data["total_ms"] / (1000 * 60)  # Convert ms to minutes
                    os_key = os_name.capitalize()
                    billable_time[os_key] = round(minutes, 2)
                    daily_usage_data[created_date][os_key] += round(minutes, 2)
                    total_billable_time += minutes

            # Determine if this is a self-hosted run
            # If there's run duration but no billable time, it must be self-hosted
            is_self_hosted = bool(run_duration_ms and total_billable_time == 0)
            
            # Update daily totals
            if is_self_hosted:
                daily_usage_data[created_date]["Self-hosted"] += run_duration_minutes
            else:
                daily_usage_data[created_date]["Total"] += round(total_billable_time, 2)

        # Store comprehensive run data
        run_data = {
            "repo": repo_name,
            "workflow_name": run["name"],
            "run_id": run_id,
            "status": run["conclusion"] or run["status"],
            "created_at": run["created_at"],
            "updated_at": run["updated_at"],
            "html_url": run["html_url"],
            "head_branch": run["head_branch"],
            "head_sha": run["head_sha"],
            "run_attempt": run["run_attempt"],
            "run_started_at": run["run_started_at"],
            "workflow_id": run["workflow_id"],
            "runner_name": run.get("runner_name", ""),
            "is_self_hosted": bool(run_duration_ms and total_billable_time == 0),
            "billable_time": billable_time,
            "total_billable_time": round(total_billable_time, 2),
            "run_duration_minutes": (
                round(run_duration_ms / (1000 * 60), 2) 
                if run_duration_ms and total_billable_time == 0  # Only for self-hosted
                else 0
            ),
            "run_duration_ms": run_duration_ms,
        }

        workflow_runs_data.append(run_data)

def validate_and_save_daily_trend():
    """Validate and save the daily trend data, merging with existing data."""
    existing_data = load_existing_data("data/daily_trend.json", expected_type=list)

    # Convert existing data to a dictionary for easier merging
    existing_data_dict = {
        entry["date"]: entry for entry in existing_data
    }

    # Update only with new data
    for date, new_usage in daily_usage_data.items():
        if date in existing_data_dict:
            # Add only the new data to existing values
            for os in ["Ubuntu", "Windows", "MacOS", "Self-hosted"]:
                existing_data_dict[date][os] = (
                    existing_data_dict[date].get(os, 0) +
                    max(0, new_usage.get(os, 0) - existing_data_dict[date].get(os, 0))
                )
        else:
            # Add a new date entry
            existing_data_dict[date] = {"date": date, **new_usage}

        # Recalculate Total excluding Self-hosted
        existing_data_dict[date]["Total"] = sum(
            existing_data_dict[date].get(os, 0)
            for os in ["Ubuntu", "Windows", "MacOS"]
        )

    # Sort and convert the merged data back to a list
    validated_daily_trend = [
        {"date": date, **usage}
        for date, usage in sorted(existing_data_dict.items())
    ]

    save_data("data/daily_trend.json", validated_daily_trend)

def save_last_processed_time(latest_time):
    """Save the latest processed time to a file."""
    save_data("data/last_processed_time.json", {"last_processed_time": latest_time})

async def main() -> None:
    if not GITHUB_TOKEN or not ORG_NAME:
        print("Error: GITHUB_TOKEN and GITHUB_ORG environment variables must be set")
        return

    # Load existing data
    global workflow_runs_data, daily_usage_data, processed_run_ids
    workflow_runs_data = load_existing_data("data/workflow_runs.json", expected_type=list)
    daily_usage_data = load_existing_data("data/daily_trend.json", expected_type=dict)
    processed_run_ids = set(load_existing_data("data/processed_run_ids.json", expected_type=list))

    TIME_LIMIT = get_dynamic_time_limit()
    print(f"Fetching runs created after: {TIME_LIMIT}")

    async with aiohttp.ClientSession() as session:
        print(f"Fetching repositories...")
        repositories = await fetch_all_pages(session, f"{BASE_URL}/orgs/{ORG_NAME}/repos?per_page=100")

        if not repositories:
            print("No repositories found")
            return

        save_data("data/repo_count.json", {"repo_count": len(repositories)})
        
        print(f"Processing {len(repositories)} repositories...")
        tasks = [process_repository(repo, ORG_NAME, session, TIME_LIMIT) 
                for repo in repositories]

        for task in tqdm_asyncio.as_completed(tasks, total=len(repositories)):
            await task

    # Save all data
    save_data("data/workflow_runs.json", workflow_runs_data)
    save_data("data/daily_trend.json", [
        {"date": date, **usage} 
        for date, usage in sorted(daily_usage_data.items())
    ])
    save_data("data/processed_run_ids.json", list(processed_run_ids))

    if workflow_runs_data:
        latest_run_time = max(run["created_at"] for run in workflow_runs_data)
        save_last_processed_time(latest_run_time)

    print(f"Remaining API calls: {remaining_api_calls}")

if __name__ == "__main__":
    asyncio.run(main())
