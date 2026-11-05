/**
 * RTOS-Sim Core Engine
 * Pure functions for task scheduling, schedulability analysis,
 * mutex simulation with priority inheritance, and metrics.
 * 
 * Works in both Node.js (CommonJS) and browser (window.RTOS).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.RTOS = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // --- Math Utilities ---

  function gcd(a, b) {
    a = Math.abs(a);
    b = Math.abs(b);
    while (b !== 0) {
      var t = b;
      b = a % b;
      a = t;
    }
    return a;
  }

  function lcm(a, b) {
    if (a === 0 || b === 0) return 0;
    return Math.abs((a * b) / gcd(a, b));
  }

  // --- PRNG Utility (Mulberry32) ---
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // --- Input Validation ---

  function validateTasks(tasks) {
    if (!Array.isArray(tasks)) {
      throw new Error('Validation error: tasks must be an array.');
    }
    if (tasks.length < 1 || tasks.length > 10) {
      throw new Error('Validation error: task count must be between 1 and 10 (received ' + tasks.length + ').');
    }

    var seenNames = Object.create(null);
    var normalized = [];

    for (var i = 0; i < tasks.length; i++) {
      var t = tasks[i];
      if (!t || typeof t !== 'object') {
        throw new Error('Validation error: task at index ' + i + ' must be an object.');
      }

      // Name validation
      if (typeof t.name !== 'string' || t.name.trim() === '') {
        throw new Error('Validation error: task at index ' + i + ' has an empty or invalid name.');
      }
      var trimmedName = t.name.trim();
      if (trimmedName.toUpperCase() === 'IDLE') {
        throw new Error('Validation error: task name cannot be IDLE (reserved for idle CPU ticks).');
      }
      if (seenNames[trimmedName]) {
        throw new Error('Validation error: duplicate task name "' + trimmedName + '". Task names must be unique.');
      }
      seenNames[trimmedName] = true;

      // Integer and range validation
      if (!Number.isInteger(t.C) || t.C < 1) {
        throw new Error('Validation error: task "' + trimmedName + '" WCET (C) must be an integer >= 1.');
      }
      if (!Number.isInteger(t.T) || t.T < 1) {
        throw new Error('Validation error: task "' + trimmedName + '" period (T) must be an integer >= 1.');
      }

      var D = t.D;
      if (D === undefined || D === null) {
        D = t.T;
      } else if (!Number.isInteger(D) || D < 1) {
        throw new Error('Validation error: task "' + trimmedName + '" deadline (D) must be an integer >= 1.');
      }

      if (t.C > D) {
        throw new Error('Validation error: task "' + trimmedName + '" WCET (C=' + t.C + ') exceeds deadline (D=' + D + ').');
      }
      if (D > t.T) {
        throw new Error('Validation error: task "' + trimmedName + '" deadline (D=' + D + ') exceeds period (T=' + t.T + ').');
      }

      var phase = 0;
      if (t.phase !== undefined && t.phase !== null) {
        if (!Number.isInteger(t.phase) || t.phase < 0) {
          throw new Error('Validation error: task "' + trimmedName + '" phase must be an integer >= 0.');
        }
        phase = t.phase;
      }

      normalized.push({
        name: trimmedName,
        C: t.C,
        T: t.T,
        D: D,
        phase: phase
      });
    }

    return normalized;
  }

  // --- Analysis Functions ---

  function hyperperiod(tasks) {
    var valid = validateTasks(tasks);
    var pLcm = valid.reduce(function (acc, t) {
      return lcm(acc, t.T);
    }, 1);

    var maxPhase = valid.reduce(function (max, t) {
      return Math.max(max, t.phase);
    }, 0);

    return maxPhase + pLcm;
  }

  function utilization(tasks) {
    var valid = validateTasks(tasks);
    return valid.reduce(function (sum, t) {
      return sum + (t.C / t.T);
    }, 0);
  }

  function rmBound(n) {
    if (!Number.isInteger(n) || n < 1) {
      throw new Error('rmBound error: n must be an integer >= 1.');
    }
    return n * (Math.pow(2, 1 / n) - 1);
  }

  function responseTimeAnalysis(tasks) {
    var valid = validateTasks(tasks);

    // RM Priority: shorter period = higher priority. Tie-break: original input order.
    var indexed = valid.map(function (t, idx) {
      return { task: t, originalIndex: idx };
    });

    indexed.sort(function (a, b) {
      if (a.task.T !== b.task.T) {
        return a.task.T - b.task.T;
      }
      return a.originalIndex - b.originalIndex;
    });

    var results = [];

    for (var i = 0; i < indexed.length; i++) {
      var ti = indexed[i].task;
      var R = ti.C;
      var iterations = [R];
      var schedulable = true;

      while (true) {
        var interference = 0;
        for (var j = 0; j < i; j++) {
          var tj = indexed[j].task;
          interference += Math.ceil(R / tj.T) * tj.C;
        }

        var R_next = ti.C + interference;
        iterations.push(R_next);

        if (R_next === R) {
          schedulable = (R <= ti.D);
          break;
        }

        if (R_next > ti.D) {
          R = R_next;
          schedulable = false;
          break;
        }

        R = R_next;
      }

      results.push({
        name: ti.name,
        C: ti.C,
        T: ti.T,
        D: ti.D,
        R: R,
        schedulable: schedulable,
        iterations: iterations
      });
    }

    // Return in original input order
    var nameToResult = Object.create(null);
    results.forEach(function (r) {
      nameToResult[r.name] = r;
    });

    return valid.map(function (t) {
      return nameToResult[t.name];
    });
  }

  // --- Task Scheduling Simulation (RM & EDF) ---

  function simulate(tasks, policy, options) {
    var valid = validateTasks(tasks);
    policy = (policy || 'RM').toUpperCase();
    if (policy !== 'RM' && policy !== 'EDF') {
      throw new Error('Simulation error: policy must be "RM" or "EDF" (received "' + policy + '").');
    }

    var window = (options && options.window) ? options.window : hyperperiod(valid);

    // Track active jobs
    var activeJobs = [];
    var allJobs = [];
    var tickLog = [];
    var segments = [];

    var lastRunningJob = null;
    var preemptions = 0;
    var handoffs = 0;
    var busyTicks = 0;

    // Next job index counter per task
    var taskNextJobIdx = Object.create(null);
    valid.forEach(function (t) {
      taskNextJobIdx[t.name] = 0;
    });

    for (var t = 0; t < window; t++) {
      // 1. Release new jobs at tick t
      for (var i = 0; i < valid.length; i++) {
        var task = valid[i];
        if (t >= task.phase && ((t - task.phase) % task.T === 0)) {
          var jobIdx = taskNextJobIdx[task.name]++;
          var job = {
            id: task.name + '_J' + jobIdx,
            taskName: task.name,
            jobIndex: jobIdx,
            taskIndex: i,
            release: t,
            period: task.T,
            deadline: t + task.D,
            C: task.C,
            remaining: task.C,
            start: null,
            finish: null,
            response: null,
            lateness: null,
            missed: false
          };
          activeJobs.push(job);
          allJobs.push(job);
        }
      }

      // 2. Select job to run based on policy
      var runningJob = null;
      if (activeJobs.length > 0) {
        if (policy === 'RM') {
          // RM: shorter period = higher priority.
          // Tie-break 1: input order (taskIndex).
          // Tie-break 2: earlier release.
          activeJobs.sort(function (a, b) {
            if (a.period !== b.period) return a.period - b.period;
            if (a.taskIndex !== b.taskIndex) return a.taskIndex - b.taskIndex;
            return a.release - b.release;
          });
        } else if (policy === 'EDF') {
          // EDF: earlier absolute deadline = higher priority.
          // Tie-break 1: earlier release.
          // Tie-break 2: input order (taskIndex).
          activeJobs.sort(function (a, b) {
            if (a.deadline !== b.deadline) return a.deadline - b.deadline;
            if (a.release !== b.release) return a.release - b.release;
            return a.taskIndex - b.taskIndex;
          });
        }
        runningJob = activeJobs[0];
      }

      // 3. Track preemptions and handoffs
      if (lastRunningJob !== null && runningJob !== null && lastRunningJob !== runningJob) {
        handoffs++;
        if (lastRunningJob.remaining > 0) {
          preemptions++;
        }
      }

      // 4. Execute 1 tick
      if (runningJob) {
        busyTicks++;
        if (runningJob.start === null) {
          runningJob.start = t;
        }
        runningJob.remaining--;

        tickLog.push({
          tick: t,
          task: runningJob.taskName,
          job: runningJob.id
        });

        // Did job complete at t + 1?
        if (runningJob.remaining === 0) {
          runningJob.finish = t + 1;
          runningJob.response = runningJob.finish - runningJob.release;
          runningJob.lateness = runningJob.finish - runningJob.deadline;
          runningJob.missed = runningJob.lateness > 0;

          // Remove from active jobs
          activeJobs.shift();
        }
      } else {
        tickLog.push({
          tick: t,
          task: 'IDLE',
          job: null
        });
      }

      lastRunningJob = runningJob;
    }

    // Build contiguous segments
    if (tickLog.length > 0) {
      var curSeg = {
        task: tickLog[0].task,
        job: tickLog[0].job,
        start: 0,
        end: 1
      };

      for (var s = 1; s < tickLog.length; s++) {
        var curTick = tickLog[s];
        if (curTick.task === curSeg.task && curTick.job === curSeg.job) {
          curSeg.end = s + 1;
        } else {
          segments.push(curSeg);
          curSeg = {
            task: curTick.task,
            job: curTick.job,
            start: s,
            end: s + 1
          };
        }
      }
      segments.push(curSeg);
    }

    // Build per-task summary statistics
    var perTask = Object.create(null);
    valid.forEach(function (t) {
      perTask[t.name] = {
        name: t.name,
        C: t.C,
        T: t.T,
        D: t.D,
        jobsCount: 0,
        completedJobs: 0,
        worstResponse: 0,
        avgResponse: 0,
        maxLateness: -Infinity,
        misses: 0,
        schedulable: true,
        jobs: []
      };
    });

    allJobs.forEach(function (j) {
      var pt = perTask[j.taskName];
      pt.jobsCount++;
      pt.jobs.push(j);

      if (j.finish !== null) {
        pt.completedJobs++;
        if (j.response > pt.worstResponse) {
          pt.worstResponse = j.response;
        }
        if (j.lateness > pt.maxLateness) {
          pt.maxLateness = j.lateness;
        }
        if (j.missed) {
          pt.misses++;
          pt.schedulable = false;
        }
      } else {
        // Did not finish within window
        pt.schedulable = false;
      }
    });

    // Compute averages and handle tasks with no completions or all early
    var tasksSummary = valid.map(function (t) {
      var pt = perTask[t.name];
      var totalResp = pt.jobs.reduce(function (sum, j) {
        return sum + (j.response !== null ? j.response : 0);
      }, 0);
      pt.avgResponse = pt.completedJobs > 0 ? (totalResp / pt.completedJobs) : 0;
      if (pt.maxLateness === -Infinity) pt.maxLateness = 0;
      return pt;
    });

    var totalMisses = tasksSummary.reduce(function (sum, pt) {
      return sum + pt.misses;
    }, 0);

    return {
      policy: policy,
      window: window,
      busyTicks: busyTicks,
      elapsedTicks: window,
      utilizationPercent: (busyTicks / window) * 100,
      preemptions: preemptions,
      handoffs: handoffs,
      totalMisses: totalMisses,
      allMet: totalMisses === 0,
      segments: segments,
      tickLog: tickLog,
      jobs: allJobs,
      tasksSummary: tasksSummary
    };
  }

  function compare(tasks) {
    var rmResult = simulate(tasks, 'RM');
    var edfResult = simulate(tasks, 'EDF');
    return {
      RM: rmResult,
      EDF: edfResult,
      analysis: {
        utilization: utilization(tasks),
        rmBound: rmBound(tasks.length),
        rta: responseTimeAnalysis(tasks)
      }
    };
  }

  // --- Milestone 2: Mutex & Resource Management ---

  function validateMutexJobs(jobs) {
    if (!Array.isArray(jobs) || jobs.length < 1) {
      throw new Error('Mutex validation error: jobs must be a non-empty array.');
    }

    var seenNames = Object.create(null);
    var normalized = [];

    for (var i = 0; i < jobs.length; i++) {
      var j = jobs[i];
      if (!j || typeof j !== 'object') {
        throw new Error('Mutex validation error: job at index ' + i + ' must be an object.');
      }
      if (typeof j.name !== 'string' || j.name.trim() === '') {
        throw new Error('Mutex validation error: job at index ' + i + ' has an empty or invalid name.');
      }
      var trimmed = j.name.trim();
      if (seenNames[trimmed]) {
        throw new Error('Mutex validation error: duplicate job name "' + trimmed + '".');
      }
      seenNames[trimmed] = true;

      if (!Number.isInteger(j.priority) || j.priority < 1) {
        throw new Error('Mutex validation error: job "' + trimmed + '" priority must be an integer >= 1.');
      }
      if (!Number.isInteger(j.arrival) || j.arrival < 0) {
        throw new Error('Mutex validation error: job "' + trimmed + '" arrival must be an integer >= 0.');
      }

      if (!Array.isArray(j.program) || j.program.length === 0) {
        throw new Error('Mutex validation error: job "' + trimmed + '" program must be a non-empty array.');
      }

      var normalizedProgram = [];
      var insideLock = false;

      for (var p = 0; p < j.program.length; p++) {
        var step = j.program[p];
        if (!step || typeof step !== 'object') {
          throw new Error('Mutex validation error: job "' + trimmed + '" step ' + p + ' must be an object.');
        }

        if (step.run !== undefined) {
          if (!Number.isInteger(step.run) || step.run < 1) {
            throw new Error('Mutex validation error: job "' + trimmed + '" run duration must be an integer >= 1.');
          }
          normalizedProgram.push({ type: 'run', duration: step.run });
        } else if (step.lock !== undefined) {
          if (typeof step.lock === 'object' || step.nested !== undefined) {
            throw new Error('Mutex validation error: job "' + trimmed + '" nested locks are not supported.');
          }
          if (!Number.isInteger(step.lock) || step.lock < 1) {
            throw new Error('Mutex validation error: job "' + trimmed + '" lock duration must be an integer >= 1.');
          }
          normalizedProgram.push({ type: 'lock', duration: step.lock });
        } else {
          throw new Error('Mutex validation error: job "' + trimmed + '" step ' + p + ' must have either "run" or "lock".');
        }
      }

      normalized.push({
        name: trimmed,
        priority: j.priority,
        arrival: j.arrival,
        program: normalizedProgram,
        originalIndex: i
      });
    }

    return normalized;
  }

  function simulateMutex(jobs, options) {
    var validJobs = validateMutexJobs(jobs);
    var inheritance = !!(options && options.inheritance);

    // Initialize job state trackers
    var states = validJobs.map(function (j) {
      return {
        name: j.name,
        basePriority: j.priority,
        effectivePriority: j.priority,
        arrival: j.arrival,
        originalIndex: j.originalIndex,
        program: j.program.map(function (st) {
          return { type: st.type, remaining: st.duration, total: st.duration };
        }),
        currentStepIdx: 0,
        holdingLock: false,
        isBlocked: false,
        start: null,
        finish: null,
        response: null,
        blockedTicks: 0,
        completed: false
      };
    });

    var mutexHolder = null;
    var waitQueue = []; // jobs blocked waiting for mutex
    var tickLog = [];
    var inversionTicks = 0;
    var t = 0;

    // Safety guard to avoid infinite loops if something goes wrong
    var maxTicks = 10000;

    while (t < maxTicks) {
      // Check if all jobs are completed
      var allDone = states.every(function (st) {
        return st.completed;
      });
      if (allDone) break;

      // 1. Calculate effective priorities
      if (inheritance && mutexHolder !== null) {
        var maxWaitPriority = mutexHolder.basePriority;
        for (var w = 0; w < waitQueue.length; w++) {
          if (waitQueue[w].basePriority > maxWaitPriority) {
            maxWaitPriority = waitQueue[w].basePriority;
          }
        }
        mutexHolder.effectivePriority = maxWaitPriority;
      } else {
        states.forEach(function (st) {
          st.effectivePriority = st.basePriority;
        });
      }

      // 2. Find eligible jobs (arrived, not completed, not blocked in waitQueue)
      var eligible = [];
      for (var i = 0; i < states.length; i++) {
        var st = states[i];
        if (t >= st.arrival && !st.completed && !st.isBlocked) {
          eligible.push(st);
        }
      }

      // Sort eligible by effective priority (higher wins), then earlier arrival, then input index
      eligible.sort(function (a, b) {
        if (a.effectivePriority !== b.effectivePriority) {
          return b.effectivePriority - a.effectivePriority;
        }
        if (a.arrival !== b.arrival) {
          return a.arrival - b.arrival;
        }
        return a.originalIndex - b.originalIndex;
      });

      // 3. Selection loop: try to select the highest priority candidate that can run
      var runningJob = null;

      while (eligible.length > 0) {
        var top = eligible[0];
        var step = top.program[top.currentStepIdx];

        if (step.type === 'lock' && !top.holdingLock) {
          // Job wants to acquire lock
          if (mutexHolder === null) {
            // Mutex is free! Acquire lock
            mutexHolder = top;
            top.holdingLock = true;
            runningJob = top;
            break;
          } else if (mutexHolder === top) {
            // Already holds mutex
            runningJob = top;
            break;
          } else {
            // Mutex is held by another job -> top BLOCKS!
            top.isBlocked = true;
            waitQueue.push(top);
            eligible.shift(); // Remove from eligible

            // If inheritance is enabled, update holder's effective priority immediately and re-sort eligible
            if (inheritance && mutexHolder !== null) {
              if (top.basePriority > mutexHolder.effectivePriority) {
                mutexHolder.effectivePriority = top.basePriority;
              }
              // Re-sort remaining eligible jobs
              eligible.sort(function (a, b) {
                if (a.effectivePriority !== b.effectivePriority) {
                  return b.effectivePriority - a.effectivePriority;
                }
                if (a.arrival !== b.arrival) {
                  return a.arrival - b.arrival;
                }
                return a.originalIndex - b.originalIndex;
              });
            }
          }
        } else {
          // Regular run step, or lock step where lock is already held
          runningJob = top;
          break;
        }
      }

      // 4. Inversion check at tick t:
      // "Inversion ticks = ticks in which the highest-priority job is blocked while a job that does not hold the mutex is running."
      // Find highest base priority among all arrived, incomplete jobs
      var highestIncompletePriority = 0;
      var highestIncompleteJob = null;
      for (var k = 0; k < states.length; k++) {
        var sJob = states[k];
        if (t >= sJob.arrival && !sJob.completed) {
          if (sJob.basePriority > highestIncompletePriority) {
            highestIncompletePriority = sJob.basePriority;
            highestIncompleteJob = sJob;
          }
        }
      }

      var isTickInversion = false;
      if (highestIncompleteJob && highestIncompleteJob.isBlocked) {
        if (runningJob !== null && runningJob !== mutexHolder) {
          isTickInversion = true;
          inversionTicks++;
        }
      }

      // Record blocked ticks for everyone in waitQueue
      for (var bIdx = 0; bIdx < waitQueue.length; bIdx++) {
        waitQueue[bIdx].blockedTicks++;
      }

      // 5. Execute 1 tick of runningJob
      if (runningJob) {
        if (runningJob.start === null) {
          runningJob.start = t;
        }

        var curStep = runningJob.program[runningJob.currentStepIdx];
        curStep.remaining--;

        tickLog.push({
          tick: t,
          running: runningJob.name,
          effectivePriority: runningJob.effectivePriority,
          basePriority: runningJob.basePriority,
          holdingMutex: runningJob.holdingLock,
          mutexHolder: mutexHolder ? mutexHolder.name : null,
          blocked: waitQueue.map(function (j) { return j.name; }),
          isInversion: isTickInversion
        });

        // Did current step finish at t + 1?
        if (curStep.remaining === 0) {
          if (curStep.type === 'lock' && runningJob.holdingLock) {
            // Implicit unlock at end of lock step
            runningJob.holdingLock = false;
            mutexHolder = null;

            // Wake up highest-priority blocked job from waitQueue
            if (waitQueue.length > 0) {
              // Sort waitQueue by base priority descending, tie-break earlier arrival
              waitQueue.sort(function (a, b) {
                if (a.basePriority !== b.basePriority) return b.basePriority - a.basePriority;
                return a.arrival - b.arrival;
              });

              var nextJob = waitQueue.shift();
              nextJob.isBlocked = false;
              // Mutex is immediately acquired by the newly unblocked job
              mutexHolder = nextJob;
              nextJob.holdingLock = true;
            }

            // Drop runningJob's priority back to base
            runningJob.effectivePriority = runningJob.basePriority;
          }

          // Advance step index
          runningJob.currentStepIdx++;
          if (runningJob.currentStepIdx >= runningJob.program.length) {
            runningJob.completed = true;
            runningJob.finish = t + 1;
            runningJob.response = runningJob.finish - runningJob.arrival;
          }
        }
      } else {
        tickLog.push({
          tick: t,
          running: 'IDLE',
          effectivePriority: null,
          basePriority: null,
          holdingMutex: false,
          mutexHolder: mutexHolder ? mutexHolder.name : null,
          blocked: waitQueue.map(function (j) { return j.name; }),
          isInversion: isTickInversion
        });
      }

      t++;
    }

    // Build timeline segments for each job (RUN, BLOCKED, IDLE)
    var jobResults = states.map(function (st) {
      return {
        name: st.name,
        priority: st.basePriority,
        arrival: st.arrival,
        start: st.start,
        finish: st.finish,
        response: st.response,
        blockedTicks: st.blockedTicks
      };
    });

    return {
      inheritance: inheritance,
      totalTicks: t,
      inversionTicks: inversionTicks,
      jobs: jobResults,
      tickLog: tickLog
    };
  }

  // --- Milestone 2: Temperature-Monitoring Node Application Logic ---

  function createTemperatureNodeApp(config) {
    config = config || {};
    var policy = config.policy || 'RM';
    var tempBase = 20.0;
    var targetTemp = 21.0;
    var hysteresis = 0.5;

    // Fixed task parameters from specification
    var tasks = [
      { name: 'Sensor', T: 4, C: 1, D: 4, class: 'Hard' },
      { name: 'Control', T: 6, C: 2, D: 6, class: 'Firm' },
      { name: 'Logger', T: 12, C: 3, D: 12, class: 'Soft' }
    ];

    // Shared state
    var buffer = { temp: tempBase, timestamp: 0 };
    var heaterState = 'OFF';
    var logs = [];
    var systemStatus = 'NORMAL'; // 'NORMAL' or 'FAULT'

    // Deterministic temperature signal at tick t
    function getAmbientTemp(tick) {
      // Slow sinusoid + pseudo-noise
      var wave = 5.0 * Math.sin(tick * 0.25);
      var noise = ((tick * 13) % 7) * 0.1;
      return +(tempBase + wave + noise).toFixed(2);
    }

    // Simulates the application step at a given tick based on task execution
    function onSensorComplete(tick, missed) {
      if (missed) {
        systemStatus = 'FAULT'; // Hard deadline missed -> system FAULT
        return;
      }
      var sample = getAmbientTemp(tick);
      buffer.temp = sample;
      buffer.timestamp = tick;
    }

    function onControlComplete(tick, missed) {
      if (missed) {
        // Firm deadline missed: discard result, heater command not updated
        return;
      }
      // Bang-bang with hysteresis band around targetTemp (21.0)
      if (buffer.temp < (targetTemp - hysteresis)) {
        heaterState = 'ON';
      } else if (buffer.temp > (targetTemp + hysteresis)) {
        heaterState = 'OFF';
      }
    }

    function onLoggerComplete(tick, missed) {
      // Soft deadline: keep record, but mark if late
      var entry = {
        tick: tick,
        bufferTemp: buffer.temp,
        heaterState: heaterState,
        status: missed ? 'LATE' : 'OK'
      };
      logs.push(entry);
    }

    return {
      tasks: tasks,
      policy: policy,
      getAmbientTemp: getAmbientTemp,
      onSensorComplete: onSensorComplete,
      onControlComplete: onControlComplete,
      onLoggerComplete: onLoggerComplete,
      getState: function () {
        return {
          buffer: { temp: buffer.temp, timestamp: buffer.timestamp },
          heaterState: heaterState,
          logs: logs.slice(),
          systemStatus: systemStatus
        };
      }
    };
  }

  // --- Export API ---
  return {
    gcd: gcd,
    lcm: lcm,
    mulberry32: mulberry32,
    validateTasks: validateTasks,
    hyperperiod: hyperperiod,
    utilization: utilization,
    rmBound: rmBound,
    responseTimeAnalysis: responseTimeAnalysis,
    simulate: simulate,
    compare: compare,
    validateMutexJobs: validateMutexJobs,
    simulateMutex: simulateMutex,
    createTemperatureNodeApp: createTemperatureNodeApp
  };
}));
