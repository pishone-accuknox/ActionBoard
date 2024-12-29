let currentTheme = "light";
let barChartInstance = null;
let trendChartInstance = null;

async function fetchData(url) {
  const response = await fetch(url);
  return response.json();
}

function showTab(tabId) {
  // Hide all tab contents
  document.querySelectorAll('.tab-content').forEach(tab => {
    tab.style.display = tab.id === tabId ? 'block' : 'none';
  });

  // Highlight the active tab
  document.querySelectorAll('.tab-button').forEach(button => {
    button.classList.toggle('active', button.getAttribute('onclick').includes(tabId));
  });
}

async function loadTimeAnalysis() {
  const workflowData = await fetchData('data/workflow_runs.json');
  const trendData = await fetchData('data/daily_trend.json');

  // Get from/to dates and set defaults
  const fromDateInput = document.getElementById('fromDate');
  const toDateInput = document.getElementById('toDate');
  const today = new Date();
  const sevenDaysAgo = new Date(today);
  sevenDaysAgo.setDate(today.getDate() - 7);

  if (!fromDateInput.value) fromDateInput.value = sevenDaysAgo.toISOString().split('T')[0];
  if (!toDateInput.value) toDateInput.value = today.toISOString().split('T')[0];

  const fromDate = new Date(fromDateInput.value);
  const toDate = new Date(toDateInput.value);

  // Filter workflow data by date range
  const aggregatedData = workflowData.reduce((acc, run) => {
    const runDate = new Date(run.created_at.split("T")[0]);
    if (runDate >= fromDate && runDate <= toDate && run.total_time_minutes > 0) {
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
  const failuresContainer = document.getElementById('failuresContainer');
  failuresContainer.innerHTML = ''; // Clear existing content

  // Group failures by date
  const groupedFailures = failuresData.reduce((acc, run) => {
    const date = run.created_at.split('T')[0]; // Extract YYYY-MM-DD
    acc[date] = acc[date] || [];
    acc[date].push(run);
    return acc;
  }, {});

  // Render a collapsible table for each day
  Object.keys(groupedFailures).sort((a, b) => new Date(b) - new Date(a)).forEach(date => {
    // Create a collapsible section
    const section = document.createElement('div');
    section.classList.add('failure-section');

    const toggleButton = document.createElement('button');
    toggleButton.classList.add('toggle-button');
    toggleButton.textContent = `Failures on ${date}`;
    toggleButton.onclick = () => {
      const table = section.querySelector('table');
      table.style.display = table.style.display === 'none' ? 'table' : 'none';
    };

    const table = document.createElement('table');
    table.classList.add('failure-table');
    table.style.display = 'table'; // Visible by default
    table.innerHTML = `
      <thead>
        <tr>
          <th>Repository</th>
          <th>Workflow Name</th>
          <th>Date</th>
          <th>Run Link</th>
        </tr>
      </thead>
      <tbody>
        ${groupedFailures[date]
          .map(run => `
            <tr>
              <td>${run.repo}</td>
              <td>${run.workflow_name}</td>
              <td>${run.created_at.split('T')[0]}</td>
              <td><a href="${run.html_url}" target="_blank">View Run</a></td>
            </tr>
          `)
          .join('')}
      </tbody>
    `;

    section.appendChild(toggleButton);
    section.appendChild(table);
    failuresContainer.appendChild(section);
  });
}

function toggleTheme() {
  const isChecked = document.getElementById("checkboxInput").checked;
  document.body.className = isChecked ? "dark-theme" : "light-theme";
  localStorage.setItem("theme", isChecked ? "dark" : "light");
}

// Load theme preference on page load
window.onload = () => {
  const savedTheme = localStorage.getItem("theme") || "light";
  document.body.className = savedTheme === "dark" ? "dark-theme" : "light-theme";
  document.getElementById("checkboxInput").checked = savedTheme === "dark";
};

// Initial Load
loadTimeAnalysis();
loadFailures();
