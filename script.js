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

  // Highlight the selected tab
  document.querySelectorAll('.tab-button').forEach(button => {
    button.classList.remove('active');
  });
  document.querySelector(`[onclick="showTab('${tabId}')"]`).classList.add('active');

  // Load specific content for the selected tab
  if (tabId === 'time-analysis') {
    loadTimeAnalysis();
  } else if (tabId === 'failures') {
    loadFailures();
  } else if (tabId === 'trend') {
    loadTrendChart();
  }
}

async function loadTimeAnalysis() {
  const workflowData = await fetchData('data/workflow_runs.json');

  // Get from/to dates from hidden inputs
  const fromDate = new Date(document.getElementById('fromDate').value);
  const toDate = new Date(document.getElementById('toDate').value);

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

// Create gradient fill for the bars
const gradient = barChartCtx.createLinearGradient(0, 0, 0, barChartCtx.canvas.height);
gradient.addColorStop(0, 'rgba(75, 192, 192, 0.8)');
gradient.addColorStop(1, 'rgba(75, 192, 192, 0.2)');

// Detect theme
const isDarkTheme = document.body.classList.contains('dark-theme');
const textColor = isDarkTheme ? '#e0e0e0' : '#333333'; // Adjust text color based on theme
const gridColor = isDarkTheme ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';

if (barChartInstance) barChartInstance.destroy(); // Clear existing chart
barChartInstance = new Chart(barChartCtx, {
  type: 'bar',
  data: {
    labels: sortedData.labels,
    datasets: [{
      label: 'Billable Time (minutes)',
      data: sortedData.data,
      backgroundColor: gradient,
      borderColor: 'rgba(75, 192, 192, 1)',
      borderWidth: 1,
    }],
  },
  options: {
    responsive: true,
    indexAxis: 'y',
    animation: {
      duration: 1000,
    },
    plugins: {
      legend: {
        display: false,
      },
      tooltip: {
        callbacks: {
          label: function (context) {
            return `${context.dataset.label}: ${context.raw} minutes`;
          },
        },
      },
    },
    scales: {
      x: {
        beginAtZero: true,
        ticks: {
          color: textColor, // Use dynamic text color
          font: {
            size: 12,
            weight: 'bold',
          },
        },
        grid: {
          color: gridColor, // Subtle grid lines based on theme
        },
      },
      y: {
        ticks: {
          color: textColor, // Use dynamic text color
          font: {
            size: 12,
            weight: 'bold',
          },
        },
        grid: {
          display: false,
        },
      },
    },
  },
});
}

// Load Daily Runtime Trend chart
async function loadTrendChart() {
  const trendData = await fetchData('data/daily_trend.json');

  // Wait for the canvas to be fully visible before rendering
  const trendChartCanvas = document.getElementById('trendChart');

  if (trendChartInstance) trendChartInstance.destroy(); // Clear existing chart

  // Use a timeout to ensure rendering after visibility
setTimeout(() => {
  const trendChartCtx = trendChartCanvas.getContext('2d');

  // Detect theme
  const isDarkTheme = document.body.classList.contains('dark-theme');
  const textColor = isDarkTheme ? '#e0e0e0' : '#333333'; // Adjust text color based on theme
  const gridColor = isDarkTheme ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';

  // Create gradient fill
  const gradient = trendChartCtx.createLinearGradient(0, 0, 0, trendChartCanvas.clientHeight);
  gradient.addColorStop(0, 'rgba(75, 192, 192, 0.7)'); // Top color
  gradient.addColorStop(1, 'rgba(75, 192, 192, 0)');   // Transparent bottom

  if (trendChartInstance) trendChartInstance.destroy(); // Clear existing chart
  trendChartInstance = new Chart(trendChartCtx, {
    type: 'line',
    data: {
      labels: trendData.map(item => item.date),
      datasets: [{
        label: 'Daily Runtime Trend (minutes)',
        data: trendData.map(item => item.totalMinutes),
        borderColor: 'rgba(75, 192, 192, 1)',
        borderWidth: 2,
        fill: true,
        backgroundColor: gradient, // Apply gradient fill
        tension: 0.4, // Smooth curves
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function (context) {
              return `${context.raw} minutes`;
            },
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: textColor, // Use dynamic text color
            maxTicksLimit: 7, // Limit x-axis labels
          },
        },
        y: {
          grid: {
            color: gridColor,
          },
          ticks: {
            beginAtZero: true,
            color: textColor, // Use dynamic text color
          },
        },
      },
    },
  });
}, 100); // Delay slightly to ensure proper rendering
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

  loadTimeAnalysis();
  loadTrendChart();
}

// Load theme preference on page load
window.onload = () => {
  showTab('time-analysis');
  const savedTheme = localStorage.getItem("theme") || "light";
  document.body.className = savedTheme === "dark" ? "dark-theme" : "light-theme";
  document.getElementById("checkboxInput").checked = savedTheme === "dark";

  // Date Range Picker
  flatpickr('#dateRange', {
    mode: 'range',
    dateFormat: 'Y-m-d',
    defaultDate: [
      new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 7 days ago
      new Date().toISOString().split('T')[0] // Today
    ],
    onReady: (selectedDates) => {
      // Set default values to hidden inputs on initial load
      if (selectedDates.length === 2) {
        const [fromDate, toDate] = selectedDates;
        document.getElementById('fromDate').value = fromDate.toISOString().split('T')[0];
        document.getElementById('toDate').value = toDate.toISOString().split('T')[0];
        loadTimeAnalysis(); // Render the graph with default range
      }
    },
    onClose: (selectedDates) => {
      if (selectedDates.length === 2) {
        const [fromDate, toDate] = selectedDates;
        document.getElementById('fromDate').value = fromDate.toISOString().split('T')[0];
        document.getElementById('toDate').value = toDate.toISOString().split('T')[0];
        loadTimeAnalysis(); // Reload the graph when a new range is selected
      }
    },
  });
};  

// Initial Load
loadTimeAnalysis();
loadFailures();
