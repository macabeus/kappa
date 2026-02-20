import { UMAP } from 'umap-js';
import * as vscode from 'vscode';

import { database } from './db';

export async function showChart() {
  const db = await database.getDatabase();

  const vectorsDoc = await db.collections.vectors.find().exec();
  const functionsDoc = await db.collections.decompFunctions.find().exec();

  const allLabels = vectorsDoc.map((doc) => doc.id);
  const allEmbedding = vectorsDoc.map((doc) => doc.embedding);

  if (allLabels.length === 0) {
    vscode.window.showInformationMessage('No data available to display. Please index the codebase first.');
    return;
  }

  // Create a map of function IDs to their data
  const functionDataMap = new Map<string, { hasCCode: boolean; filePath: string; name: string }>();
  let functionsWithCCode = 0;
  let functionsWithoutCCode = 0;

  functionsDoc.forEach((func) => {
    // Check if cCode exists and is not empty
    const hasCCode = !!(func.cCode && func.cCode.trim().length > 0);
    functionDataMap.set(func.id, {
      hasCCode,
      filePath: func.cModulePath || '',
      name: func.name,
    });

    if (hasCCode) {
      functionsWithCCode++;
    } else {
      functionsWithoutCCode++;
    }
  });

  console.log(`Functions with C code: ${functionsWithCCode}, Functions without C code: ${functionsWithoutCCode}`);
  console.log(
    'Sample function data:',
    functionsDoc
      .slice(0, 3)
      .map((f) => ({ id: f.id, name: f.name, hasCCode: !!(f.cCode && f.cCode.trim().length > 0) })),
  );
  console.log('Sample vector IDs:', allLabels.slice(0, 3));

  const umap = new UMAP();
  const result = umap.fit(allEmbedding);

  // Create and show webview panel
  const panel = vscode.window.createWebviewPanel('kappaChart', 'Function Embeddings Chart', vscode.ViewColumn.One, {
    enableScripts: true,
    localResourceRoots: [],
  });

  // Prepare data for the chart
  const chartData = result.map((point: number[], index: number) => {
    const functionData = functionDataMap.get(allLabels[index]);
    return {
      x: point[0],
      y: point[1],
      label: allLabels[index],
      hasCCode: functionData?.hasCCode || false,
      filePath: functionData?.filePath || '',
      name: functionData?.name || '',
    };
  });

  // Sort data so that pink nodes (with C code) are rendered last and appear on top
  const sortedChartData = chartData.sort((a, b) => {
    if (a.hasCCode && !b.hasCCode) {
      return 1; // Pink nodes go to the end (rendered last)
    }
    if (!a.hasCCode && b.hasCCode) {
      return -1; // White nodes go to the beginning (rendered first)
    }
    return 0; // Keep original order for same type
  });

  panel.webview.html = getWebviewContent(sortedChartData);
}

function getWebviewContent(
  data: Array<{ x: number; y: number; label: string; hasCCode: boolean; filePath: string; name: string }>,
): string {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Function Embeddings Chart</title>
        <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
        <style>
            body {
                font-family: var(--vscode-font-family);
                color: var(--vscode-foreground);
                background-color: var(--vscode-editor-background);
                margin: 0;
                padding: 20px;
                display: flex;
                gap: 20px;
            }
            .sidebar {
                width: 350px;
                background-color: var(--vscode-sideBar-background);
                border: 1px solid var(--vscode-panel-border);
                border-radius: 4px;
                padding: 15px;
                overflow-y: auto;
                max-height: 80vh;
            }
            .main-content {
                flex: 1;
                min-width: 0;
            }
            .chart-container {
                position: relative;
                height: 80vh;
                width: 100%;
            }
            .chart-title {
                text-align: center;
                margin-bottom: 20px;
                font-size: 18px;
                font-weight: bold;
            }
            .chart-info {
                margin-bottom: 10px;
                font-size: 14px;
                color: var(--vscode-descriptionForeground);
            }
            .sidebar-title {
                font-size: 16px;
                font-weight: bold;
                margin-bottom: 15px;
                color: var(--vscode-foreground);
            }
            .tree-container {
                margin-bottom: 20px;
            }
            .tree-header {
                font-size: 14px;
                font-weight: 600;
                margin-bottom: 10px;
                color: var(--vscode-foreground);
                display: flex;
                justify-content: space-between;
                align-items: center;
            }
            .tree-list {
                max-height: 400px;
                overflow-y: auto;
                border: 1px solid var(--vscode-input-border);
                border-radius: 3px;
                background-color: var(--vscode-input-background);
            }
            .tree-item {
                display: block;
                width: 100%;
            }
            .tree-node {
                padding: 6px 12px;
                cursor: pointer;
                font-size: 13px;
                border-bottom: 1px solid var(--vscode-panel-border);
                display: flex;
                align-items: center;
                gap: 6px;
                user-select: none;
            }
            .tree-node:focus {
                outline: 2px solid var(--vscode-focusBorder);
                outline-offset: 1px;
            }
            .tree-node.disabled {
                opacity: 0.5;
                cursor: default;
            }
            .tree-node:hover {
                background-color: var(--vscode-list-hoverBackground);
            }
            .tree-node.selected {
                background-color: var(--vscode-list-activeSelectionBackground);
                color: var(--vscode-list-activeSelectionForeground);
            }
            .tree-node.folder {
                font-weight: 500;
            }
            .tree-children {
                padding-left: 20px;
                border-left: 1px solid var(--vscode-panel-border);
                margin-left: 16px;
            }
            .tree-children.hidden {
                display: none;
            }
            .tree-toggle {
                width: 16px;
                height: 16px;
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                font-size: 10px;
                color: var(--vscode-descriptionForeground);
            }
            .tree-toggle.expandable::before {
                content: "▶";
            }
            .tree-toggle.expanded::before {
                content: "▼";
            }
            .tree-icon {
                width: 16px;
                height: 16px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 12px;
            }
            .function-count {
                color: var(--vscode-descriptionForeground);
                font-size: 11px;
                margin-left: auto;
            }
            .clear-filter {
                background-color: var(--vscode-button-background);
                color: var(--vscode-button-foreground);
                border: none;
                border-radius: 3px;
                padding: 6px 12px;
                cursor: pointer;
                font-size: 12px;
                margin-top: 10px;
                width: 100%;
            }
            .clear-filter:hover {
                background-color: var(--vscode-button-hoverBackground);
            }
            .stats-info {
                font-size: 11px;
                color: var(--vscode-descriptionForeground);
                margin-bottom: 10px;
                padding: 8px;
                background-color: var(--vscode-editorWidget-background);
                border-radius: 3px;
            }
        </style>
    </head>
    <body>
        <div class="sidebar">
            <div class="sidebar-title">File Explorer</div>
            
            <div class="tree-container">
                <div class="tree-header">
                    <span>Project Files</span>
                    <span class="function-count" id="total-functions">0 functions</span>
                </div>
                <div class="stats-info" id="filter-status">
                    Click on folders or files to filter the chart
                </div>
                <div class="tree-list" id="file-tree">
                    <!-- Tree structure will be populated by JavaScript -->
                </div>
                <button class="clear-filter" onclick="clearAllFilters()">Clear All Filters</button>
            </div>
        </div>
        
        <div class="main-content">
            <div class="chart-title">Function Embeddings Visualization (UMAP)</div>
            <div class="chart-info">Total functions: ${data.length}</div>
            <div class="chart-info">Each bubble represents a function in your codebase, positioned by similarity of their assembly code.</div>
            <div class="chart-info">
                <span style="color: #FF69B4;">●</span> Pink: Functions with C code (<span id="count-pink">0</span>)
                <span style="margin-left: 20px; color: #FFFFFF;">●</span> White: Assembly-only functions (<span id="count-white">0</span>)
                <span style="margin-left: 20px; color: #007ACC;">●</span> Blue: Selected functions (<span id="count-blue">0</span>)
            </div>
            <div class="chart-container">
                <canvas id="chart"></canvas>
            </div>
        </div>

        <script>
            const data = ${JSON.stringify(data)};
            let chart;
            let selectedPath = null;
            let fileTree = {};
            
            // Build tree structure from file paths
            function buildFileTree() {
                const tree = {};
                let totalFunctions = 0;
                let functionsWithPaths = 0;
                
                data.forEach(point => {
                    totalFunctions++;
                    if (point.filePath && point.filePath.trim().length > 0) {
                        functionsWithPaths++;
                        const normalizedPath = point.filePath.replace(/\\\\/g, '/');
                        const parts = normalizedPath.split('/').filter(part => part.length > 0);
                        
                        if (parts.length === 0) return; // Skip empty paths
                        
                        let current = tree;
                        let currentPath = '';
                        
                        parts.forEach((part, index) => {
                            currentPath = currentPath ? currentPath + '/' + part : part;
                            
                            if (!current[part]) {
                                current[part] = {
                                    name: part,
                                    fullPath: currentPath,
                                    isFile: index === parts.length - 1,
                                    children: {},
                                    functions: [],
                                    functionCount: 0
                                };
                            }
                            
                            // Add function to this node
                            current[part].functions.push(point);
                            current[part].functionCount++;
                            
                            current = current[part].children;
                        });
                    }
                });
                
                // Update total function count with more detail
                const pathInfo = functionsWithPaths < totalFunctions 
                    ? \` (\${functionsWithPaths} with file paths)\`
                    : '';
                document.getElementById('total-functions').textContent = \`\${totalFunctions} functions\${pathInfo}\`;
                
                return tree;
            }
            
            function renderTreeNode(node, container, level = 0) {
                const hasChildren = Object.keys(node.children).length > 0;
                const isFile = node.isFile;
                
                // Create main node element
                const nodeElement = document.createElement('div');
                nodeElement.className = 'tree-item';
                
                const nodeContent = document.createElement('div');
                nodeContent.className = \`tree-node \${isFile ? 'file' : 'folder'}\`;
                nodeContent.style.paddingLeft = \`\${level * 16 + 12}px\`;
                
                // Toggle button for folders with children
                const toggle = document.createElement('span');
                toggle.className = 'tree-toggle';
                if (!isFile && hasChildren) {
                    toggle.className += ' expandable';
                    toggle.onclick = (e) => {
                        e.stopPropagation();
                        toggleNode(nodeElement, toggle);
                    };
                }
                
                // Icon
                const icon = document.createElement('span');
                icon.className = 'tree-icon';
                icon.textContent = isFile ? '📄' : '📁';
                
                // Name
                const name = document.createElement('span');
                name.textContent = node.name;
                name.title = node.fullPath;
                
                // Function count
                const count = document.createElement('span');
                count.className = 'function-count';
                count.textContent = \`(\${node.functionCount})\`;
                
                nodeContent.appendChild(toggle);
                nodeContent.appendChild(icon);
                nodeContent.appendChild(name);
                nodeContent.appendChild(count);
                
                // Click handler for selection
                nodeContent.onclick = () => selectNode(node, nodeContent);
                
                nodeElement.appendChild(nodeContent);
                
                // Add children container
                if (!isFile && hasChildren) {
                    const childrenContainer = document.createElement('div');
                    childrenContainer.className = 'tree-children hidden';
                    
                    // Sort children: folders first, then files
                    const sortedChildren = Object.values(node.children).sort((a, b) => {
                        if (a.isFile !== b.isFile) {
                            return a.isFile ? 1 : -1; // folders first
                        }
                        return a.name.localeCompare(b.name);
                    });
                    
                    sortedChildren.forEach(child => {
                        renderTreeNode(child, childrenContainer, level + 1);
                    });
                    
                    nodeElement.appendChild(childrenContainer);
                }
                
                container.appendChild(nodeElement);
            }
            
            function toggleNode(nodeElement, toggle) {
                const children = nodeElement.querySelector('.tree-children');
                if (children) {
                    const isHidden = children.classList.contains('hidden');
                    if (isHidden) {
                        children.classList.remove('hidden');
                        toggle.className = toggle.className.replace('expandable', 'expanded');
                    } else {
                        children.classList.add('hidden');
                        toggle.className = toggle.className.replace('expanded', 'expandable');
                    }
                }
            }
            
            function selectNode(node, element) {
                console.log('selectNode called with:', node);
                
                // Clear previous selection
                document.querySelectorAll('.tree-node').forEach(item => {
                    item.classList.remove('selected');
                });
                
                selectedPath = node.fullPath;
                console.log('selectedPath set to:', selectedPath);
                element.classList.add('selected');
                
                // Update status
                const statusElement = document.getElementById('filter-status');
                const nodeType = node.isFile ? 'file' : 'folder';
                statusElement.textContent = \`Showing functions from \${nodeType}: \${node.name} (\${node.functionCount} functions)\`;
                
                updateChart();
            }
            
            function clearAllFilters() {
                selectedPath = null;
                document.querySelectorAll('.tree-node').forEach(item => {
                    item.classList.remove('selected');
                });
                
                // Reset status
                document.getElementById('filter-status').textContent = 'Click on folders or files to filter the chart';
                
                updateChart();
            }
            
            function populateNavigation() {
                fileTree = buildFileTree();
                const treeContainer = document.getElementById('file-tree');
                treeContainer.innerHTML = '';
                
                const sortedRoots = Object.values(fileTree);
                
                if (sortedRoots.length === 0) {
                    // No files found - show a message
                    const message = document.createElement('div');
                    message.style.padding = '20px';
                    message.style.textAlign = 'center';
                    message.style.color = 'var(--vscode-descriptionForeground)';
                    message.innerHTML = \`
                        <div style="margin-bottom: 10px;">📭</div>
                        <div>No files found</div>
                        <div style="font-size: 11px; margin-top: 5px;">
                            Make sure to index your codebase first
                        </div>
                    \`;
                    treeContainer.appendChild(message);
                    return;
                }
                
                // Sort root level: folders first, then files
                sortedRoots.sort((a, b) => {
                    if (a.isFile !== b.isFile) {
                        return a.isFile ? 1 : -1; // folders first
                    }
                    return a.name.localeCompare(b.name);
                });
                
                sortedRoots.forEach(node => {
                    renderTreeNode(node, treeContainer, 0);
                });
                
                // Auto-expand first level folders if there aren't too many
                if (sortedRoots.length <= 5) {
                    setTimeout(() => {
                        document.querySelectorAll('.tree-toggle.expandable').forEach(toggle => {
                            if (toggle.parentElement.style.paddingLeft === '12px') { // first level
                                toggle.click();
                            }
                        });
                    }, 100);
                }
            }
            
            function updateChart() {
                console.log('updateChart called, selectedPath:', selectedPath);
                
                // When a filter is active, we need to create separate datasets for layering
                if (selectedPath) {
                    // Alternative approach: Sort data so selected points render last (on top)
                    const sortedData = [...data].sort((a, b) => {
                        const aFiltered = isPointFiltered(a);
                        const bFiltered = isPointFiltered(b);
                        // Selected points (not filtered) should come last to render on top
                        if (aFiltered && !bFiltered) return -1;
                        if (!aFiltered && bFiltered) return 1;
                        return 0;
                    });
                    
                    chart.data.datasets = [{
                        label: 'Functions',
                        data: sortedData,
                        backgroundColor: function(context) {
                            const point = sortedData[context.dataIndex];
                            const isFiltered = isPointFiltered(point);
                            
                            if (!isFiltered) {
                                return '#007ACC'; // Blue for selected
                            } else {
                                const baseColor = point.hasCCode ? '#FF69B4' : '#FFFFFF';
                                return baseColor + '1A'; // 10% opacity for filtered
                            }
                        },
                        borderColor: function(context) {
                            const point = sortedData[context.dataIndex];
                            const isFiltered = isPointFiltered(point);
                            
                            if (!isFiltered) {
                                return '#005A9E'; // Dark blue border for selected
                            } else {
                                const baseColor = point.hasCCode ? '#FF1493' : '#808080';
                                return baseColor + '1A'; // 10% opacity for filtered
                            }
                        },
                        borderWidth: function(context) {
                            return 2;
                        },
                        pointRadius: function(context) {
                            return 8;
                        },
                        pointHoverRadius: function(context) {
                            return 12;
                        }
                    }];
                    
                    console.log('Filter active - using single sorted dataset approach');
                } else {
                    console.log('No filter active, using single dataset');
                    // No filter active - use single dataset with original colors
                    chart.data.datasets = [{
                        label: 'Functions',
                        data: data,
                        backgroundColor: function(context) {
                            const point = data[context.dataIndex];
                            return point.hasCCode ? '#FF69B4' : '#FFFFFF';
                        },
                        borderColor: function(context) {
                            const point = data[context.dataIndex];
                            return point.hasCCode ? '#FF1493' : '#808080';
                        },
                        borderWidth: 2,
                        pointRadius: 8,
                        pointHoverRadius: 12
                    }];
                }
                
                chart.update();
                updateLegendCounts();
            }
            
            function isPointFiltered(point) {
                if (!selectedPath) {
                    return false; // No filter applied
                }
                
                if (!point.filePath) {
                    return true; // Filter out points without file paths
                }
                
                const normalizedPointPath = point.filePath.replace(/\\\\/g, '/');
                
                // Check if the point's path ends with the selected path (for files)
                // or contains the selected path as a folder (for folders)
                const pathMatches = normalizedPointPath.endsWith('/' + selectedPath) ||
                                  normalizedPointPath.endsWith(selectedPath) ||
                                  normalizedPointPath.includes('/' + selectedPath + '/') ||
                                  normalizedPointPath === selectedPath;
                
                return !pathMatches;
            }
            
            function updateLegendCounts() {
                var pinkCount = data.filter(function(d) { return d.hasCCode; }).length;
                var whiteCount = data.filter(function(d) { return !d.hasCCode; }).length;
                var blueCount = 0;
                if (selectedPath) {
                    blueCount = data.filter(function(d) { return !isPointFiltered(d); }).length;
                }
                document.getElementById('count-pink').textContent = pinkCount;
                document.getElementById('count-white').textContent = whiteCount;
                document.getElementById('count-blue').textContent = blueCount;
            }

            function initChart() {
                const ctx = document.getElementById('chart').getContext('2d');
                
                const chartData = {
                    datasets: [{
                        label: 'Functions',
                        data: data,
                        backgroundColor: function(context) {
                            const point = data[context.dataIndex];
                            return point.hasCCode ? '#FF69B4' : '#FFFFFF';
                        },
                        borderColor: function(context) {
                            const point = data[context.dataIndex];
                            return point.hasCCode ? '#FF1493' : '#808080';
                        },
                        borderWidth: 2,
                        pointRadius: 8,
                        pointHoverRadius: 12
                    }]
                };

                const config = {
                    type: 'scatter',
                    data: chartData,
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        datasets: {
                            scatter: {
                                order: 1 // Default order for datasets
                            }
                        },
                        scales: {
                            x: {
                                type: 'linear',
                                position: 'bottom',
                                title: {
                                    display: true,
                                    text: 'UMAP Dimension 1',
                                    color: 'var(--vscode-foreground)'
                                },
                                grid: {
                                    color: 'var(--vscode-panel-border)'
                                },
                                ticks: {
                                    color: 'var(--vscode-foreground)'
                                }
                            },
                            y: {
                                title: {
                                    display: true,
                                    text: 'UMAP Dimension 2',
                                    color: 'var(--vscode-foreground)'
                                },
                                grid: {
                                    color: 'var(--vscode-panel-border)'
                                },
                                ticks: {
                                    color: 'var(--vscode-foreground)'
                                }
                            }
                        },
                        plugins: {
                            legend: {
                                display: false
                            },
                            tooltip: {
                                callbacks: {
                                    label: function(context) {
                                        const point = context.parsed;
                                        const dataPoint = context.dataset.data[context.dataIndex];
                                        const cCodeStatus = dataPoint.hasCCode ? 'Has C code' : 'Assembly only';
                                        const filePath = dataPoint.filePath || 'Unknown';
                                        const fileName = filePath.split('/').pop() || filePath;
                                        
                                        let filterStatus = '';
                                        if (selectedPath) {
                                            const isFiltered = isPointFiltered(dataPoint);
                                            filterStatus = isFiltered ? ' (Filtered)' : ' (Selected)';
                                        }
                                        
                                        return [
                                            \`\${dataPoint.name} (\${cCodeStatus})\${filterStatus}\`,
                                            \`File: \${fileName}\`,
                                            \`Position: (\${point.x.toFixed(3)}, \${point.y.toFixed(3)})\`
                                        ];
                                    }
                                },
                                backgroundColor: 'var(--vscode-editorHoverWidget-background)',
                                titleColor: 'var(--vscode-editorHoverWidget-foreground)',
                                bodyColor: 'var(--vscode-editorHoverWidget-foreground)',
                                borderColor: 'var(--vscode-editorHoverWidget-border)',
                                borderWidth: 1
                            }
                        },
                        interaction: {
                            intersect: false,
                            mode: 'point'
                        }
                    }
                };

                chart = new Chart(ctx, config);
            }
            
            // Initialize everything when the page loads
            document.addEventListener('DOMContentLoaded', function() {
                console.log('Initializing navigation with data:', data.length, 'functions');
                console.log('Sample data:', data.slice(0, 3));
                
                // Check how many functions have file paths
                const withPaths = data.filter(d => d.filePath && d.filePath.trim().length > 0);
                console.log('Functions with file paths:', withPaths.length, '/', data.length);
                if (withPaths.length > 0) {
                    console.log('Sample paths:', withPaths.slice(0, 5).map(d => d.filePath));
                }
                
                populateNavigation();
                initChart();
                updateLegendCounts();

                // Debug: log the tree structure
                console.log('Built file tree:', fileTree);
            });
        </script>
    </body>
    </html>
  `;
}
