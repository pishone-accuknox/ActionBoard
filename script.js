let currentTheme = "light";
let barChartInstance = null;
let trendChartInstance = null;

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
  
  const dateFilter = Array.from(document.getElementById('dateFilter').selectedOptions).map(
    option => option.value
  );

  // Populate the date filter dropdown dynamically
  const uniqueDates = [...new Set(workflowData.map(run => run.created_at.split("T")[0]))];
  const dateFilterElement = document.getElementById('dateFilter');
  if (dateFilterElement.options.length === 0) {
    uniqueDates.forEach(date => {
      const option = document.createElement('option');
      option.value = date;
      option.textContent = date;
      dateFilterElement.appendChild(option);
    });
  }

  // Aggregate workflows by name and repo
  const aggregatedData = workflowData.reduce((acc, run) => {
    const date = run.created_at.split("T")[0];
    if ((!dateFilter.length || dateFilter.includes(date)) && run.total_time_minutes > 0) {
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

  // Horizontal Bar Chart for Workflow Time Analysis
  const barChartCtx = document.getElementById('workflowBarChart').getContext('2d');
  if (barChartInstance) barChartInstance.destroy(); // Clear existing chart
  barChartInstance = new Chart(barChartCtx, {
    type: 'bar',
    data: {
      labels: sortedData.labels,
      datasets: [{
        label: 'Billable Time (minutes)',
        data: sortedData.data,
        backgroundColor: 'rgba(75, 192, 192, 0.5)',
      }],
    },
    options: {
      responsive: true,
      indexAxis: 'y',
      scales: {
        x: { beginAtZero: true },
        y: { beginAtZero: true }
      }
    }
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
