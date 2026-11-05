# RTOS-Sim: Real-Time Operating System Simulator & Performance Analyzer

A pure-JavaScript, offline, tick-based simulator of a single-CPU preemptive real-time operating system kernel, featuring Rate Monotonic (RM) and Earliest Deadline First (EDF) task scheduling, a priority-inheritance mutex laboratory, and a simulated temperature-monitoring real-time node.

---

## 1. Project Information

- **Course:** Operating System (CIC-305T)
- **Institution:** Department of Computer Science & Engineering, Bharati Vidyapeeth's College of Engineering, New Delhi
- **Academic Program:** B.Tech CSE-2, Third Year, Odd Semester 2026
- **Academic Year:** 2026–2027
- **Project Team:**
  1. **MADHAV BHARDWAJ** — Enrollment No: `10311502724`
  2. **VASVI GUPTA** — Enrollment No: `10411502724`
  3. **ANUSHKA SAXENA** — Enrollment No: `11111502724`

---

## 2. Core Concepts & Conventions

### 2.1 Task Model
- Periodic task parameters: `name, C (WCET), T (Period), D (Relative Deadline), phase (First release)`.
- Constraints: Integer time units ("ticks"), $1 \le C \le D \le T$, with $D = T$ throughout this baseline project.
- Up to 10 tasks, distinct non-empty names (cannot be `IDLE`).
- Observation window: Exactly one **hyperperiod** ($H = \text{LCM}(T_1, \dots, T_n) + \max(\text{phase})$).
- Overload handling: A job that misses its deadline is **not aborted**; it executes until completion so exact lateness can be recorded.

### 2.2 Scheduling Policies
- **Rate Monotonic (RM):** Static/fixed priority assigned inversely proportional to period ($T$). Preemption occurs immediately upon release of a higher-priority task.
  - *Tie-break rule:* Equal periods broken deterministically by original input order.
- **Earliest Deadline First (EDF):** Dynamic priority assigned to the active job with the earliest absolute deadline ($t_{\text{release}} + D$).
  - *Tie-break rule:* Equal deadlines broken by earlier release time, then original input order.

### 2.3 Schedulability Analysis
- **Utilization:** $U = \sum_{i=1}^n \frac{C_i}{T_i}$.
- **Liu & Layland Bound (RM):** $U \le n(2^{1/n} - 1)$ ($0.780$ for $n = 3$, asymptotically $0.693$). *Sufficient, not necessary.*
- **Response-Time Analysis (RTA):** Exact fixed-priority test:
  $$R_i^{(k+1)} = C_i + \sum_{j \in hp(i)} \left\lceil \frac{R_i^{(k)}}{T_j} \right\rceil C_j$$
  Iterated from $R_i^{(0)} = C_i$ until convergence or $R > D_i$.

### 2.4 Resource Model & Mutex Protocols
- Shared resource protected by a single binary mutex.
- Job program model: Ordered execution steps `{ run: n }` and `{ lock: n }` with implicit unlock.
- **Priority Inversion:** High-priority task is blocked on a mutex held by a low-priority task, while an unrelated medium-priority task preempts the holder.
- **Priority Inheritance Protocol (PIP):** The mutex holder temporarily inherits the highest priority among all tasks blocked on that mutex, preventing medium tasks from preempting it. Drops back to base priority upon release.

### 2.5 Real-Time Application: Temperature-Monitoring Node
Demonstrates the kernel with three cooperating tasks sharing an in-memory buffer:
1. **Sensor Task** ($T=4, C=1, D=4$, Hard): Samples ambient temperature into shared buffer. A deadline miss flags system `FAULT`.
2. **Control Task** ($T=6, C=2, D=6$, Firm): Computes bang-bang heater command with hysteresis band ($21.0 \pm 0.5^\circ\text{C}$). A deadline miss causes command update to be discarded.
3. **Logger Task** ($T=12, C=3, D=12$, Soft): Appends buffer and actuator state to persistent log array. A deadline miss marks entry `[LATE]`.

---

## 3. Measured Experimental Results

*Note: The rankings and values below describe the tested workloads and synthetic benchmark configurations only; they do not represent benchmarks of physical hardware or commercial kernels.*

### Experiment 1: Main Task Set (Temperature Node, $U = 0.833$, Hyperperiod = 12 ticks)
- **RM Timeline:** `SCCLSLCCSL--`
- **EDF Timeline:** `SCCLSLLCCS--`
- **Metrics Comparison:**

| Policy | Task | Jobs | Worst Response | Avg Response | Max Lateness | Misses | Preemptions | Handoffs | Busy / Total |
|---|---|---|---|---|---|---|---|---|---|
| **RM** | Sensor | 3 | 1 tick | 1.00 tick | -3 | 0 | 2 | 7 | 10 / 12 (83.3%) |
| **RM** | Control | 2 | 3 ticks | 2.50 ticks | -3 | 0 | — | — | — |
| **RM** | Logger | 1 | 10 ticks | 10.00 ticks | -2 | 0 | — | — | — |
| **EDF** | Sensor | 3 | 2 ticks | 1.33 ticks | -2 | 0 | 1 | 6 | 10 / 12 (83.3%) |
| **EDF** | Control | 2 | 3 ticks | 3.00 ticks | -3 | 0 | — | — | — |
| **EDF** | Logger | 1 | 7 ticks | 7.00 ticks | -5 | 0 | — | — | — |

*Analysis:* Both meet 100% of deadlines. RM gives the urgent Sensor optimal worst-case response (1 tick vs 2). EDF yields lower response for the long-period Logger (7 ticks vs 10) with fewer preemptions (1 vs 2).

### Experiment 2: Heavily Loaded Set ($T_1$: 2/5, $T_2$: 4/7, $U = 0.971$, Hyperperiod = 35 ticks)
- **RM:** 1 deadline miss ($T_2$ job 1 finishes at tick 8 > deadline 7), 5 preemptions, 16 handoffs.
- **EDF:** 0 deadline misses, 1 preemption, 12 handoffs. Both busy 34 of 35 ticks.

### Experiment 3: Priority Inversion & Inheritance Laboratory
Jobs: **Logger** (Pri 1, Arr 0, `[lock 3, run 1]`), **Sensor** (Pri 3, Arr 1, `[lock 1, run 1]`), **Control** (Pri 2, Arr 2, `[run 4]`).

| Protocol | Sensor Finish | Sensor Response | Sensor Blocked | Control Finish | Control Response | Logger Finish | Inversion Ticks |
|---|---|---|---|---|---|---|---|
| **No Inheritance** | 9 | 8 ticks | 6 ticks | 6 | 4 ticks | 10 | **4 ticks** |
| **Priority Inheritance** | 5 | **4 ticks** | **2 ticks** | 9 | 7 ticks | 10 | **0 ticks** |

*Analysis:* Priority inheritance eliminates the 4 inversion ticks, halving Sensor's response time from 8 to 4 ticks. Control pays the penalty (response increases from 4 to 7), keeping urgency aligned with priority.

### Experiment 4: 2000 Seeded Random Workloads (Seed 2026, $U \in [0.60, 1.00]$)

| Utilization Bin | Task Sets | RM Meets All Deadlines | EDF Meets All Deadlines |
|---|---|---|---|
| **0.60 – 0.70** | 333 | 333 (100.0%) | 333 (100.0%) |
| **0.70 – 0.80** | 528 | 528 (100.0%) | 528 (100.0%) |
| **0.80 – 0.90** | 536 | 527 (98.3%) | 536 (100.0%) |
| **0.90 – 1.00** | 603 | 452 (75.0%) | 603 (100.0%) |
| **Total** | **2000** | **1840 (92.0%)** | **2000 (100.0%)** |

---

## 4. Source Code Architecture

| File | Purpose & Responsibilities |
|---|---|
| `index.html` | Offline web UI with tabs for Scheduling, Mutex Lab, and Temperature Node. |
| `styles.css` | Modern responsive stylesheet with dark slate theme, glassmorphism, and Gantt charts. |
| `rtos.js` | Core engine: input validation, RM/EDF simulation, RTA, mutex protocols, UMD export. |
| `app.js` | UI controller, step-through Gantt visualizer, and Temperature Node application. |
| `test_rtos.js` | Automated verification test suite covering 14 distinct test groups. |
| `run_experiments.js` | Automation script executing Experiments 1–4, regenerating data artifacts. |
| `results/verified_results.json` | Single source of truth JSON containing all execution data and metadata. |
| `results/comparison.csv` | Compact CSV export of all experimental results. |
| `RTOS_PBL_Report.md` | Complete academic PBL report formatted for submission. |

---

## 5. How to Run & Verify

### 5.1 Run the Interactive Web Application
No build steps or servers required. Simply open `index.html` directly in any web browser:
```bash
open index.html        # On macOS
# or double-click index.html in Finder / File Explorer
```

### 5.2 Execute Verification Test Suite
Run the 14-group test suite with Node.js:
```bash
node test_rtos.js
```
*Expected Output:* `Execution Complete: 14 / 14 Groups Passed` with exit code 0.

### 5.3 Regenerate Experimental Results
Re-run all 4 experiments and regenerate `results/verified_results.json` and `results/comparison.csv`:
```bash
node run_experiments.js
```

---

## 6. Honest Scope & Limitations

1. **Simulation vs Hardware:** All timing is in discrete abstract "ticks". Context switch latency, cache misses, bus contention, and interrupt service routines have zero overhead.
2. **Fixed Constant WCET:** Task execution times are deterministic constants. Real systems must compute stochastic worst-case bounds.
3. **Single CPU Model:** Does not model multiprocessor scheduling (e.g., Global EDF, partitioned RM).
4. **Priority Ceiling Protocol:** The Priority Ceiling Protocol (PCP) is described in theoretical documentation but not implemented in the simulator.
