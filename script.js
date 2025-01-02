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

  // Highlight the selected tab
  document.querySelectorAll('.tab-button').forEach(button => {
    button.classList.remove('active');
  });
  document.querySelector(`[onclick="showTab('${tabId}')"]`).classList.add('active');

  if (tabId === 'time-analysis') {
    loadTimeAnalysis();
  } else if (tabId === 'failures') {
    loadFailures();
  } else if (tabId === 'trend') {
    loadTrendChart();
  }
}

async function loadTimeAnalysis() {
  try {
    const dailyTrendData = await fetchData('data/daily_trend.json');
    const workflowData = await fetchData('data/workflow_runs.json');
    const repoCountData = await fetchData('data/repo_count.json');

    const COST_PER_MINUTE = {
      UBUNTU: 0.008,
      WINDOWS: 0.016,
      MACOS: 0.08,
    };

    // Normalize input dates to UTC midnight
    const normalizeToUTC = (date) => new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));

    const fromDate = normalizeToUTC(new Date(document.getElementById('fromDate').value));
    const toDate = normalizeToUTC(new Date(document.getElementById('toDate').value));

    // Validate date range
    if (isNaN(fromDate) || isNaN(toDate)) {
      console.error('Invalid date range:', fromDate, toDate);
      return;
    }

    let totalCost = 0;
    let selfHostedTime = 0;
    const aggregatedData = {
      labels: [],
      data: [],
    };

    // Process daily trend data for widgets
    dailyTrendData.forEach((entry) => {
      const entryDate = normalizeToUTC(new Date(entry.date));
      if (entryDate >= fromDate && entryDate <= toDate) {
        selfHostedTime += entry['Self-hosted'] || 0;

        // Calculate cost from Total time
        const totalTime = entry['Total'] || 0;
        totalCost += totalTime * COST_PER_MINUTE.UBUNTU; // Default to Ubuntu
      }
    });

    // Process workflow data for the graph
    const workflowAggregated = workflowData.reduce((acc, run) => {
      const runDate = normalizeToUTC(new Date(run.created_at.split('T')[0]));
      if (runDate >= fromDate && runDate <= toDate && run.total_time_minutes > 0) {
        const key = `${run.repo} - ${run.workflow_name}`;
        acc[key] = (acc[key] || 0) + run.total_time_minutes;
      }
      return acc;
    }, {});

    const sortedWorkflowData = Object.entries(workflowAggregated)
      .sort(([, a], [, b]) => b - a)
      .reduce(
        (acc, [key, value]) => {
          acc.labels.push(key);
          acc.data.push(value);
          return acc;
        },
        { labels: [], data: [] }
      );

    // Fetch repository count
    const repoCount = repoCountData.repo_count || 0;

    // Update widgets
    document.getElementById('totalCost').innerText = `$${totalCost.toFixed(2)}`;
    document.getElementById('topWorkflowsList').innerHTML = `<li>${selfHostedTime.toFixed(2)} minutes</li>`;
    document.getElementById('repoCount').innerText = repoCount;

    // Chart Logic
    const barChartCtx = document.getElementById('workflowBarChart').getContext('2d');
    const gradient = barChartCtx.createLinearGradient(0, 0, 0, barChartCtx.canvas.height);
    gradient.addColorStop(0, 'rgba(75, 192, 192, 0.8)');
    gradient.addColorStop(1, 'rgba(75, 192, 192, 0.2)');

    const isDarkTheme = document.body.classList.contains('dark-theme');
    const textColor = isDarkTheme ? '#e0e0e0' : '#333333';
    const gridColor = isDarkTheme ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';

    if (window.barChartInstance) window.barChartInstance.destroy();

    window.barChartInstance = new Chart(barChartCtx, {
      type: 'bar',
      data: {
        labels: sortedWorkflowData.labels,
        datasets: [{
          label: 'Billable Time (minutes)',
          data: sortedWorkflowData.data,
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
        },
        scales: {
          x: {
            beginAtZero: true,
            ticks: {
              color: textColor,
              font: {
                size: 12,
                weight: 'bold',
              },
            },
            grid: {
              color: gridColor,
            },
          },
          y: {
            ticks: {
              color: textColor,
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

  } catch (error) {
    console.error('Error loading time analysis:', error);
  }
}

// Load Daily Runtime Trend chart
async function loadTrendChart() {
  const trendData = await fetchData('data/daily_trend.json');

  // Wait for the canvas to be fully visible before rendering
  const trendChartCanvas = document.getElementById('trendChart');

  if (trendChartInstance) trendChartInstance.destroy();

  // Use a timeout to ensure rendering after visibility
  setTimeout(() => {
    const trendChartCtx = trendChartCanvas.getContext('2d');

    // Detect theme
    const isDarkTheme = document.body.classList.contains('dark-theme');
    const textColor = isDarkTheme ? '#e0e0e0' : '#333333';
    const gridColor = isDarkTheme ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';

    // Filter out OS-specific data and create datasets dynamically
    const datasets = [];
    const osColors = {
      Ubuntu: 'rgba(75, 192, 192, 0.7)',
      Windows: 'rgba(54, 162, 235, 0.7)',
      MacOS: 'rgba(255, 99, 132, 0.7)'
    };

    Object.keys(osColors).forEach(os => {
      const osData = trendData.map(item => item[os] || 0);
      if (osData.some(value => value > 0)) {
        datasets.push({
          label: os,
          data: osData,
          borderColor: osColors[os].replace(/0\.7/, '1'),
          borderWidth: 2,
          fill: true,
          backgroundColor: trendChartCtx.createLinearGradient(0, 0, 0, trendChartCanvas.clientHeight).addColorStop(0, osColors[os]),
          tension: 0.2,
        });
      }
    });

    trendChartInstance = new Chart(trendChartCtx, {
      type: 'line',
      data: {
        labels: trendData.map(item => item.date),
        datasets: datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: true },
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
            grid: { display: false },
            ticks: {
              color: textColor,
              maxTicksLimit: 7, // Limit x-axis labels
            },
          },
          y: {
            grid: {
              color: gridColor,
            },
            ticks: {
              beginAtZero: true,
              color: textColor,
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

async function updateLastUpdated() {
  const lastUpdatedElement = document.getElementById('lastUpdated');

  try {
    const response = await fetch('data/last_processed_time.json'); // Adjust path if needed
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    const lastProcessedTime = new Date(data.last_processed_time);

    // Format the date
    const formattedDate = lastProcessedTime.toLocaleString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    lastUpdatedElement.textContent = formattedDate;
  } catch (error) {
    console.error('Error fetching last_processed_time.json:', error);
    lastUpdatedElement.textContent = 'Error loading timestamp';
  }
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
updateLastUpdated();