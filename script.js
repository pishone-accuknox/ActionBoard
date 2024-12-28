let currentTheme = "light";
let doughnutChartInstance = null; // Track the doughnut chart instance
let trendChartInstance = null; // Track the trend chart instance

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
  const trendData = await fetchData('data/daily_trend.json');
  const dateFilter = document.getElementById('dateFilter').value;

  // Aggregate workflows by name and repo
  const aggregatedData = workflowData.reduce((acc, run) => {
    const date = run.created_at.split("T")[0];
    if ((!dateFilter || date === dateFilter) && run.total_time_minutes > 0) {
      const key = `${run.repo} - ${run.workflow_name}`;
      acc[key] = (acc[key] || 0) + run.total_time_minutes;
    }
    return acc;
  }, {});

  const sortedData = Object.entries(aggregatedData)
    .sort(([, a], [, b]) => b - a)
    .reduce((acc, [key, value]) => {
      acc.labels.push(key);
      acc.data.push(value);
      return acc;
    }, { labels: [], data: [] });

  // Doughnut Chart for Workflow Time Analysis
  const doughnutChartCtx = document.getElementById('workflowBarChart').getContext('2d');
  if (doughnutChartInstance) doughnutChartInstance.destroy(); // Clear existing chart
  doughnutChartInstance = new Chart(doughnutChartCtx, {
    type: 'doughnut',
    data: {
      labels: sortedData.labels,
      datasets: [{
        label: 'Billable Time (minutes)',
        data: sortedData.data,
        backgroundColor: sortedData.labels.map(
          () => `hsl(${Math.random() * 360}, 70%, 70%)`
        ), // Random colors for each segment
      }],
    },
    options: {
      responsive: true,
      plugins: {
        legend: {
          display: true,
          position: 'right',
        },
        tooltip: {
          callbacks: {
            label: function (context) {
              const value = context.raw;
              const total = context.dataset.data.reduce((sum, val) => sum + val, 0);
              const percentage = ((value / total) * 100).toFixed(2);
              return `${context.label}: ${value} minutes (${percentage}%)`;
            },
          },
        },
      },
    },
  });

  // Compact Daily Trend Line Chart
  const trendChartCtx = document.getElementById('trendChart').getContext('2d');
  if (trendChartInstance) trendChartInstance.destroy(); // Clear existing chart
  trendChartInstance = new Chart(trendChartCtx, {
    type: 'line',
    data: {
      labels: trendData.map(item => item.date),
      datasets: [{
        label: 'Daily Runtime Trend (minutes)',
        data: trendData.map(item => item.totalMinutes),
        borderColor: 'rgba(153, 102, 255, 0.8)',
        fill: false,
        tension: 0.4, // Smooth curves
      }],
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
      },
    }
  });
}

async function loadFailures() {
  const failuresData = await fetchData('data/failed_runs.json');
  const failuresTableBody = document.querySelector('#failuresTable tbody');
  failuresTableBody.innerHTML = ''; // Clear existing rows

  failuresData.forEach(run => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${run.repo}</td>
      <td>${run.workflow_name}</td>
      <td><a href="${run.html_url}" target="_blank">View Run</a></td>
    `;
    failuresTableBody.appendChild(row);
  });
}

function toggleTheme() {
  currentTheme = currentTheme === "light" ? "dark" : "light";
  document.body.className = currentTheme;
}

// Initial Load
loadTimeAnalysis();
loadFailures();
