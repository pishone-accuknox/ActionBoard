let currentTheme = "light";
let barChartInstance = null;
let trendChartInstance = null;
let detailedAnalysisTable = null;

async function fetchData(url) {
  const response = await fetch(url);
  return response.json();
}

function showTab(tabId) {
  document.querySelectorAll('.tab-content').forEach(tab => {
    tab.style.display = tab.id === tabId ? 'block' : 'none';
  });

  document.querySelectorAll('.tab-button').forEach(button => {
    button.classList.remove('active');
  });
  document.querySelector(`[onclick="showTab('${tabId}')"]`).classList.add('active');

  if (tabId === 'overview') {
    loadOverview();
  } else if (tabId === 'runtime-trends') {
    loadRuntimeTrends();
  } else if (tabId === 'detailed-analysis') {
    loadDetailedAnalysis();
  }
}

async function loadOverview() {
  try {
    const dailyTrendData = await fetchData('data/daily_trend.json');
    const workflowData = await fetchData('data/workflow_runs.json');
    const repoCountData = await fetchData('data/repo_count.json');

    const COST_PER_MINUTE = {
      UBUNTU: 0.008,
      WINDOWS: 0.016,
      MACOS: 0.08,
    };

    // Normalize dates to UTC (start of the day)
    const normalizeToUTC = (date) => {
      return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    };

    // Get date range from input
    const fromDate = normalizeToUTC(new Date(document.getElementById('fromDate').value));
    const toDate = normalizeToUTC(new Date(document.getElementById('toDate').value));
    toDate.setUTCHours(23, 59, 59, 999); // Include the entire day

    let totalCost = 0;
    let selfHostedTime = 0;
    let previousPeriodCost = 0;
    let currentPeriodCost = 0;

    // Calculate the date for the previous period
    const daysDiff = Math.floor((toDate - fromDate) / (1000 * 60 * 60 * 24)) + 1;
    const previousEnd = new Date(fromDate);
    previousEnd.setUTCDate(previousEnd.getUTCDate() - 1);
    const previousStart = new Date(previousEnd);
    previousStart.setUTCDate(previousStart.getUTCDate() - daysDiff + 1);

    // Calculate costs for the current and previous periods
    dailyTrendData.forEach((entry) => {
      const entryDate = normalizeToUTC(new Date(entry.date));

      // Current period
      if (entryDate >= fromDate && entryDate <= toDate) {
        currentPeriodCost += entry.Ubuntu * COST_PER_MINUTE.UBUNTU;
        totalCost = currentPeriodCost; // Total cost is just the current period

        if (entry['Self-hosted']) {
          selfHostedTime += entry['Self-hosted'];
        }
      }

      // Previous period
      if (entryDate >= previousStart && entryDate < fromDate) {
        previousPeriodCost += entry.Ubuntu * COST_PER_MINUTE.UBUNTU;
      }
    });

    // Calculate trend
    const costTrend = previousPeriodCost > 0
      ? ((currentPeriodCost - previousPeriodCost) / previousPeriodCost) * 100
      : 0;

    // Update display
    document.getElementById('totalCost').innerHTML = `
      <div class="widget-content">
        <span class="widget-value">$${totalCost.toFixed(2)}</span>
        <span class="widget-trend ${costTrend >= 0 ? 'positive' : 'negative'}">
          ${costTrend >= 0 ? '↑' : '↓'} ${Math.abs(costTrend).toFixed(1)}%
        </span>
      </div>
    `;

    document.getElementById('selfHostedTime').innerHTML = `
      <div class="widget-content">
        <span class="widget-value">${selfHostedTime.toFixed(1)}</span>
        <span class="widget-unit">minutes</span>
      </div>
    `;

    document.getElementById('repoCount').innerHTML = `
      <div class="widget-content">
        <span class="widget-value">${repoCountData.repo_count || 0}</span>
        <span class="widget-unit">repositories</span>
      </div>
    `;

    // Process workflow data for the bar chart
    const workflowAggregated = workflowData.reduce((acc, run) => {
      const runDate = normalizeToUTC(new Date(run.created_at.split('T')[0]));
      if (runDate >= fromDate && runDate <= toDate && run.total_billable_time > 0) {
        const key = `${run.repo} - ${run.workflow_name}`;
        acc[key] = (acc[key] || 0) + run.total_billable_time;
      }
      return acc;
    }, {});

    const sortedWorkflowData = Object.entries(workflowAggregated)
      .sort(([, a], [, b]) => b - a)
      .reduce((acc, [key, value]) => {
        acc.labels.push(key);
        acc.data.push(value);
        return acc;
      }, { labels: [], data: [] });

    updateBarChart(sortedWorkflowData);
  } catch (error) {
    console.error('Error loading overview:', error);
  }
}

async function loadRuntimeTrends() {
  try {
    const trendData = await fetchData('data/daily_trend.json');
    const fromDate = new Date(document.getElementById('fromDate').value);
    const toDate = new Date(document.getElementById('toDate').value);

    // Filter data based on date range
    const filteredData = trendData.filter(d => {
      const date = new Date(d.date);
      return date >= fromDate && date <= toDate;
    });

    // Remove datasets with all zero values
    const datasets = [];
    const osTypes = ['Ubuntu', 'Windows', 'MacOS', 'Self-hosted'];
    
    osTypes.forEach(os => {
      const hasNonZeroValue = filteredData.some(d => (d[os] || 0) > 0);
      if (hasNonZeroValue) {
        datasets.push({
          label: os,
          data: filteredData.map(d => d[os] || 0),
          borderColor: getOsColor(os),
          backgroundColor: getOsColor(os, 0.2),
          tension: 0.4
        });
      }
    });

    // Update chart
    const ctx = document.getElementById('trendChart').getContext('2d');
    if (trendChartInstance) trendChartInstance.destroy();

    trendChartInstance = new Chart(ctx, {
      type: 'line',
      data: { 
        labels: filteredData.map(d => d.date),
        datasets: datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'nearest',
          intersect: false
        },
        plugins: {
          legend: {
            position: 'top'
          },
          tooltip: {
            mode: 'index'
          }
        },
        scales: {
          y: {
            beginAtZero: true
          }
        }
      }
    });
  } catch (error) {
    console.error('Error loading runtime trends:', error);
  }
}

function getOsColor(os, alpha = 1) {
  const colors = {
    'Ubuntu': `rgba(233, 84, 32, ${alpha})`,
    'Windows': `rgba(0, 120, 215, ${alpha})`,
    'MacOS': `rgba(128, 128, 128, ${alpha})`,
    'Self-hosted': `rgba(153, 102, 255, ${alpha})`
  };
  return colors[os];
}

async function loadDetailedAnalysis() {
  try {
    const workflowData = await fetchData('data/workflow_runs.json');
    const container = document.getElementById('detailed-analysis-container');
    container.innerHTML = '';

    // Add header section
    const headerSection = document.createElement('div');
    headerSection.className = 'section-header mb-4';
    headerSection.innerHTML = `
      <h2 class="text-xl font-bold mb-2">Detailed Workflow Analysis</h2>
      <p class="text-sm opacity-70">Comprehensive view of all workflow runs with filtering and sorting capabilities</p>
    `;
    container.appendChild(headerSection);

    // Create filter controls
    const filterSection = document.createElement('div');
    filterSection.className = 'filter-controls';
    
    const repos = [...new Set(workflowData.map(run => run.repo))];
    const statuses = [...new Set(workflowData.map(run => run.status))];

    filterSection.innerHTML = `
      <div class="filter-group">
        <select id="repo-filter" class="text-sm">
          <option value="">All Repositories</option>
          ${repos.map(repo => `<option value="${repo}">${repo}</option>`).join('')}
        </select>
      </div>
      <div class="filter-group">
        <select id="status-filter" class="text-sm">
          <option value="">All Statuses</option>
          ${statuses.map(status => `<option value="${status}">${status}</option>`).join('')}
        </select>
      </div>
      <div class="filter-group">
        <select id="self-hosted-filter" class="text-sm">
          <option value="">All Runners</option>
          <option value="Yes">Self-hosted</option>
          <option value="No">GitHub-hosted</option>
        </select>
      </div>
      <div class="filter-group">
        <input type="text" class="search-input text-sm" placeholder="Search workflows...">
      </div>
    `;
    
    container.appendChild(filterSection);

    // Create table container
    const tableContainer = document.createElement('div');
    tableContainer.className = 'overflow-x-auto rounded-lg shadow';
    
    const table = document.createElement('table');
    table.className = 'detailed-analysis-table';
    
    const headers = [
      'Repository',
      'Workflow Name',
      'Status',
      'Created At',
      'Duration',
      'Total Billable Time',
      'Self-hosted'
    ];

    const thead = document.createElement('thead');
    thead.innerHTML = `
      <tr>
        ${headers.map(header => `<th class="px-4 py-2">${header}</th>`).join('')}
      </tr>
    `;
    table.appendChild(thead);

    // Add tbody
    const tbody = document.createElement('tbody');
    table.appendChild(tbody);

    // Get date range from input
    const fromDate = new Date(document.getElementById('fromDate').value + 'T00:00:00Z'); // Start of the day in UTC
    const toDate = new Date(document.getElementById('toDate').value + 'T23:59:59.999Z'); // End of the day in UTC

    // Filter data based on date range
    const filteredData = workflowData.filter(run => {
      const runDate = new Date(run.created_at); // Preserve the time component
      return runDate >= fromDate && runDate <= toDate;
    });

    tableContainer.appendChild(table);
    container.appendChild(tableContainer);

    // Initialize DataTable
    if (detailedAnalysisTable) {
      detailedAnalysisTable.destroy();
    }

    detailedAnalysisTable = $(table).DataTable({
      data: filteredData,
      ordering: false,
      searching: true,
      columns: [
        { 
          data: 'repo',
          render: function(data, type, row) {
            return `<a href="${row.html_url}" target="_blank" class="text-blue-500 hover:text-blue-700">${data}</a>`;
          }
        },
        { data: 'workflow_name' },
        { 
          data: 'status',
          render: function(data) {
            const statusClasses = {
              success: 'success',
              failure: 'failure',
              cancelled: 'cancelled'
            };
            return `<span class="status-badge ${statusClasses[data.toLowerCase()]}">${data}</span>`;
          }
        },
        { 
          data: 'created_at',
          render: function(data) {
            return new Date(data).toUTCString(); // Display in UTC
          }
        },
        { 
          data: 'run_duration_minutes',
          render: function(data) {
            return `${data} mins`;
          }
        },
        { 
          data: 'total_billable_time',
          render: function(data) {
            return `${data} mins`;
          }
        },
        { 
          data: 'is_self_hosted',
          render: function(data) {
            return data ? 'Yes' : 'No';
          }
        }
      ],
      pageLength: 10,
      lengthMenu: [[10, 25, 50, 100], ['10 entries', '25 entries', '50 entries', '100 entries']],
      dom: 'lrt<"bottom"ip><"clear">',
      language: {
        lengthMenu: "_MENU_",
        info: "_START_ to _END_ of _TOTAL_ entries",
        paginate: {
          first: "First",
          last: "Last",
          next: "Next",
          previous: "Previous"
        }
      }
    });

    // Move length menu to filter section
    const lengthMenu = document.querySelector('.dataTables_length');
    if (lengthMenu) {
      filterSection.appendChild(lengthMenu);
    }

    // Add event listeners for filters
    $('#repo-filter').on('change', function() {
      detailedAnalysisTable.columns(0).search(this.value).draw();
    });

    $('#status-filter').on('change', function() {
      detailedAnalysisTable.columns(2).search(this.value).draw();
    });

    $('#self-hosted-filter').on('change', function() {
      detailedAnalysisTable.columns(6).search(this.value).draw();
    });

    $('.search-input').on('keyup', function() {
      detailedAnalysisTable.search(this.value).draw();
    });

  } catch (error) {
    console.error('Error loading detailed analysis:', error);
  }
}

function createFilter(label, options, id) {
  const container = document.createElement('div');
  container.className = 'filter-group';

  const filterLabel = document.createElement('label');
  filterLabel.textContent = label;
  
  const select = document.createElement('select');
  select.id = id;
  
  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = `All ${label}s`;
  select.appendChild(defaultOption);
  
  options.forEach(option => {
    const optionElement = document.createElement('option');
    optionElement.value = option;
    optionElement.textContent = option;
    select.appendChild(optionElement);
  });

  container.appendChild(filterLabel);
  container.appendChild(select);
  
  return container;
}

function updateBarChart(data) {
  const ctx = document.getElementById('workflowBarChart').getContext('2d');
  const isDarkTheme = document.body.classList.contains('dark-theme');

  // Calculate dynamic height based on number of workflows
  const minHeight = 400; // Minimum height to ensure chart is visible
  const barHeight = 20;
  const barSpacing = 8; // Reduced spacing between bars
  const padding = 50; // Increased padding to account for labels
  
  // Calculate required height based on number of bars
  const calculatedHeight = Math.max(
    minHeight,
    (data.labels.length * (barHeight + barSpacing)) + padding
  );

  // Set canvas height and parent container height
  ctx.canvas.height = calculatedHeight;
  ctx.canvas.parentElement.style.height = `${calculatedHeight}px`;

  // Create vertical gradient (top to bottom)
  const gradient = ctx.createLinearGradient(0, 0, 0, calculatedHeight);
  gradient.addColorStop(0, 'rgba(75, 192, 192, 0.9)');
  gradient.addColorStop(1, 'rgba(75, 192, 192, 0.3)');

  // Set colors based on theme
  const textColor = isDarkTheme ? '#e0e0e0' : '#333333';
  const gridColor = isDarkTheme ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';

  if (window.barChartInstance) {
    window.barChartInstance.destroy();
  }

  window.barChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.labels,
      datasets: [{
        label: 'Billable Time (minutes)',
        data: data.data,
        backgroundColor: gradient,
        borderColor: 'rgba(75, 192, 192, 1)',
        borderWidth: 1,
        barThickness: barHeight,
        barPercentage: 0.95, // Increased to reduce gaps
        categoryPercentage: 0.95 // Increased to reduce gaps
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      animation: {
        duration: 300 // Reduced animation time
      },
      layout: {
        padding: {
          left: 10,
          right: 20,
          top: 10,
          bottom: 10
        }
      },
      plugins: {
        legend: {
          display: false
        }
      },
      scales: {
        x: {
          beginAtZero: true,
          grid: {
            color: gridColor
          },
          ticks: {
            color: textColor,
            font: {
              size: 11
            }
          }
        },
        y: {
          grid: {
            display: false
          },
          ticks: {
            color: textColor,
            font: {
              size: 11
            },
            // Ensure all labels are visible
            callback: function(value, index) {
              const label = data.labels[index];
              return label;
            }
          }
        }
      }
    }
  });
}


function toggleTheme() {
  const isChecked = document.getElementById("checkboxInput").checked;
  document.body.className = isChecked ? "dark-theme" : "light-theme";
  localStorage.setItem("theme", isChecked ? "dark" : "light");

  // Reload current tab to update chart colors
  const activeTab = document.querySelector('.tab-button.active');
  if (activeTab) {
    showTab(activeTab.getAttribute('onclick').match(/'([^']+)'/)[1]);
  }
  
}

// Initialize on page load
window.onload = () => {
  const savedTheme = localStorage.getItem("theme") || "light";
  document.body.className = savedTheme === "dark" ? "dark-theme" : "light-theme";
  document.getElementById("checkboxInput").checked = savedTheme === "dark";

  // Set default date range (last 7 days)
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 7);
  
  document.getElementById('fromDate').value = startDate.toISOString().split('T')[0];
  document.getElementById('toDate').value = endDate.toISOString().split('T')[0];

  // Initialize date range picker
  flatpickr('#dateRange', {
    mode: 'range',
    dateFormat: 'Y-m-d',
    defaultDate: [startDate, endDate],
    onChange: (selectedDates) => {
      if (selectedDates.length === 2) {
        document.getElementById('fromDate').value = selectedDates[0].toISOString().split('T')[0];
        document.getElementById('toDate').value = selectedDates[1].toISOString().split('T')[0];
        
        // Reload current tab
        const activeTab = document.querySelector('.tab-button.active');
        if (activeTab) {
          showTab(activeTab.getAttribute('onclick').match(/'([^']+)'/)[1]);
        }
      }
    }
  });

  // Update last processed time
  fetch('data/last_processed_time.json')
    .then(response => response.json())
    .then(data => {
      const lastUpdated = new Date(data.last_processed_time).toLocaleString();
      document.getElementById('lastUpdated').textContent = lastUpdated;
    })
    .catch(error => {
      console.error('Error loading last processed time:', error);
      document.getElementById('lastUpdated').textContent = 'Unknown';
    });

  // Show overview tab by default
  showTab('overview');
};