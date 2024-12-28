let currentTheme = "light";

async function fetchData(url) {
  const response = await fetch(url);
  return response.json();
}

function showTab(tabId) {
  document.querySelectorAll('.tab-content').forEach(tab => {
    tab.style.display = tab.id === tabId ? 'block' : 'none';
  });
}

async function loadTimeAnalysis() {
  const workflowData = await fetchData('data/workflow_runs.json');
  const dateFilter = document.getElementById('dateFilter').value;

  const aggregatedData = workflowData.reduce((acc, run) => {
    const date = run.created_at.split("T")[0];
    if (!dateFilter || date === dateFilter) {
      const key = `${run.repo} - ${run.workflow_name}`;
      acc[key] = (acc[key] || 0) + run.total_time_minutes;
    }
    return acc;
  }, {});

  const labels = Object.keys(aggregatedData);
  const data = Object.values(aggregatedData);

  // Bar Chart for Workflow Time Analysis
  const ctx = document.getElementById('workflowBarChart').getContext('2d');
  new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: 'Billable Time (minutes)',
        data,
        backgroundColor: 'rgba(54, 162, 235, 0.5)',
      }],
    },
    options: {
      responsive: true,
      scales: {
        x: { beginAtZero: true },
        y: { beginAtZero: true }
      }
    }
  });
}

async function loadFailures() {
  const failuresData = await fetchData('data/failed_runs.json');
  const failuresTable = document.querySelector('#failuresTable tbody');
  failuresTable.innerHTML = ''; // Clear existing rows

  failuresData.forEach(run => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${run.repo}</td>
      <td>${run.workflow_name}</td>
      <td><a href="${run.html_url}" target="_blank">View Run</a></td>
    `;
    failuresTable.appendChild(row);
  });
}

async function loadTrendGraph() {
  const trendData = await fetchData('data/daily_trend.json');
  const ctx = document.getElementById('trendChart').getContext('2d');

  const labels = trendData.map(item => item.date);
  const data = trendData.map(item => item.totalMinutes);

  new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Daily Runtime Trend (minutes)',
        data,
        borderColor: 'blue',
        fill: false,
      }]
    }
  });
}

function toggleTheme() {
  currentTheme = currentTheme === "light" ? "dark" : "light";
  document.body.className = currentTheme;
}

// Initial Load
loadTimeAnalysis();
loadFailures();
loadTrendGraph();
