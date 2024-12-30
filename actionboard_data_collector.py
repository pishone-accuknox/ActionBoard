import aiohttp
import asyncio
from tqdm.asyncio import tqdm_asyncio
from datetime import datetime, timezone
import json
import os

# Environment variables
GITHUB_TOKEN = os.getenv("GITHUB_TOKEN", "")
ORG_NAME = os.getenv("GITHUB_ORG", "")
BASE_URL = "https://api.github.com"
HEADERS = {
    "Authorization": f"Bearer {GITHUB_TOKEN}",
    "Accept": "application/vnd.github+json",
}

# Data storage
workflow_runs_data = []
failed_runs_data = []
daily_usage_data = {}
processed_run_ids = set()
remaining_api_calls = 0


def load_existing_data(file_path, expected_type=dict):
    """Load existing data from a file or return an empty instance of the expected type."""
    if os.path.exists(file_path):
        try:
            with open(file_path, "r") as f:
                data = json.load(f)
                if isinstance(data, expected_type):
                    return data
                # Handle list conversion for daily usage
                if expected_type is dict and isinstance(data, list):
                    return {item["date"]: item["totalMinutes"] for item in data if "date" in item and "totalMinutes" in item}
        except (json.JSONDecodeError, KeyError, TypeError) as e:
            print(f"Error: Invalid format in {file_path}. {e}. Returning empty {expected_type.__name__}.")
    return expected_type()  # Return default empty instance


def save_data(file_path, data):
    """Save data to a file."""
    with open(file_path, "w") as f:
        json.dump(data, f, indent=2)


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


async def fetch_workflow_runs(repo_name, owner, session, time_limit):
    """Fetch workflow runs created within the time limit."""
    url = f"{BASE_URL}/repos/{owner}/{repo_name}/actions/runs?per_page=100&created=>{time_limit}"
    runs = []
    while url:
        response_data, next_url = await fetch(session, url)
        if response_data:
            runs.extend(response_data.get("workflow_runs", []))
            url = next_url
        else:
            break
    return runs


async def process_repository(repo, org_name, session, time_limit):
    """Process a single repository to fetch workflow runs and timing data."""
    global processed_run_ids

    repo_name = repo["name"]
    runs = await fetch_workflow_runs(repo_name, org_name, session, time_limit)

    for run in runs:
        if run["id"] in processed_run_ids:
            continue  # Skip already processed runs

        processed_run_ids.add(run["id"])  # Mark as processed
        created_date = run["created_at"][:10]  # Get YYYY-MM-DD
        run_data = {
            "repo": repo_name,
            "workflow_name": run["name"],
            "run_id": run["id"],
            "status": run["conclusion"],
            "created_at": run["created_at"],
            "html_url": run["html_url"],
        }

        if run["conclusion"] == "failure":
            failed_runs_data.append(run_data)

        # Fetch timing data
        timing_data = await fetch_run_timing(repo_name, org_name, run["id"], session)
        if timing_data and "billable" in timing_data:
            total_ms = sum(os_data["total_ms"] for os_data in timing_data["billable"].values())
            total_minutes = round(total_ms / (1000 * 60), 2)
            run_data["total_time_minutes"] = total_minutes
            workflow_runs_data.append(run_data)

            # Update daily usage
            daily_usage_data.setdefault(created_date, 0)
            daily_usage_data[created_date] += total_minutes
        else:
            print(f"Warning: No timing data for run ID {run['id']} in repo {repo_name}")
            run_data["total_time_minutes"] = 0
            workflow_runs_data.append(run_data)

def save_last_processed_time(latest_time):
    """Save the latest processed time to a file."""
    save_data("data/last_processed_time.json", {"last_processed_time": latest_time})

async def main():
    if not GITHUB_TOKEN or not ORG_NAME:
        print("Error: GITHUB_TOKEN and GITHUB_ORG environment variables must be set")
        return

    # Load existing data
    global workflow_runs_data, failed_runs_data, daily_usage_data, processed_run_ids

    workflow_runs_data = load_existing_data("data/workflow_runs.json", expected_type=list)
    failed_runs_data = load_existing_data("data/failed_runs.json", expected_type=list)
    daily_usage_data = load_existing_data("data/daily_trend.json", expected_type=dict)
    processed_run_ids = set(load_existing_data("data/processed_run_ids.json", expected_type=list))

    # Get dynamic TIME_LIMIT
    TIME_LIMIT = get_dynamic_time_limit()

    async with aiohttp.ClientSession() as session:
        print(f"Fetching repositories for organization: {ORG_NAME}")

        # Fetch repositories and process them
        repositories = []
        url = f"{BASE_URL}/orgs/{ORG_NAME}/repos?per_page=100"
        while url:
            response_data, next_url = await fetch(session, url)
            if response_data:
                repositories.extend(response_data)
                url = next_url
            else:
                break

        if not repositories:
            print("No repositories fetched.")
            return

        print(f"Processing repositories...")
        tasks = [process_repository(repo, ORG_NAME, session, TIME_LIMIT) for repo in repositories]
        for task in tqdm_asyncio.as_completed(tasks, total=len(repositories)):
            await task

    # Save updated data
    save_data("data/workflow_runs.json", workflow_runs_data)
    save_data("data/failed_runs.json", failed_runs_data)

    daily_trend = [{"date": date, "totalMinutes": minutes}
                   for date, minutes in sorted(daily_usage_data.items())]
    save_data("data/daily_trend.json", daily_trend)
    save_data("data/processed_run_ids.json", list(processed_run_ids))

    # Save the latest processed time
    if workflow_runs_data:
        latest_run_time = max(run["created_at"] for run in workflow_runs_data)
        save_last_processed_time(latest_run_time)

    print(f"Remaining API calls: {remaining_api_calls}")


if __name__ == "__main__":
    asyncio.run(main())
