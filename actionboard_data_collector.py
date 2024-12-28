import aiohttp
import asyncio
from tqdm.asyncio import tqdm_asyncio
from datetime import datetime, timedelta, date
import json
import os

GITHUB_TOKEN = ""
ORG_NAME = ""
BASE_URL = "https://api.github.com"

HEADERS = {
    "Authorization": f"Bearer {GITHUB_TOKEN}",
    "Accept": "application/vnd.github+json",
}

# Time filter for the last 2 days
TIME_LIMIT = (datetime.now() - timedelta(days=2)).isoformat()

workflow_runs_data = []
failed_runs_data = []
os_usage_data = {}

async def fetch(session, url):
    """Make a GET request and log errors."""
    async with session.get(url, headers=HEADERS) as response:
        if response.status == 200:
            json_data = await response.json()
            next_url = response.links.get("next", {}).get("url")
            return json_data, next_url
        else:
            print(f"Error fetching {url}: {response.status} - {response.reason}")
    return None, None

async def fetch_workflow_runs(repo_name, owner, session):
    """Fetch workflow runs created within the time limit."""
    url = f"{BASE_URL}/repos/{owner}/{repo_name}/actions/runs?per_page=100&created=>{TIME_LIMIT}"
    runs = []
    while url:
        response_data, next_url = await fetch(session, url)
        if response_data:
            runs.extend(response_data.get("workflow_runs", []))
            url = next_url
        else:
            break
    return runs

async def fetch_run_timing(repo_name, owner, run_id, session):
    """Fetch timing data for a single workflow run."""
    url = f"{BASE_URL}/repos/{owner}/{repo_name}/actions/runs/{run_id}/timing"
    async with session.get(url, headers=HEADERS) as response:
        if response.status == 200:
            return await response.json()
        else:
            print(f"Error fetching timing data for {repo_name}, run ID {run_id}: {response.status} - {response.reason}")
            return None

async def process_repository(repo, org_name, session):
    """Process a single repository to fetch workflow runs and OS-wise usage data."""
    repo_name = repo["name"]
    runs = await fetch_workflow_runs(repo_name, org_name, session)

    for run in runs:
        run_data = {
            "repo": repo_name,
            "workflow_name": run["name"],
            "run_id": run["id"],
            "status": run["conclusion"],
            "created_at": run["created_at"],
            "html_url": run["html_url"],
        }
        workflow_runs_data.append(run_data)

        if run["conclusion"] == "failure":
            failed_runs_data.append(run_data)

        # Fetch timing data and update OS-wise usage
        timing_data = await fetch_run_timing(repo_name, org_name, run["id"], session)
        if timing_data and "billable" in timing_data:
            for os, os_data in timing_data["billable"].items():
                os_usage_data.setdefault(os, 0)
                os_usage_data[os] += os_data.get("total_ms", 0)
            
            total_ms = sum(os_data["total_ms"] for os_data in timing_data["billable"].values())
            run_data["total_time_ms"] = total_ms
            run_data["total_time_minutes"] = round(total_ms / (1000 * 60), 2)
        else:
            run_data["total_time_ms"] = 0
            run_data["total_time_minutes"] = 0.0

async def main():
    async with aiohttp.ClientSession() as session:
        print(f"Fetching repositories for organization: {ORG_NAME}")
        repositories, _ = await fetch(session, f"{BASE_URL}/orgs/{ORG_NAME}/repos?per_page=100")
        if repositories is None:
            print("No repositories fetched.")
            return

        print(f"Processing repositories...")
        tasks = [process_repository(repo, ORG_NAME, session) for repo in repositories]
        await tqdm_asyncio.gather(*tasks)

        # Convert milliseconds to minutes for OS-wise usage data
        os_usage_minutes = {os: round(ms / (1000 * 60), 2) for os, ms in os_usage_data.items()}

        # Save or update usage metrics
        today = str(date.today())
        metrics_path = "usage_metrics.json"
        if os.path.exists(metrics_path):
            with open(metrics_path, "r") as f:
                usage_metrics = json.load(f)
        else:
            usage_metrics = []

        # Check for existing entry for today
        existing_entry = next((entry for entry in usage_metrics if entry["date"] == today), None)
        if existing_entry:
            existing_entry["os_usage"] = os_usage_minutes
        else:
            usage_metrics.append({"date": today, "os_usage": os_usage_minutes})

        with open(metrics_path, "w") as f:
            json.dump(usage_metrics, f, indent=4)

        # Save other data
        workflow_runs_data.sort(key=lambda x: x.get("total_time_ms", 0), reverse=True)
        with open("workflow_runs.json", "w") as f:
            json.dump(workflow_runs_data, f, indent=4)

        with open("failed_runs.json", "w") as f:
            json.dump(failed_runs_data, f, indent=4)


# Run the script
asyncio.run(main())
