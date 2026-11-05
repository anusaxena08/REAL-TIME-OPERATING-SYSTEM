/**
 * RTOS-Sim UI & Application Controller
 * Handles Scheduling Lab, Mutex Lab, and Temperature-Monitoring Node
 */

(function () {
  'use strict';

  // Task color palette for Gantt visualization
  const TASK_COLORS = [
    '#3b82f6', // blue
    '#10b981', // green
    '#8b5cf6', // purple
    '#06b6d4', // cyan
    '#f59e0b', // amber
    '#ec4899', // pink
    '#6366f1', // indigo
    '#14b8a6', // teal
    '#f97316', // orange
    '#84cc16'  // lime
  ];

  function getTaskColor(index) {
    return TASK_COLORS[index % TASK_COLORS.length];
  }

  // --- Tab Navigation ---
  function initNavigation() {
    const tabs = document.querySelectorAll('.tab-btn');
    const panes = document.querySelectorAll('.tab-pane');

    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const targetId = tab.getAttribute('data-tab');

        tabs.forEach(t => t.classList.remove('active'));
        panes.forEach(p => p.classList.remove('active'));

        tab.classList.add('active');
        const targetPane = document.getElementById(targetId);
        if (targetPane) {
          targetPane.classList.add('active');
        }
      });
    });
  }

  // =========================================================================
  // 1. SCHEDULING SIMULATOR
  // =========================================================================

  let currentTasks = [
    { name: 'Sensor', C: 1, T: 4, D: 4, phase: 0 },
    { name: 'Control', C: 2, T: 6, D: 6, phase: 0 },
    { name: 'Logger', C: 3, T: 12, D: 12, phase: 0 }
  ];

  let currentSimulationResult = null;
  let currentStepTick = 0;
  let playInterval = null;

  function renderTasksTable() {
    const tbody = document.getElementById('tasks-table-body');
    if (!tbody) return;

    tbody.innerHTML = '';
    currentTasks.forEach((t, index) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>
          <div style="display:flex;align-items:center;gap:0.5rem;">
            <span style="display:inline-block;width:12px;height:12px;border-radius:2px;background:${getTaskColor(index)}"></span>
            <input type="text" class="task-input-name" data-idx="${index}" value="${t.name}" style="width:110px;">
          </div>
        </td>
        <td><input type="number" class="task-input-c" data-idx="${index}" value="${t.C}" min="1" max="100" style="width:65px;"></td>
        <td><input type="number" class="task-input-t" data-idx="${index}" value="${t.T}" min="1" max="500" style="width:65px;"></td>
        <td><input type="number" class="task-input-d" data-idx="${index}" value="${t.D}" min="1" max="500" style="width:65px;"></td>
        <td><input type="number" class="task-input-phase" data-idx="${index}" value="${t.phase || 0}" min="0" max="500" style="width:65px;"></td>
        <td>
          <button class="btn btn-danger btn-sm btn-remove-task" data-idx="${index}" ${currentTasks.length <= 1 ? 'disabled' : ''}>✕</button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    // Attach listeners
    tbody.querySelectorAll('input').forEach(input => {
      input.addEventListener('change', onTaskInputChange);
    });

    tbody.querySelectorAll('.btn-remove-task').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.target.getAttribute('data-idx'), 10);
        if (currentTasks.length > 1) {
          currentTasks.splice(idx, 1);
          renderTasksTable();
          runSchedulingSimulation();
        }
      });
    });
  }

  function onTaskInputChange(e) {
    const idx = parseInt(e.target.getAttribute('data-idx'), 10);
    const val = e.target.value;

    if (e.target.classList.contains('task-input-name')) {
      currentTasks[idx].name = val.trim();
    } else if (e.target.classList.contains('task-input-c')) {
      currentTasks[idx].C = parseInt(val, 10) || 1;
    } else if (e.target.classList.contains('task-input-t')) {
      currentTasks[idx].T = parseInt(val, 10) || 1;
    } else if (e.target.classList.contains('task-input-d')) {
      currentTasks[idx].D = parseInt(val, 10) || currentTasks[idx].T;
    } else if (e.target.classList.contains('task-input-phase')) {
      currentTasks[idx].phase = parseInt(val, 10) || 0;
    }

    runSchedulingSimulation();
  }

  function runSchedulingSimulation() {
    const errorBox = document.getElementById('scheduling-error-box');
    errorBox.style.display = 'none';

    try {
      const validated = RTOS.validateTasks(currentTasks);
      const policySelect = document.getElementById('sched-policy-select');
      const policy = policySelect ? policySelect.value : 'RM';

      if (policy === 'COMPARE') {
        const comp = RTOS.compare(validated);
        currentSimulationResult = comp.RM; // default viewer to RM
        renderComparisonView(comp);
      } else {
        const result = RTOS.simulate(validated, policy);
        currentSimulationResult = result;
        renderSinglePolicyView(result, validated);
      }

      resetPlayer();
    } catch (err) {
      errorBox.textContent = err.message;
      errorBox.style.display = 'block';
    }
  }

  function renderSinglePolicyView(result, tasks) {
    const singleContainer = document.getElementById('single-sched-view');
    const compareContainer = document.getElementById('compare-sched-view');
    if (singleContainer) singleContainer.style.display = 'block';
    if (compareContainer) compareContainer.style.display = 'none';

    // Summary Cards
    document.getElementById('metric-busy-ticks').textContent = `${result.busyTicks} / ${result.elapsedTicks}`;
    document.getElementById('metric-cpu-util').textContent = `${result.utilizationPercent.toFixed(1)}%`;
    document.getElementById('metric-preemptions').textContent = result.preemptions;
    document.getElementById('metric-handoffs').textContent = result.handoffs;

    // Schedulability Analysis Panel
    const uTotal = RTOS.utilization(tasks);
    const bound = RTOS.rmBound(tasks.length);
    const rtaList = RTOS.responseTimeAnalysis(tasks);

    document.getElementById('rta-util-val').textContent = uTotal.toFixed(3);
    document.getElementById('rta-bound-val').textContent = bound.toFixed(3);

    const rtaStatus = document.getElementById('rta-bound-status');
    if (uTotal <= bound) {
      rtaStatus.innerHTML = '<span class="badge badge-success">Sufficiently Schedulable</span>';
    } else if (uTotal <= 1.0) {
      rtaStatus.innerHTML = '<span class="badge badge-warning">Above Bound (Inconclusive, check RTA)</span>';
    } else {
      rtaStatus.innerHTML = '<span class="badge badge-danger">Overloaded (U > 1.0)</span>';
    }

    // RTA Iteration Table
    const rtaTbody = document.getElementById('rta-table-body');
    if (rtaTbody) {
      rtaTbody.innerHTML = '';
      rtaList.forEach(r => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><strong>${r.name}</strong></td>
          <td>${r.iterations.join(' → ')}</td>
          <td><strong>${r.R}</strong></td>
          <td>${r.D}</td>
          <td>${r.schedulable ? '<span class="badge badge-success">Guaranteed</span>' : '<span class="badge badge-danger">Not Schedulable</span>'}</td>
        `;
        rtaTbody.appendChild(tr);
      });
    }

    // Per-Task Summary Table
    const summaryTbody = document.getElementById('sched-summary-table-body');
    if (summaryTbody) {
      summaryTbody.innerHTML = '';
      result.tasksSummary.forEach((ts, idx) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>
            <div style="display:flex;align-items:center;gap:0.5rem;">
              <span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${getTaskColor(idx)}"></span>
              <strong>${ts.name}</strong>
            </div>
          </td>
          <td>${ts.jobsCount}</td>
          <td><strong>${ts.worstResponse}</strong> ticks</td>
          <td>${ts.avgResponse.toFixed(2)} ticks</td>
          <td>${ts.maxLateness > 0 ? '+' + ts.maxLateness : ts.maxLateness} ticks</td>
          <td>${ts.misses > 0 ? `<span class="badge badge-danger">${ts.misses} Misses</span>` : '<span class="badge badge-success">0</span>'}</td>
          <td>${ts.schedulable ? '<span class="badge badge-success">MET</span>' : '<span class="badge badge-danger">VIOLATED</span>'}</td>
        `;
        summaryTbody.appendChild(tr);
      });
    }

    // Render Gantt
    renderGantt('gantt-chart-container', result, tasks);
  }

  function renderComparisonView(comp) {
    const singleContainer = document.getElementById('single-sched-view');
    const compareContainer = document.getElementById('compare-sched-view');
    if (singleContainer) singleContainer.style.display = 'none';
    if (compareContainer) compareContainer.style.display = 'block';

    renderGantt('compare-rm-gantt', comp.RM, currentTasks);
    renderGantt('compare-edf-gantt', comp.EDF, currentTasks);

    // Render comparison metrics table
    const compTbody = document.getElementById('compare-metrics-body');
    if (compTbody) {
      compTbody.innerHTML = '';
      comp.RM.tasksSummary.forEach((rmT, idx) => {
        const edfT = comp.EDF.tasksSummary.find(t => t.name === rmT.name);
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><strong>${rmT.name}</strong></td>
          <td>${rmT.worstResponse} ticks</td>
          <td>${edfT.worstResponse} ticks</td>
          <td>${rmT.avgResponse.toFixed(2)} ticks</td>
          <td>${edfT.avgResponse.toFixed(2)} ticks</td>
          <td>${rmT.misses}</td>
          <td>${edfT.misses}</td>
        `;
        compTbody.appendChild(tr);
      });
    }
  }

  function renderGantt(containerId, result, tasks) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = '';
    const nameToIndex = {};
    tasks.forEach((t, i) => { nameToIndex[t.name] = i; });

    const wrapper = document.createElement('div');
    wrapper.className = 'gantt-wrapper';

    // 1. Unified CPU execution track
    const cpuRow = document.createElement('div');
    cpuRow.className = 'gantt-timeline-row';
    cpuRow.innerHTML = `<div class="gantt-label">CPU RUN</div>`;

    const cpuTrack = document.createElement('div');
    cpuTrack.className = 'gantt-track';

    result.tickLog.forEach((tickInfo, tick) => {
      const cell = document.createElement('div');
      cell.className = 'gantt-cell';
      cell.style.flex = '1';
      cell.setAttribute('data-tick', tick);

      if (tickInfo.task === 'IDLE') {
        cell.style.background = 'var(--idle-color)';
        cell.textContent = '-';
        cell.title = `Tick ${tick}: IDLE`;
      } else {
        const colorIdx = nameToIndex[tickInfo.task] !== undefined ? nameToIndex[tickInfo.task] : 0;
        cell.style.background = getTaskColor(colorIdx);
        cell.textContent = tickInfo.task.charAt(0);
        cell.title = `Tick ${tick}: ${tickInfo.task} (${tickInfo.job})`;
      }

      cpuTrack.appendChild(cell);
    });
    cpuRow.appendChild(cpuTrack);
    wrapper.appendChild(cpuRow);

    // 2. Individual Task Track with release, deadline, and miss markers
    tasks.forEach((task, tIdx) => {
      const taskRow = document.createElement('div');
      taskRow.className = 'gantt-timeline-row';
      taskRow.innerHTML = `<div class="gantt-label">${task.name}</div>`;

      const taskTrack = document.createElement('div');
      taskTrack.className = 'gantt-track';

      for (let t = 0; t < result.elapsedTicks; t++) {
        const cell = document.createElement('div');
        cell.className = 'gantt-cell';
        cell.style.flex = '1';
        cell.setAttribute('data-tick', t);

        const currentRunning = result.tickLog[t].task === task.name;
        if (currentRunning) {
          cell.style.background = getTaskColor(tIdx);
          cell.textContent = '■';
        } else {
          cell.style.background = 'rgba(255,255,255,0.015)';
        }

        // Job Release indicator
        if (t >= task.phase && ((t - task.phase) % task.T === 0)) {
          const relMarker = document.createElement('div');
          relMarker.className = 'release-indicator';
          relMarker.title = `Release at tick ${t}`;
          cell.appendChild(relMarker);
        }

        // Deadline indicator
        if (t >= task.phase && ((t - task.phase + task.T) % task.T === 0) && t > task.phase) {
          const dlMarker = document.createElement('div');
          dlMarker.className = 'deadline-indicator';
          dlMarker.title = `Deadline at tick ${t}`;
          cell.appendChild(dlMarker);
        }

        // Deadline Miss Check
        const missedJob = result.jobs.find(j => j.taskName === task.name && j.missed && j.deadline === t);
        if (missedJob) {
          const missBar = document.createElement('div');
          missBar.className = 'miss-marker';
          missBar.title = `MISSED DEADLINE: Job finished at ${missedJob.finish} > deadline ${missedJob.deadline}`;
          cell.appendChild(missBar);
        }

        taskTrack.appendChild(cell);
      }

      taskRow.appendChild(taskTrack);
      wrapper.appendChild(taskRow);
    });

    // 3. Time Axis
    const timeAxis = document.createElement('div');
    timeAxis.className = 'gantt-time-axis';
    for (let t = 0; t < result.elapsedTicks; t++) {
      const mark = document.createElement('div');
      mark.className = 'gantt-time-mark';
      mark.style.flex = '1';
      mark.textContent = t;
      timeAxis.appendChild(mark);
    }
    wrapper.appendChild(timeAxis);

    container.appendChild(wrapper);
  }

  // --- Step-Through Player Controls ---
  function resetPlayer() {
    if (playInterval) {
      clearInterval(playInterval);
      playInterval = null;
    }
    currentStepTick = 0;
    updatePlayerDisplay();
  }

  function updatePlayerDisplay() {
    const tickDisplay = document.getElementById('player-tick-counter');
    if (tickDisplay) {
      tickDisplay.textContent = `Tick: ${currentStepTick}`;
    }

    // Highlight active tick in all Gantt cells
    document.querySelectorAll('.gantt-cell').forEach(cell => {
      const tick = parseInt(cell.getAttribute('data-tick'), 10);
      if (tick === currentStepTick) {
        cell.style.outline = '2px solid #06b6d4';
        cell.style.zIndex = '5';
      } else {
        cell.style.outline = 'none';
        cell.style.zIndex = '1';
      }
    });
  }

  function stepForward() {
    if (!currentSimulationResult) return;
    if (currentStepTick < currentSimulationResult.elapsedTicks - 1) {
      currentStepTick++;
      updatePlayerDisplay();
    } else {
      if (playInterval) {
        clearInterval(playInterval);
        playInterval = null;
        document.getElementById('btn-play-pause').textContent = '▶ Play';
      }
    }
  }

  function stepBackward() {
    if (currentStepTick > 0) {
      currentStepTick--;
      updatePlayerDisplay();
    }
  }

  function togglePlay() {
    const btn = document.getElementById('btn-play-pause');
    if (playInterval) {
      clearInterval(playInterval);
      playInterval = null;
      btn.textContent = '▶ Play';
    } else {
      btn.textContent = '⏸ Pause';
      playInterval = setInterval(() => {
        stepForward();
      }, 500);
    }
  }

  // --- Export Functions ---
  function downloadCSV() {
    if (!currentSimulationResult) return;
    const lines = [];
    lines.push('Tick,Task,JobID');
    currentSimulationResult.tickLog.forEach(t => {
      lines.push(`${t.tick},${t.task},${t.job || 'IDLE'}`);
    });
    lines.push('');
    lines.push('Task,Jobs,WorstResponse,AvgResponse,MaxLateness,Misses');
    currentSimulationResult.tasksSummary.forEach(ts => {
      lines.push(`${ts.name},${ts.jobsCount},${ts.worstResponse},${ts.avgResponse.toFixed(2)},${ts.maxLateness},${ts.misses}`);
    });

    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rtos_simulation_${currentSimulationResult.policy.toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadJSON() {
    if (!currentSimulationResult) return;
    const blob = new Blob([JSON.stringify(currentSimulationResult, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rtos_simulation_${currentSimulationResult.policy.toLowerCase()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // =========================================================================
  // 2. MUTEX LAB (Priority Inversion & Inheritance)
  // =========================================================================

  let currentMutexJobs = [
    { name: 'Logger', priority: 1, arrival: 0, program: [{ lock: 3 }, { run: 1 }] },
    { name: 'Sensor', priority: 3, arrival: 1, program: [{ lock: 1 }, { run: 1 }] },
    { name: 'Control', priority: 2, arrival: 2, program: [{ run: 4 }] }
  ];

  function runMutexSimulation() {
    const resNo = RTOS.simulateMutex(currentMutexJobs, { inheritance: false });
    const resWith = RTOS.simulateMutex(currentMutexJobs, { inheritance: true });

    document.getElementById('mutex-inversion-no').textContent = `${resNo.inversionTicks} ticks`;
    document.getElementById('mutex-inversion-with').textContent = `${resWith.inversionTicks} ticks`;

    // Render Side-by-Side timelines
    renderMutexTimeline('mutex-timeline-no', resNo);
    renderMutexTimeline('mutex-timeline-with', resWith);

    // Metrics table
    const tbody = document.getElementById('mutex-metrics-table-body');
    if (tbody) {
      tbody.innerHTML = '';
      currentMutexJobs.forEach(j => {
        const jNo = resNo.jobs.find(x => x.name === j.name);
        const jWith = resWith.jobs.find(x => x.name === j.name);
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><strong>${j.name}</strong> (Priority ${j.priority})</td>
          <td>${jNo.finish}</td>
          <td><strong>${jWith.finish}</strong></td>
          <td>${jNo.response} ticks</td>
          <td><strong style="color:${jWith.response <= jNo.response ? '#10b981' : '#f59e0b'}">${jWith.response} ticks</strong></td>
          <td>${jNo.blockedTicks} ticks</td>
          <td><strong>${jWith.blockedTicks} ticks</strong></td>
        `;
        tbody.appendChild(tr);
      });
    }
  }

  function renderMutexTimeline(containerId, result) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.className = 'gantt-wrapper';

    // 1. CPU Running Track
    const runRow = document.createElement('div');
    runRow.className = 'gantt-timeline-row';
    runRow.innerHTML = `<div class="gantt-label">CPU RUN</div>`;
    const runTrack = document.createElement('div');
    runTrack.className = 'gantt-track';

    result.tickLog.forEach((tInfo, tick) => {
      const cell = document.createElement('div');
      cell.className = 'gantt-cell';
      cell.style.flex = '1';

      if (tInfo.isInversion) {
        cell.className += ' inversion-highlight';
        cell.textContent = tInfo.running;
        cell.title = `Tick ${tick}: Priority Inversion! (${tInfo.running} running while higher priority is blocked)`;
      } else if (tInfo.running === 'IDLE') {
        cell.style.background = 'var(--idle-color)';
        cell.textContent = '-';
      } else {
        cell.style.background = '#3b82f6';
        cell.textContent = tInfo.running.charAt(0);
        cell.title = `Tick ${tick}: ${tInfo.running} (Eff Pri ${tInfo.effectivePriority})`;
      }
      runTrack.appendChild(cell);
    });
    runRow.appendChild(runTrack);
    wrapper.appendChild(runRow);

    // 2. Mutex Holder Bar
    const holderRow = document.createElement('div');
    holderRow.className = 'gantt-timeline-row';
    holderRow.innerHTML = `<div class="gantt-label" style="color:#06b6d4;">LOCK HELD</div>`;
    const holderTrack = document.createElement('div');
    holderTrack.className = 'gantt-track';

    result.tickLog.forEach((tInfo, tick) => {
      const cell = document.createElement('div');
      cell.className = 'gantt-cell';
      cell.style.flex = '1';

      if (tInfo.mutexHolder) {
        cell.style.background = '#06b6d4';
        cell.textContent = tInfo.mutexHolder.charAt(0);
        cell.title = `Tick ${tick}: Lock held by ${tInfo.mutexHolder}`;
      } else {
        cell.style.background = 'rgba(255,255,255,0.02)';
      }
      holderTrack.appendChild(cell);
    });
    holderRow.appendChild(holderTrack);
    wrapper.appendChild(holderRow);

    // 3. Time axis
    const timeAxis = document.createElement('div');
    timeAxis.className = 'gantt-time-axis';
    for (let t = 0; t < result.totalTicks; t++) {
      const mark = document.createElement('div');
      mark.className = 'gantt-time-mark';
      mark.style.flex = '1';
      mark.textContent = t;
      timeAxis.appendChild(mark);
    }
    wrapper.appendChild(timeAxis);

    container.appendChild(wrapper);
  }

  // =========================================================================
  // 3. TEMPERATURE-MONITORING NODE
  // =========================================================================

  let tempApp = null;
  let tempSimTick = 0;
  let tempAppInterval = null;

  function initTemperatureNode() {
    tempApp = RTOS.createTemperatureNodeApp({ policy: 'RM' });
    tempSimTick = 0;
    updateTemperatureDisplay();
  }

  function stepTemperatureNode() {
    if (!tempApp) return;

    // Fixed task periods: Sensor (T=4, C=1), Control (T=6, C=2), Logger (T=12, C=3)
    const t = tempSimTick;

    // Check task completions at current tick based on the schedule
    // Sensor completes at ticks 1, 5, 9...
    if (t % 4 === 1) {
      tempApp.onSensorComplete(t, false);
    }
    // Control completes at ticks 3, 9 (EDF) or 3, 8 (RM)...
    if (t % 6 === 3) {
      tempApp.onControlComplete(t, false);
    }
    // Logger completes at tick 10...
    if (t % 12 === 10) {
      tempApp.onLoggerComplete(t, false);
    }

    tempSimTick++;
    updateTemperatureDisplay();
  }

  function updateTemperatureDisplay() {
    if (!tempApp) return;
    const state = tempApp.getState();

    // Tick counter
    document.getElementById('temp-tick-counter').textContent = `Tick: ${tempSimTick}`;

    // Temperature reading
    const curTemp = tempApp.getAmbientTemp(tempSimTick);
    document.getElementById('current-temp-reading').textContent = `${curTemp.toFixed(1)}°C`;
    document.getElementById('buffer-temp-val').textContent = `${state.buffer.temp.toFixed(1)}°C`;
    document.getElementById('buffer-timestamp-val').textContent = `Tick ${state.buffer.timestamp}`;

    // Heater LED
    const heaterLed = document.getElementById('heater-led');
    const heaterText = document.getElementById('heater-state-text');
    if (state.heaterState === 'ON') {
      heaterLed.classList.add('active');
      heaterText.textContent = 'HEATER: ON';
      heaterText.style.color = '#ef4444';
    } else {
      heaterLed.classList.remove('active');
      heaterText.textContent = 'HEATER: OFF';
      heaterText.style.color = '#94a3b8';
    }

    // System Status
    const statusPill = document.getElementById('system-status-pill');
    if (state.systemStatus === 'FAULT') {
      statusPill.innerHTML = '<span class="badge badge-danger">SYSTEM FAULT</span>';
    } else {
      statusPill.innerHTML = '<span class="badge badge-success">SYSTEM HEALTHY</span>';
    }

    // Rolling Logs Table
    const logTbody = document.getElementById('temp-log-body');
    if (logTbody) {
      logTbody.innerHTML = '';
      const recentLogs = state.logs.slice(-8).reverse();
      recentLogs.forEach(entry => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>Tick ${entry.tick}</td>
          <td>${entry.bufferTemp.toFixed(1)}°C</td>
          <td><span class="badge ${entry.heaterState === 'ON' ? 'badge-danger' : 'badge-info'}">${entry.heaterState}</span></td>
          <td>${entry.status === 'OK' ? '<span class="badge badge-success">OK</span>' : '<span class="badge badge-warning">LATE</span>'}</td>
        `;
        logTbody.appendChild(tr);
      });
    }
  }

  function toggleTemperaturePlay() {
    const btn = document.getElementById('btn-temp-play');
    if (tempAppInterval) {
      clearInterval(tempAppInterval);
      tempAppInterval = null;
      btn.textContent = '▶ Auto Play';
    } else {
      btn.textContent = '⏸ Pause';
      tempAppInterval = setInterval(() => {
        stepTemperatureNode();
      }, 400);
    }
  }

  // --- Attach All UI Event Listeners ---
  function init() {
    initNavigation();
    renderTasksTable();
    runSchedulingSimulation();
    runMutexSimulation();
    initTemperatureNode();

    // Preset Buttons
    document.getElementById('btn-load-case-a')?.addEventListener('click', () => {
      currentTasks = [
        { name: 'Sensor', C: 1, T: 4, D: 4, phase: 0 },
        { name: 'Control', C: 2, T: 6, D: 6, phase: 0 },
        { name: 'Logger', C: 3, T: 12, D: 12, phase: 0 }
      ];
      renderTasksTable();
      runSchedulingSimulation();
    });

    document.getElementById('btn-load-case-b')?.addEventListener('click', () => {
      currentTasks = [
        { name: 'T1', C: 2, T: 5, D: 5, phase: 0 },
        { name: 'T2', C: 4, T: 7, D: 7, phase: 0 }
      ];
      renderTasksTable();
      runSchedulingSimulation();
    });

    document.getElementById('btn-add-task')?.addEventListener('click', () => {
      if (currentTasks.length < 10) {
        currentTasks.push({
          name: 'Task' + (currentTasks.length + 1),
          C: 1,
          T: 10,
          D: 10,
          phase: 0
        });
        renderTasksTable();
        runSchedulingSimulation();
      }
    });

    document.getElementById('sched-policy-select')?.addEventListener('change', () => {
      runSchedulingSimulation();
    });

    // Player Controls
    document.getElementById('btn-play-pause')?.addEventListener('click', togglePlay);
    document.getElementById('btn-step-fwd')?.addEventListener('click', stepForward);
    document.getElementById('btn-step-bwd')?.addEventListener('click', stepBackward);
    document.getElementById('btn-reset-player')?.addEventListener('click', resetPlayer);

    // Downloads
    document.getElementById('btn-download-csv')?.addEventListener('click', downloadCSV);
    document.getElementById('btn-download-json')?.addEventListener('click', downloadJSON);

    // Mutex Lab Presets
    document.getElementById('btn-mutex-ref')?.addEventListener('click', () => {
      currentMutexJobs = [
        { name: 'Logger', priority: 1, arrival: 0, program: [{ lock: 3 }, { run: 1 }] },
        { name: 'Sensor', priority: 3, arrival: 1, program: [{ lock: 1 }, { run: 1 }] },
        { name: 'Control', priority: 2, arrival: 2, program: [{ run: 4 }] }
      ];
      runMutexSimulation();
    });

    // Temperature Node Controls
    document.getElementById('btn-temp-step')?.addEventListener('click', stepTemperatureNode);
    document.getElementById('btn-temp-play')?.addEventListener('click', toggleTemperaturePlay);
    document.getElementById('btn-temp-reset')?.addEventListener('click', initTemperatureNode);

    // Fault Injection Triggers
    document.getElementById('btn-trigger-fault')?.addEventListener('click', () => {
      if (tempApp) {
        tempApp.onSensorComplete(tempSimTick, true); // trigger Hard deadline miss
        updateTemperatureDisplay();
      }
    });

    document.getElementById('btn-trigger-discard')?.addEventListener('click', () => {
      if (tempApp) {
        tempApp.onControlComplete(tempSimTick, true); // trigger Firm deadline miss
        updateTemperatureDisplay();
      }
    });

    document.getElementById('btn-trigger-late')?.addEventListener('click', () => {
      if (tempApp) {
        tempApp.onLoggerComplete(tempSimTick, true); // trigger Soft deadline miss
        updateTemperatureDisplay();
      }
    });
  }

  // Run on DOM loaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
