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

    const normalizeToUTC = (date) => new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const fromDate = normalizeToUTC(new Date(document.getElementById('fromDate').value));
    const toDate = normalizeToUTC(new Date(document.getElementById('toDate').value));

    let totalCost = 0;
    let selfHostedTime = 0;

    // Process daily trend data
    dailyTrendData.forEach((entry) => {
      const entryDate = normalizeToUTC(new Date(entry.date));
      if (entryDate >= fromDate && entryDate <= toDate) {
        selfHostedTime += entry['Self-hosted'] || 0;
        
        // Calculate costs for each OS type
        if (entry.Ubuntu) totalCost += entry.Ubuntu * COST_PER_MINUTE.UBUNTU;
        if (entry.Windows) totalCost += entry.Windows * COST_PER_MINUTE.WINDOWS;
        if (entry.MacOS) totalCost += entry.MacOS * COST_PER_MINUTE.MACOS;
      }
    });

    // Update widgets with inline layout
    document.getElementById('totalCost').innerHTML = `
      <div class="widget-content">
        <span class="widget-value">$${totalCost.toFixed(2)}</span>
        <span class="widget-trend ${totalCost > 0 ? 'positive' : 'negative'}">${totalCost > 0 ? '↑' : '↓'}</span>
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
    
    // Clear existing content
    container.innerHTML = '';

    // Create filter controls - all in one line
    const filterSection = document.createElement('div');
    filterSection.className = 'filter-controls';
    
    // Get unique repositories and statuses
    const repos = [...new Set(workflowData.map(run => run.repo))];
    const statuses = [...new Set(workflowData.map(run => run.status))];

    // Create filters with inline layout
    filterSection.innerHTML = `
      <div class="filter-group">
        <select id="repo-filter">
          <option value="">All Repositories</option>
          ${repos.map(repo => `<option value="${repo}">${repo}</option>`).join('')}
        </select>
      </div>
      <div class="filter-group">
        <select id="status-filter">
          <option value="">All Statuses</option>
          ${statuses.map(status => `<option value="${status}">${status}</option>`).join('')}
        </select>
      </div>
      <div class="filter-group">
        <input type="text" class="search-input" placeholder="Search workflows...">
      </div>
    `;
    
    container.appendChild(filterSection);

    // Create table
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
        ${headers.map(header => `<th>${header}</th>`).join('')}
      </tr>
    `;
    table.appendChild(thead);

    const fromDate = new Date(document.getElementById('fromDate').value);
    const toDate = new Date(document.getElementById('toDate').value);

    const filteredData = workflowData.filter(run => {
      const runDate = new Date(run.created_at.split('T')[0]);
      return runDate >= fromDate && runDate <= toDate;
    });

    // Initialize DataTable with full width and more rows
    detailedAnalysisTable = $(table).DataTable({
      data: filteredData,
      columns: [
        { data: 'repo' },
        { data: 'workflow_name' },
        { 
          data: 'status',
          render: function(data) {
            return `<span class="status-badge ${data.toLowerCase()}">${data}</span>`;
          }
        },
        { 
          data: 'created_at',
          render: function(data) {
            return new Date(data).toLocaleString();
          }
        },
        { 
          data: 'run_duration_minutes',
          render: function(data) {
            return `${data} mins`;
          }
        },
        { data: 'total_billable_time' },
        { 
          data: 'is_self_hosted',
          render: function(data) {
            return data ? 'Yes' : 'No';
          }
        }
      ],
      order: [[3, 'desc']],
      pageLength: 25, // Show more rows per page
      lengthMenu: [[10, 25, 50, -1], [10, 25, 50, "All"]], // Add option to show all rows
      responsive: true,
      scrollX: true, // Enable horizontal scrolling if needed
      width: '100%'
    });

    // Add event listeners for filters
    $('#repo-filter').on('change', function() {
      detailedAnalysisTable.columns(0).search(this.value).draw();
    });

    $('#status-filter').on('change', function() {
      detailedAnalysisTable.columns(2).search(this.value).draw();
    });

    $('.search-input').on('keyup', function() {
      detailedAnalysisTable.search(this.value).draw();
    });

    container.appendChild(table);
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
  const barHeight = 20; // Reduced bar height
  const padding = 40;
  const totalHeight = (data.labels.length * (barHeight + 5)) + padding; // Reduced spacing

  // Set canvas height
  ctx.canvas.height = totalHeight;

  // Create vertical gradient (top to bottom)
  const gradient = ctx.createLinearGradient(0, 0, 0, ctx.canvas.height);
  gradient.addColorStop(0, 'rgba(75, 192, 192, 0.9)');
  gradient.addColorStop(1, 'rgba(75, 192, 192, 0.3)');

  // Set colors based on theme
  const textColor = isDarkTheme ? '#e0e0e0' : '#333333';
  const gridColor = isDarkTheme ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)';

  if (window.barChartInstance) window.barChartInstance.destroy();

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
        barPercentage: 0.8,
        categoryPercentage: 0.8
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      indexAxis: 'y',
      animation: {
        duration: 500 // Reduced animation time
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
          ticks: {
            color: textColor,
            font: {
              size: 11
            }
          },
          grid: {
            color: gridColor
          }
        },
        y: {
          ticks: {
            color: textColor,
            font: {
              size: 11
            }
          },
          grid: {
            display: false
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