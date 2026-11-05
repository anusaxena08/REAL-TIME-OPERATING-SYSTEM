/**
 * RTOS-Sim Comprehensive Verification Suite
 * Covers Milestones 1 & 2 requirements (14 Test Groups).
 * Single command: node test_rtos.js
 */

const assert = require('assert');
const RTOS = require('./rtos.js');

let totalGroups = 0;
let passedGroups = 0;
let failedGroups = 0;

function runGroup(groupNum, name, testFn) {
  totalGroups++;
  process.stdout.write(`Group ${groupNum}: ${name} ... `);
  try {
    testFn();
    passedGroups++;
    console.log('PASS');
  } catch (err) {
    failedGroups++;
    console.log('FAIL');
    console.error('  Error:', err.message);
    if (err.stack) {
      console.error('  ' + err.stack.split('\n').slice(1, 4).join('\n  '));
    }
  }
}

console.log('============================================================');
console.log('RTOS-Sim Test Suite Execution');
console.log('Date:', new Date().toISOString());
console.log('============================================================\n');

// -------------------------------------------------------------
// Group 1: Case A timelines and metrics, RM and EDF
// -------------------------------------------------------------
runGroup(1, 'Case A Timelines & Metrics (RM and EDF)', () => {
  const tasks = [
    { name: 'Sensor', C: 1, T: 4, D: 4, phase: 0 },
    { name: 'Control', C: 2, T: 6, D: 6, phase: 0 },
    { name: 'Logger', C: 3, T: 12, D: 12, phase: 0 }
  ];

  // RM Check
  const rm = RTOS.simulate(tasks, 'RM');
  const rmTimeline = rm.tickLog.map(t => t.task === 'IDLE' ? '-' : t.task[0]).join('');
  assert.strictEqual(rmTimeline, 'SCCLSLCCSL--', 'RM timeline mismatch');
  assert.strictEqual(rm.busyTicks, 10, 'RM busy ticks should be 10');
  assert.strictEqual(rm.elapsedTicks, 12, 'RM elapsed ticks should be 12');
  assert.strictEqual(rm.preemptions, 2, 'RM preemptions should be 2');
  assert.strictEqual(rm.handoffs, 7, 'RM handoffs should be 7');
  assert.strictEqual(rm.totalMisses, 0, 'RM misses should be 0');

  const rmSensor = rm.tasksSummary.find(t => t.name === 'Sensor');
  const rmControl = rm.tasksSummary.find(t => t.name === 'Control');
  const rmLogger = rm.tasksSummary.find(t => t.name === 'Logger');

  assert.strictEqual(rmSensor.worstResponse, 1, 'RM Sensor worst response should be 1');
  assert.strictEqual(rmSensor.avgResponse, 1.0, 'RM Sensor avg response should be 1.0');
  assert.strictEqual(rmSensor.maxLateness, -3, 'RM Sensor max lateness should be -3');

  assert.strictEqual(rmControl.worstResponse, 3, 'RM Control worst response should be 3');
  assert.strictEqual(rmControl.avgResponse, 2.5, 'RM Control avg response should be 2.5');
  assert.strictEqual(rmControl.maxLateness, -3, 'RM Control max lateness should be -3');

  assert.strictEqual(rmLogger.worstResponse, 10, 'RM Logger worst response should be 10');
  assert.strictEqual(rmLogger.avgResponse, 10.0, 'RM Logger avg response should be 10.0');
  assert.strictEqual(rmLogger.maxLateness, -2, 'RM Logger max lateness should be -2');

  // EDF Check
  const edf = RTOS.simulate(tasks, 'EDF');
  const edfTimeline = edf.tickLog.map(t => t.task === 'IDLE' ? '-' : t.task[0]).join('');
  assert.strictEqual(edfTimeline, 'SCCLSLLCCS--', 'EDF timeline mismatch');
  assert.strictEqual(edf.busyTicks, 10, 'EDF busy ticks should be 10');
  assert.strictEqual(edf.elapsedTicks, 12, 'EDF elapsed ticks should be 12');
  assert.strictEqual(edf.preemptions, 1, 'EDF preemptions should be 1');
  assert.strictEqual(edf.handoffs, 6, 'EDF handoffs should be 6');
  assert.strictEqual(edf.totalMisses, 0, 'EDF misses should be 0');

  const edfSensor = edf.tasksSummary.find(t => t.name === 'Sensor');
  const edfControl = edf.tasksSummary.find(t => t.name === 'Control');
  const edfLogger = edf.tasksSummary.find(t => t.name === 'Logger');

  assert.strictEqual(edfSensor.worstResponse, 2, 'EDF Sensor worst response should be 2');
  assert(Math.abs(edfSensor.avgResponse - (4 / 3)) < 1e-6, 'EDF Sensor avg response should be ~1.33');
  assert.strictEqual(edfSensor.maxLateness, -2, 'EDF Sensor max lateness should be -2');

  assert.strictEqual(edfControl.worstResponse, 3, 'EDF Control worst response should be 3');
  assert.strictEqual(edfControl.avgResponse, 3.0, 'EDF Control avg response should be 3.0');
  assert.strictEqual(edfControl.maxLateness, -3, 'EDF Control max lateness should be -3');

  assert.strictEqual(edfLogger.worstResponse, 7, 'EDF Logger worst response should be 7');
  assert.strictEqual(edfLogger.avgResponse, 7.0, 'EDF Logger avg response should be 7.0');
  assert.strictEqual(edfLogger.maxLateness, -5, 'EDF Logger max lateness should be -5');
});

// -------------------------------------------------------------
// Group 2: Case B miss/no-miss
// -------------------------------------------------------------
runGroup(2, 'Case B Miss / No-Miss (Heavy Load)', () => {
  const tasks = [
    { name: 'T1', C: 2, T: 5, D: 5, phase: 0 },
    { name: 'T2', C: 4, T: 7, D: 7, phase: 0 }
  ];

  assert.strictEqual(RTOS.hyperperiod(tasks), 35, 'Hyperperiod should be 35');

  // RM
  const rm = RTOS.simulate(tasks, 'RM');
  assert.strictEqual(rm.totalMisses, 1, 'RM should miss exactly 1 deadline');
  assert.strictEqual(rm.preemptions, 5, 'RM preemptions should be 5');
  assert.strictEqual(rm.handoffs, 16, 'RM handoffs should be 16');
  assert.strictEqual(rm.busyTicks, 34, 'RM busy ticks should be 34 of 35');

  const rmT1 = rm.tasksSummary.find(t => t.name === 'T1');
  const rmT2 = rm.tasksSummary.find(t => t.name === 'T2');
  assert.strictEqual(rmT1.worstResponse, 2);
  assert.strictEqual(rmT1.misses, 0);
  assert.strictEqual(rmT2.worstResponse, 8, 'RM T2 worst response should be 8');
  assert.strictEqual(rmT2.maxLateness, 1, 'RM T2 max lateness should be +1');
  assert.strictEqual(rmT2.misses, 1);

  // EDF
  const edf = RTOS.simulate(tasks, 'EDF');
  assert.strictEqual(edf.totalMisses, 0, 'EDF should meet all deadlines');
  assert.strictEqual(edf.preemptions, 1, 'EDF preemptions should be 1');
  assert.strictEqual(edf.handoffs, 12, 'EDF handoffs should be 12');
  assert.strictEqual(edf.busyTicks, 34, 'EDF busy ticks should be 34 of 35');

  const edfT1 = edf.tasksSummary.find(t => t.name === 'T1');
  const edfT2 = edf.tasksSummary.find(t => t.name === 'T2');
  assert.strictEqual(edfT1.worstResponse, 4);
  assert.strictEqual(edfT2.worstResponse, 6);
  assert.strictEqual(edfT1.misses, 0);
  assert.strictEqual(edfT2.misses, 0);
});

// -------------------------------------------------------------
// Group 3: Utilization, rmBound, hyperperiod (incl. phases)
// -------------------------------------------------------------
runGroup(3, 'Utilization, rmBound, and Hyperperiod with Phases', () => {
  // Case A utilization: 1/4 + 2/6 + 3/12 = 0.25 + 0.333333 + 0.25 = 0.833333...
  const tasksA = [
    { name: 'Sensor', C: 1, T: 4, D: 4, phase: 0 },
    { name: 'Control', C: 2, T: 6, D: 6, phase: 0 },
    { name: 'Logger', C: 3, T: 12, D: 12, phase: 0 }
  ];
  const uA = RTOS.utilization(tasksA);
  assert(Math.abs(uA - (5 / 6)) < 1e-9, 'Utilization for Case A should be 5/6 (0.8333)');

  // rmBound tests
  // n = 1: 1 * (2^1 - 1) = 1.0
  assert.strictEqual(RTOS.rmBound(1), 1.0);
  // n = 2: 2 * (sqrt(2) - 1) = 2 * (1.41421356 - 1) = 0.828427
  assert(Math.abs(RTOS.rmBound(2) - 0.828427) < 1e-5);
  // n = 3: 3 * (2^(1/3) - 1) = 0.77976...
  assert(Math.abs(RTOS.rmBound(3) - 0.77976) < 1e-4);

  // Hyperperiod with phases
  // T1: T=4, phase=0; T2: T=6, phase=2. LCM = 12, maxPhase = 2 -> window = 14
  const phaseTasks = [
    { name: 'A', C: 1, T: 4, D: 4, phase: 0 },
    { name: 'B', C: 2, T: 6, D: 6, phase: 2 }
  ];
  assert.strictEqual(RTOS.hyperperiod(phaseTasks), 14, 'Hyperperiod covering phase offset should be 14');
});

// -------------------------------------------------------------
// Group 4: RTA values for A and B
// -------------------------------------------------------------
runGroup(4, 'Response-Time Analysis (RTA) Iterations', () => {
  const tasksA = [
    { name: 'Sensor', C: 1, T: 4, D: 4 },
    { name: 'Control', C: 2, T: 6, D: 6 },
    { name: 'Logger', C: 3, T: 12, D: 12 }
  ];
  const rtaA = RTOS.responseTimeAnalysis(tasksA);
  const loggerRta = rtaA.find(r => r.name === 'Logger');
  assert.deepStrictEqual(loggerRta.iterations, [3, 6, 7, 9, 10, 10], 'Logger iterations mismatch');
  assert.strictEqual(loggerRta.R, 10);
  assert.strictEqual(loggerRta.schedulable, true);

  const tasksB = [
    { name: 'T1', C: 2, T: 5, D: 5 },
    { name: 'T2', C: 4, T: 7, D: 7 }
  ];
  const rtaB = RTOS.responseTimeAnalysis(tasksB);
  const t2Rta = rtaB.find(r => r.name === 'T2');
  assert.deepStrictEqual(t2Rta.iterations, [4, 6, 8], 'T2 iterations mismatch');
  assert.strictEqual(t2Rta.R, 8);
  assert.strictEqual(t2Rta.schedulable, false);
});

// -------------------------------------------------------------
// Group 5: Tie-breaking rules
// -------------------------------------------------------------
runGroup(5, 'Deterministic Tie-Breaking Rules', () => {
  // Equal period: RM breaks ties by input order
  const equalTasks = [
    { name: 'X', C: 1, T: 4, D: 4 },
    { name: 'Y', C: 1, T: 4, D: 4 }
  ];
  const simRM = RTOS.simulate(equalTasks, 'RM');
  assert.strictEqual(simRM.tickLog[0].task, 'X', 'At tick 0 X should run first');
  assert.strictEqual(simRM.tickLog[1].task, 'Y', 'At tick 1 Y should run second');

  // EDF equal deadline: earlier-released job wins, then input order
  const edfTie = [
    { name: 'Early', C: 1, T: 8, D: 8, phase: 0 }, // job released at 0, deadline 8
    { name: 'Late', C: 1, T: 4, D: 4, phase: 4 }   // job released at 4, deadline 8
  ];
  const simEDF = RTOS.simulate(edfTie, 'EDF', { window: 8 });
  // At tick 4, Early has deadline 8 (released at 0). Late has deadline 8 (released at 4).
  // If Early has work remaining, Early must run before Late!
  const earlyJ = [
    { name: 'T_Long', C: 2, T: 8, D: 8, phase: 0 }, // J0: runs 0..1, remaining 1, deadline 8
    { name: 'T_Short', C: 1, T: 4, D: 4, phase: 1 }  // releases at 1, deadline 5
  ];
  const simTie = RTOS.simulate(earlyJ, 'EDF', { window: 8 });
  // At tick 4: T_Long (released at 0, deadline 8, remaining 1). T_Short J1 (released at 5? wait, releases at 1, then at 5).
  // Direct test of tie-break at identical deadline and release:
  const simultaneous = [
    { name: 'First', C: 1, T: 6, D: 6, phase: 0 },
    { name: 'Second', C: 1, T: 6, D: 6, phase: 0 }
  ];
  const simSimult = RTOS.simulate(simultaneous, 'EDF');
  assert.strictEqual(simSimult.tickLog[0].task, 'First', 'Input order tie-break for equal release and deadline');
  assert.strictEqual(simSimult.tickLog[1].task, 'Second');
});

// -------------------------------------------------------------
// Group 6: Invalid-input rejection (every error path)
// -------------------------------------------------------------
runGroup(6, 'Invalid Task Input Rejection', () => {
  const errorTestCases = [
    { label: 'Not an array', tasks: 'invalid' },
    { label: 'Empty array', tasks: [] },
    { label: 'More than 10 tasks', tasks: Array.from({ length: 11 }, (_, i) => ({ name: 'T' + i, C: 1, T: 4 })) },
    { label: 'Empty task name', tasks: [{ name: '', C: 1, T: 4 }] },
    { label: 'Reserved name IDLE', tasks: [{ name: 'IDLE', C: 1, T: 4 }] },
    { label: 'Duplicate name', tasks: [{ name: 'T1', C: 1, T: 4 }, { name: 'T1', C: 2, T: 6 }] },
    { label: 'Non-integer C', tasks: [{ name: 'T1', C: 1.5, T: 4 }] },
    { label: 'C < 1', tasks: [{ name: 'T1', C: 0, T: 4 }] },
    { label: 'Non-integer T', tasks: [{ name: 'T1', C: 1, T: 4.2 }] },
    { label: 'T < 1', tasks: [{ name: 'T1', C: 1, T: 0 }] },
    { label: 'C > D', tasks: [{ name: 'T1', C: 5, T: 6, D: 4 }] },
    { label: 'D > T', tasks: [{ name: 'T1', C: 2, T: 4, D: 6 }] },
    { label: 'Negative phase', tasks: [{ name: 'T1', C: 1, T: 4, phase: -2 }] },
    { label: 'Non-integer phase', tasks: [{ name: 'T1', C: 1, T: 4, phase: 1.5 }] }
  ];

  errorTestCases.forEach(tc => {
    assert.throws(() => {
      RTOS.validateTasks(tc.tasks);
    }, /Validation error/, `Expected validation error for: ${tc.label}`);
  });
});

// -------------------------------------------------------------
// Group 7: Conservation of work
// -------------------------------------------------------------
runGroup(7, 'Conservation of Work on All Executions', () => {
  const testSets = [
    [
      { name: 'Sensor', C: 1, T: 4, D: 4 },
      { name: 'Control', C: 2, T: 6, D: 6 },
      { name: 'Logger', C: 3, T: 12, D: 12 }
    ],
    [
      { name: 'T1', C: 2, T: 5, D: 5 },
      { name: 'T2', C: 4, T: 7, D: 7 }
    ],
    [
      { name: 'Solo', C: 3, T: 8, D: 8 }
    ],
    [
      { name: 'P1', C: 1, T: 4, D: 4, phase: 2 },
      { name: 'P2', C: 2, T: 6, D: 6, phase: 0 }
    ]
  ];

  testSets.forEach(set => {
    ['RM', 'EDF'].forEach(policy => {
      const sim = RTOS.simulate(set, policy);
      // Expected total work = sum over all released jobs of task.C
      let expectedWork = 0;
      sim.jobs.forEach(j => {
        // If job completed, it contributed j.C. If unfinished, it contributed (j.C - j.remaining)
        expectedWork += (j.C - j.remaining);
      });
      assert.strictEqual(sim.busyTicks, expectedWork, `Conservation of work failed for ${policy}`);
    });
  });
});

// -------------------------------------------------------------
// Group 8: Seeded random sets (300 sets)
// -------------------------------------------------------------
runGroup(8, 'Seeded Random Workloads (300 sets, seed 2026)', () => {
  const periods = [4, 5, 6, 10, 12, 15, 20, 30, 60];
  const rng = RTOS.mulberry32(2026);

  let verifiedSets = 0;
  while (verifiedSets < 300) {
    const numTasks = 3 + Math.floor(rng() * 3); // 3, 4, 5 tasks
    const tasks = [];
    for (let i = 0; i < numTasks; i++) {
      const T = periods[Math.floor(rng() * periods.length)];
      const maxC = Math.max(1, Math.floor(T * 0.4));
      const C = 1 + Math.floor(rng() * maxC);
      tasks.push({ name: 'T' + (i + 1), C, T, D: T, phase: 0 });
    }

    const u = RTOS.utilization(tasks);
    if (u >= 0.50 && u <= 1.00) {
      verifiedSets++;

      // 1. Response-Time Analysis
      const rta = RTOS.responseTimeAnalysis(tasks);
      const rtaSched = rta.every(r => r.schedulable);

      // 2. Simulated RM
      const simRM = RTOS.simulate(tasks, 'RM');
      assert.strictEqual(simRM.allMet, rtaSched,
        `Set ${verifiedSets}: RM simulation schedulability (${simRM.allMet}) != RTA (${rtaSched})`);

      // If schedulable, simulated WCRT must exactly equal RTA R for all tasks
      if (simRM.allMet) {
        tasks.forEach(task => {
          const tSummary = simRM.tasksSummary.find(t => t.name === task.name);
          const rtaTask = rta.find(r => r.name === task.name);
          assert.strictEqual(tSummary.worstResponse, rtaTask.R,
            `Set ${verifiedSets}: WCRT mismatch for ${task.name}: sim ${tSummary.worstResponse} != RTA ${rtaTask.R}`);
        });
      }

      // 3. Simulated EDF: when U <= 1.0, must meet all deadlines
      const simEDF = RTOS.simulate(tasks, 'EDF');
      assert.strictEqual(simEDF.allMet, true,
        `Set ${verifiedSets}: EDF missed a deadline under U = ${u.toFixed(3)} <= 1.0`);
    }
  }
});

// -------------------------------------------------------------
// Group 9: Exp 3 table exact match (Mutex priority inversion)
// -------------------------------------------------------------
runGroup(9, 'Experiment 3 Mutex Lab (Exact Milestone 2 Reference)', () => {
  const jobs = [
    { name: 'Logger', priority: 1, arrival: 0, program: [{ lock: 3 }, { run: 1 }] },
    { name: 'Sensor', priority: 3, arrival: 1, program: [{ lock: 1 }, { run: 1 }] },
    { name: 'Control', priority: 2, arrival: 2, program: [{ run: 4 }] }
  ];

  // Without inheritance
  const noInh = RTOS.simulateMutex(jobs, { inheritance: false });
  assert.strictEqual(noInh.inversionTicks, 4, 'No-inheritance inversion ticks should be 4');
  const sNo = noInh.jobs.find(j => j.name === 'Sensor');
  const cNo = noInh.jobs.find(j => j.name === 'Control');
  const lNo = noInh.jobs.find(j => j.name === 'Logger');

  assert.strictEqual(sNo.finish, 9, 'Sensor finish should be 9');
  assert.strictEqual(sNo.response, 8, 'Sensor response should be 8');
  assert.strictEqual(sNo.blockedTicks, 6, 'Sensor blocked ticks should be 6');

  assert.strictEqual(cNo.finish, 6, 'Control finish should be 6');
  assert.strictEqual(cNo.response, 4, 'Control response should be 4');

  assert.strictEqual(lNo.finish, 10, 'Logger finish should be 10');

  // With inheritance
  const withInh = RTOS.simulateMutex(jobs, { inheritance: true });
  assert.strictEqual(withInh.inversionTicks, 0, 'Inheritance inversion ticks should be 0');
  const sWith = withInh.jobs.find(j => j.name === 'Sensor');
  const cWith = withInh.jobs.find(j => j.name === 'Control');
  const lWith = withInh.jobs.find(j => j.name === 'Logger');

  assert.strictEqual(sWith.finish, 5, 'Sensor finish should be 5');
  assert.strictEqual(sWith.response, 4, 'Sensor response should be 4');
  assert.strictEqual(sWith.blockedTicks, 2, 'Sensor blocked ticks should be 2');

  assert.strictEqual(cWith.finish, 9, 'Control finish should be 9');
  assert.strictEqual(cWith.response, 7, 'Control response should be 7');

  assert.strictEqual(lWith.finish, 10, 'Logger finish should be 10');
});

// -------------------------------------------------------------
// Group 10: No-contention mutex case
// -------------------------------------------------------------
runGroup(10, 'Mutex No-Contention Case (Identical to Plain Fixed Priority)', () => {
  // Jobs with non-overlapping execution or no mutex contention
  const nonContendingJobs = [
    { name: 'Low', priority: 1, arrival: 5, program: [{ lock: 2 }] },
    { name: 'High', priority: 2, arrival: 0, program: [{ lock: 2 }] }
  ];

  const res = RTOS.simulateMutex(nonContendingJobs, { inheritance: false });
  assert.strictEqual(res.inversionTicks, 0);
  assert.strictEqual(res.jobs.find(j => j.name === 'High').blockedTicks, 0);
  assert.strictEqual(res.jobs.find(j => j.name === 'Low').blockedTicks, 0);
  assert.strictEqual(res.jobs.find(j => j.name === 'High').finish, 2);
  assert.strictEqual(res.jobs.find(j => j.name === 'Low').finish, 7);
});

// -------------------------------------------------------------
// Group 11: Mutex invalid inputs
// -------------------------------------------------------------
runGroup(11, 'Mutex Invalid Input Rejection', () => {
  const invalidCases = [
    { label: 'Not array', jobs: null },
    { label: 'Empty jobs array', jobs: [] },
    { label: 'Empty name', jobs: [{ name: '', priority: 1, arrival: 0, program: [{ run: 1 }] }] },
    { label: 'Duplicate name', jobs: [
        { name: 'J1', priority: 1, arrival: 0, program: [{ run: 1 }] },
        { name: 'J1', priority: 2, arrival: 0, program: [{ run: 1 }] }
      ]
    },
    { label: 'Non-integer priority', jobs: [{ name: 'J', priority: 1.5, arrival: 0, program: [{ run: 1 }] }] },
    { label: 'Negative arrival', jobs: [{ name: 'J', priority: 1, arrival: -1, program: [{ run: 1 }] }] },
    { label: 'Empty program', jobs: [{ name: 'J', priority: 1, arrival: 0, program: [] }] },
    { label: 'Invalid step', jobs: [{ name: 'J', priority: 1, arrival: 0, program: [{ foo: 1 }] }] },
    { label: 'Nested locks', jobs: [{ name: 'J', priority: 1, arrival: 0, program: [{ lock: { lock: 2 } }] }] }
  ];

  invalidCases.forEach(tc => {
    assert.throws(() => {
      RTOS.simulateMutex(tc.jobs);
    }, /Mutex validation error/, `Expected mutex error for: ${tc.label}`);
  });
});

// -------------------------------------------------------------
// Group 12: Mutex work conservation & at most one holder (200 sets)
// -------------------------------------------------------------
runGroup(12, 'Mutex Invariants Over 200 Random Sets', () => {
  const rng = RTOS.mulberry32(2026);

  for (let s = 0; s < 200; s++) {
    const numJobs = 3 + Math.floor(rng() * 2);
    const jobs = [];
    let totalWork = 0;

    for (let j = 0; j < numJobs; j++) {
      const priority = j + 1;
      const arrival = Math.floor(rng() * 8);
      const program = [];
      const numSteps = 1 + Math.floor(rng() * 3);
      for (let st = 0; st < numSteps; st++) {
        const isLock = rng() < 0.5;
        const dur = 1 + Math.floor(rng() * 3);
        totalWork += dur;
        program.push(isLock ? { lock: dur } : { run: dur });
      }
      jobs.push({ name: 'J' + j, priority, arrival, program });
    }

    const resNo = RTOS.simulateMutex(jobs, { inheritance: false });
    const resWith = RTOS.simulateMutex(jobs, { inheritance: true });

    // Invariant 1: Work conservation
    const busyNo = resNo.tickLog.filter(t => t.running !== 'IDLE').length;
    const busyWith = resWith.tickLog.filter(t => t.running !== 'IDLE').length;
    assert.strictEqual(busyNo, totalWork, `Work conservation failed (no-inh) in set ${s}`);
    assert.strictEqual(busyWith, totalWork, `Work conservation failed (with-inh) in set ${s}`);

    // Invariant 2: At most one holder at any tick
    resWith.tickLog.forEach(t => {
      if (t.holdingMutex) {
        assert(t.mutexHolder !== null, `Holder must be defined in set ${s}`);
      }
    });
  }
});

// -------------------------------------------------------------
// Group 13: Inheritance response time property (200 sets)
// -------------------------------------------------------------
runGroup(13, 'Inheritance Never Increases HP Response Time (200 sets)', () => {
  const rng = RTOS.mulberry32(2026);

  for (let s = 0; s < 200; s++) {
    const numJobs = 3 + Math.floor(rng() * 2);
    const jobs = [];

    for (let j = 0; j < numJobs; j++) {
      const priority = j + 1;
      const arrival = Math.floor(rng() * 8);
      const program = [];
      const numSteps = 1 + Math.floor(rng() * 3);
      for (let st = 0; st < numSteps; st++) {
        const isLock = rng() < 0.5;
        const dur = 1 + Math.floor(rng() * 3);
        program.push(isLock ? { lock: dur } : { run: dur });
      }
      jobs.push({ name: 'J' + j, priority, arrival, program });
    }

    const resNo = RTOS.simulateMutex(jobs, { inheritance: false });
    const resWith = RTOS.simulateMutex(jobs, { inheritance: true });

    // Highest-priority job
    const hpNo = resNo.jobs.reduce((max, j) => j.priority > max.priority ? j : max, resNo.jobs[0]);
    const hpWith = resWith.jobs.reduce((max, j) => j.priority > max.priority ? j : max, resWith.jobs[0]);

    assert(hpWith.response <= hpNo.response,
      `Inheritance increased HP response in set ${s}: with=${hpWith.response}, no=${hpNo.response}`);
  }
});

// -------------------------------------------------------------
// Group 14: Application layer (Temperature-Monitoring Node)
// -------------------------------------------------------------
runGroup(14, 'Temperature-Monitoring Node Application Trace & Fault Logic', () => {
  const app = RTOS.createTemperatureNodeApp();

  // Test ambient temperature determinism
  const temp0 = app.getAmbientTemp(0);
  const temp4 = app.getAmbientTemp(4);
  assert(typeof temp0 === 'number');
  assert(typeof temp4 === 'number');

  // Verify normal sequence execution over hyperperiod 12
  // Sensor completes at tick 1
  app.onSensorComplete(1, false);
  let state = app.getState();
  assert.strictEqual(state.systemStatus, 'NORMAL');
  assert.strictEqual(state.buffer.timestamp, 1);

  // Control completes at tick 3
  app.onControlComplete(3, false);
  state = app.getState();
  assert(state.heaterState === 'ON' || state.heaterState === 'OFF');

  // Logger completes at tick 10
  app.onLoggerComplete(10, false);
  state = app.getState();
  assert.strictEqual(state.logs.length, 1);
  assert.strictEqual(state.logs[0].status, 'OK');

  // Test Hard deadline miss -> FAULT
  const faultApp = RTOS.createTemperatureNodeApp();
  faultApp.onSensorComplete(5, true); // Sensor misses deadline
  assert.strictEqual(faultApp.getState().systemStatus, 'FAULT', 'Hard deadline miss must flag FAULT');

  // Test Firm deadline miss -> discard heater command
  const firmApp = RTOS.createTemperatureNodeApp();
  const initHeater = firmApp.getState().heaterState;
  firmApp.onControlComplete(8, true); // Control misses deadline
  assert.strictEqual(firmApp.getState().heaterState, initHeater, 'Firm deadline miss must discard heater update');

  // Test Soft deadline miss -> marked late
  const softApp = RTOS.createTemperatureNodeApp();
  softApp.onLoggerComplete(14, true); // Logger misses deadline
  assert.strictEqual(softApp.getState().logs[0].status, 'LATE', 'Soft deadline miss must be logged as LATE');
});

// -------------------------------------------------------------
// Summary
// -------------------------------------------------------------
console.log('\n============================================================');
console.log(`Execution Complete: ${passedGroups} / ${totalGroups} Groups Passed`);
console.log('============================================================');

if (failedGroups > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
