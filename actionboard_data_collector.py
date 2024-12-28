import aiohttp
import asyncio
from tqdm.asyncio import tqdm_asyncio
from datetime import datetime, timedelta, date
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

# Time filter for the last day
TIME_LIMIT = (datetime.now() - timedelta(days=1)).isoformat()

# Data storage
workflow_runs_data = []
failed_runs_data = []
daily_usage_data = {}
remaining_api_calls = 0

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


async def fetch_workflow_runs(repo_name, owner, session):
    """Fetch workflow runs created within the time limit."""
    url = f"{BASE_URL}/repos/{owner}/{repo_name}/actions/runs?per_page=100&created=>{TIME_LIMIT}"
    runs = []
    while url:
        response_data, next_url = await fetch(session, url)
        if response_data:
            assert "workflow_runs" in response_data, "API response missing 'workflow_runs'. Check endpoint or permissions."
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
    """Process a single repository to fetch workflow runs and timing data."""
    repo_name = repo["name"]
    runs = await fetch_workflow_runs(repo_name, org_name, session)

    for run in runs:
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


async def main():
    if not GITHUB_TOKEN or not ORG_NAME:
        print("Error: GITHUB_TOKEN and GITHUB_ORG environment variables must be set")
        return
    
    async with aiohttp.ClientSession() as session:
        print(f"Fetching repositories for organization: {ORG_NAME}")

        # Handle pagination for repositories
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
        tasks = [process_repository(repo, ORG_NAME, session) for repo in repositories]
        for task in tqdm_asyncio.as_completed(tasks, total=len(repositories)):
            await task

        # Sort workflow runs by total time
        workflow_runs_data.sort(key=lambda x: x.get("total_time_minutes", 0), reverse=True)

        # Create public/data directory if it doesn't exist
        os.makedirs("public/data", exist_ok=True)

        # Save workflow runs data
        with open("public/data/workflow_runs.json", "w") as f:
            json.dump(workflow_runs_data, f, indent=2)

        # Save failed runs data
        with open("public/data/failed_runs.json", "w") as f:
            json.dump(failed_runs_data, f, indent=2)

        # Save daily usage data
        daily_trend = [{"date": date, "totalMinutes": minutes}
                       for date, minutes in sorted(daily_usage_data.items())]
        with open("public/data/daily_trend.json", "w") as f:
            json.dump(daily_trend, f, indent=2)
        
        print(f"Remaining API calls: {remaining_api_calls}")

if __name__ == "__main__":
    asyncio.run(main())
