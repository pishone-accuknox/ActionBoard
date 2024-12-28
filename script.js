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
  
    // Populate workflow table
    const workflowTable = document.querySelector('#workflowTable tbody');
    workflowData.forEach(run => {
      const row = document.createElement('tr');
      row.innerHTML = `
        <td>${run.repo}</td>
        <td>${run.workflow_name}</td>
        <td>${run.total_time_minutes || 0}</td>
      `;
      workflowTable.appendChild(row);
    });
  
    // Plot daily trend
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
  
  async function loadFailures() {
    const failuresData = await fetchData('data/failed_runs.json');
  
    // Populate failures table
    const failuresTable = document.querySelector('#failuresTable tbody');
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
  
  // Load initial data
  loadTimeAnalysis();
  loadFailures();
  