# BHARATI VIDYAPEETH’S COLLEGE OF ENGINEERING, NEW DELHI
### Department of Computer Science and Engineering

---

## OPERATING SYSTEM PBL REPORT
### Group Submission

# Real-Time Operating Systems (RTOS)
### Task Scheduling and Resource Management in a Simple Real-Time Application

**Subject Code:** CIC-305T  
**Course:** Operating System  
**Class:** B.Tech CSE-2, Third Year, Odd Semester 2026  
**Academic Year:** 2026–2027  

---

### Submitted by:

| Sr No | Student Name | Enrollment Number | Viva Responsibility & Focus Area |
| :---: | :--- | :--- | :--- |
| **1** | **MADHAV BHARDWAJ** | `10311502724` | Core Engine & Scheduling Theory (`rtos.js`) |
| **2** | **VASVI GUPTA** | `10411502724` | Test Suite & Experiment Automation (`test_rtos.js`, `run_experiments.js`) |
| **3** | **ANUSHKA SAXENA** | `11111502724` | Application Layer & Visual Interface (`app.js`, `index.html`, `styles.css`) |

**Submitted to:** Faculty Mentor, Department of Computer Science & Engineering  

---

## 1. Project Overview

### Abstract
This project explores the core principles of Real-Time Operating Systems (RTOS) through an offline, tick-based simulator (`RTOS-Sim`) and an embedded temperature-monitoring application. A preemptive single-CPU kernel is implemented to evaluate Rate Monotonic (RM) and Earliest Deadline First (EDF) scheduling, alongside a mutex with priority inheritance. Under the main task workload ($U = 0.833$), both policies meet all deadlines; RM optimizes the highest-rate task (Sensor WCRT 1 tick vs 2 under EDF), while EDF lowers the long-period task's response (Logger WCRT 7 ticks vs 10) with fewer preemptions (1 vs 2). Under heavy load ($U = 0.971$), RM experiences 1 deadline miss (+1 lateness) whereas EDF meets all deadlines. In resource contention, Priority Inheritance eliminates 4 ticks of priority inversion, halving Sensor response time from 8 to 4 ticks. Over 2000 seeded random workloads, EDF achieved a 100.0% success rate up to full utilization, compared to 92.0% for RM. All figures are verified across 14 automated test suites. *(165 words)*

### Problem Statement
In real-time computing, correctness depends not only on logical output but on the physical instant at which the result is delivered. Delivering a late result can lead to catastrophic system failure. Analyzing preemption, resource locking, and priority inversion by hand is error-prone. This project builds a transparent, verifiable simulation engine to visualize scheduling choices, compute timing guarantees analytically, and validate them through empirical execution.

### Objectives
- Demonstrate RTOS fundamentals: determinism, strict deadlines, preemptive scheduling, and shared resource management.
- Implement and compare fixed-priority Rate Monotonic (RM) and dynamic-priority Earliest Deadline First (EDF) scheduling algorithms.
- Formulate analytical schedulability criteria (Liu & Layland bound, exact Response-Time Analysis) and verify them against tick-level simulation.
- Model a shared binary mutex to demonstrate unbounded Priority Inversion and its mitigation via the Priority Inheritance Protocol (PIP).
- Deploy a simulated three-task real-time temperature-monitoring node with Hard, Firm, and Soft deadline constraints.
- Provide a 100% reproducible, zero-dependency engineering implementation verified through automated tests and experimental benchmarks.

### Project Scope
The software is an offline, pure JavaScript simulation executing in Node.js and modern browsers. It models a single CPU, independent periodic tasks, and one binary mutex with zero context-switch overhead, zero interrupt latency, and deterministic integer execution units ("ticks"). It does not execute on bare-metal hardware or measure physical electrical jitter.

---

## 2. Principles of a Real-Time Operating System

### What Makes a System Real-Time
A real-time system is characterized by **temporal predictability** and **bounded determinism**. Unlike general-purpose operating systems that maximize average user throughput and maintain process fairness, an RTOS guarantees that critical tasks complete before their deadlines under all anticipated operating conditions. Speed alone does not define real-time; a system that executes rapidly 99% of the time but experiences occasional unbounded scheduling latency is unsuitable for real-time applications.

### Deadline Classification: Hard, Firm, and Soft

| Class | System Impact of a Missed Deadline | Application Component Example |
| :--- | :--- | :--- |
| **Hard** | Complete system failure, safety breach, or physical damage. | **Sensor Task:** Must sample chamber temperature every cycle to prevent thermal runaway. |
| **Firm** | The late result has zero utility, but the system continues safely; the output is discarded. | **Control Task:** A delayed heater command calculation is stale and discarded in favor of the current state. |
| **Soft** | The late result retains degraded utility; system operation degrades gracefully. | **Logger Task:** Historical temperature telemetry recorded late remains useful for post-mortem diagnostics. |

### RTOS vs General-Purpose Operating System (GPOS)

| Operating System Feature | General-Purpose OS (e.g., Linux, Windows) | Real-Time OS (e.g., FreeRTOS, VxWorks) |
| :--- | :--- | :--- |
| **Primary Design Goal** | High aggregate throughput, fairness, responsiveness | Guaranteed worst-case latency, strict determinism |
| **Scheduling Model** | Dynamic time-slicing (e.g., Completely Fair Scheduler) | Priority-driven preemptive (RM, EDF, Fixed Priority) |
| **Interrupt Latency** | Variable; delayed by kernel spinlocks and paging | Deterministic, bounded to minimal microseconds |
| **Memory Architecture** | Paged virtual memory with page faults | Fixed-size memory pools, static allocation |
| **Kernel Footprint** | Large (Gigabytes, hundreds of device drivers) | Highly configurable microkernel (Kilobytes) |

### Core Kernel Services
1. **Task Scheduler:** Determines which ready task acquires the CPU at each tick.
2. **Deterministic Timer:** Generates periodic clock ticks to release tasks and evaluate deadline intervals.
3. **Synchronization & IPC:** Provides mutual exclusion (mutexes) and semaphores with priority inheritance.
4. **Memory Management:** Allocates deterministic, fragmentation-free memory buffers.
5. **Interrupt Handler:** Quickly services hardware events and wakes deferred real-time tasks.

### Task State Machine

```
              +--------------------------+
              |         DORMANT          |
              +--------------------------+
                           |
                           | Task Release (t >= phase, (t-phase) % T == 0)
                           v
                     +-----------+
         +---------->|   READY   |<-----------+
         |           +-----------+            |
         |                 |                  |
         | Preempted by    | Dispatched by    | Preempted or
         | Higher Priority | Scheduler        | Yielded CPU
         |                 v                  |
         |           +-----------+            |
         +-----------|  RUNNING  |------------+
                     +-----------+
                           |
         +-----------------+-----------------+
         |                                   |
         v (Mutex Blocked)                   v (Execution Finished)
   +-----------+                       +-----------+
   |  BLOCKED  |                       | COMPLETED |
   +-----------+                       +-----------+
         | (Mutex Released)                  |
         +---------> Ready Queue             v Next Period Release
```

*Figure 1: Task State Transitions in the RTOS-Sim Kernel*

---

## 3. Task Scheduling

### Rate Monotonic (RM) Scheduling
Rate Monotonic is a static, fixed-priority scheduling policy where task priorities are assigned inversely proportional to their periods:
$$T_i < T_j \implies \text{Priority}(T_i) > \text{Priority}(T_j)$$
Priorities remain constant throughout execution. RM is mathematically proven to be optimal among all fixed-priority preemptive algorithms for independent periodic tasks with deadlines equal to periods ($D = T$).

### Earliest Deadline First (EDF) Scheduling
Earliest Deadline First is a dynamic-priority algorithm where priority is assigned according to the absolute deadline of currently ready jobs:
$$\text{Priority}(J_i) \propto \frac{1}{d_i}, \quad \text{where } d_i = r_i + D_i$$
At every scheduling tick, the job with the nearest absolute deadline is allocated the CPU. EDF is optimal on single-core systems, able to achieve 100% CPU utilization without missing deadlines.

### Schedulability Analysis

#### 1. Liu & Layland Utilization Bound (RM)
For $n$ periodic tasks with $D = T$, the task set is guaranteed to be schedulable under RM if:
$$U = \sum_{i=1}^n \frac{C_i}{T_i} \le n \left(2^{1/n} - 1\right)$$
For $n = 3$, the sufficient bound is:
$$U_{\text{bound}} = 3(2^{1/3} - 1) \approx 0.7798 \quad (78.0\%)$$
Because this bound is **sufficient but not necessary**, a task set with $U > U_{\text{bound}}$ may still be fully schedulable.

#### 2. Exact Response-Time Analysis (RTA)
The exact schedulability of any task under fixed-priority scheduling is determined by calculating its worst-case response time ($R_i$) iteratively:
$$R_i^{(0)} = C_i$$
$$R_i^{(k+1)} = C_i + \sum_{j \in hp(i)} \left\lceil \frac{R_i^{(k)}}{T_j} \right\rceil C_j$$
Where $hp(i)$ denotes the set of tasks with higher priority than task $i$. The recurrence terminates when $R_i^{(k+1)} = R_i^{(k)}$ (stable, schedulable if $R_i \le D_i$) or when $R_i^{(k+1)} > D_i$ (unschedulable).

#### Worked Calculation: Logger Task in Main Set (Sensor: 1/4, Control: 2/6, Logger: 3/12)
$$R_{\text{Logger}}^{(0)} = 3$$
$$R_{\text{Logger}}^{(1)} = 3 + \left\lceil \frac{3}{4} \right\rceil (1) + \left\lceil \frac{3}{6} \right\rceil (2) = 3 + 1 + 2 = 6$$
$$R_{\text{Logger}}^{(2)} = 3 + \left\lceil \frac{6}{4} \right\rceil (1) + \left\lceil \frac{6}{6} \right\rceil (2) = 3 + 2 + 2 = 7$$
$$R_{\text{Logger}}^{(3)} = 3 + \left\lceil \frac{7}{4} \right\rceil (1) + \left\lceil \frac{7}{6} \right\rceil (2) = 3 + 2(1) + 2(2) = 9$$
$$R_{\text{Logger}}^{(4)} = 3 + \left\lceil \frac{9}{4} \right\rceil (1) + \left\lceil \frac{9}{6} \right\rceil (2) = 3 + 3(1) + 2(2) = 10$$
$$R_{\text{Logger}}^{(5)} = 3 + \left\lceil \frac{10}{4} \right\rceil (1) + \left\lceil \frac{10}{6} \right\rceil (2) = 3 + 3(1) + 2(2) = 10 \quad \text{(Converged)}$$
Since $R = 10 \le D = 12$, Logger is mathematically guaranteed to meet all deadlines despite $U = 0.833 > 0.780$.

### Policy Comparison

| Dimension | Rate Monotonic (RM) | Earliest Deadline First (EDF) |
| :--- | :--- | :--- |
| **Priority Assignment** | Static / Fixed (based on period $T$) | Dynamic (based on absolute deadline $d_i$) |
| **Utilization Limit ($D = T$)** | Sufficient bound $69.3\% \le U \le 100\%$; exact via RTA | Up to $100\%$ ($U \le 1.0$) |
| **Implementation Overhead** | Negligible; static priority queues | Moderate; dynamic deadline sorting per tick |
| **Behavior Under Overload** | Predictable; lowest-priority tasks miss first | Domino effect; hard to bound which task misses |

### Deterministic Tie-Breaking Rules
1. **Rate Monotonic:** Equal periods are resolved by task position in the original input definition.
2. **Earliest Deadline First:** Equal absolute deadlines are resolved in favor of the earlier-released job; if released simultaneously, resolved by input definition order.

---

## 4. Resource Management

### Shared Data and Mutual Exclusion
Real-time tasks share state via data structures, device registers, and communication buffers. Unsynchronized access produces race conditions. A binary **mutex** ensures mutual exclusion: only one task holds the lock at any instant, and subsequent requests block until the holder unlocks.

### Priority Inversion
Priority Inversion occurs when a high-priority task ($H$) is blocked waiting for a mutex held by a low-priority task ($L$), and an unrelated medium-priority task ($M$) preempts $L$ because $M$ does not require the mutex:
$$H \text{ (Blocked)} \leftarrow L \text{ (Holds Mutex, Preempted)} \leftarrow M \text{ (Running)}$$
Because $M$ delays $L$, and $L$ delays $H$, task $H$ suffers unbounded blocking delay from a lower-priority task ($M$), violating real-time predictability.

```
Task H (Pri 3)   -----| BLOCKED                                   |========== (Finishes late)
                      |                                           ^
Task M (Pri 2)   -----+--------|====================|-------------+-----------
                               ^ Preempts L!        ^ M completes
Task L (Pri 1)   |====[LOCK]===+....................+[UNLOCK]====|------------
                 0    1        2                    6        7   8           10 (Ticks)
                      <------ PRIORITY INVERSION (Ticks 2-6) ------>
```

*Figure 2: Priority Inversion without Inheritance Protocol*

### Priority Inheritance Protocol (PIP)
Under Priority Inheritance (Sha, Rajkumar, & Lehoczky, 1990), whenever a high-priority task blocks on a mutex, the task holding that mutex temporarily inherits the priority of the highest blocked task:
$$\text{Priority}_{\text{effective}}(L) = \max\left(\text{Priority}_{\text{base}}(L), \max_{J \in \text{Blocked}(L)} \text{Priority}(J)\right)$$
This prevents medium-priority tasks ($M$) from preempting the lock holder, bounding the blocking duration of $H$ to at most the duration of $L$'s critical section.

```
Task H (Pri 3)   -----| BLOCKED               |================== (Finishes on time!)
                      |                       ^ Unblocked at t=3
Task M (Pri 2)   -----+-----------------------+-------------|===================
                      |                       |             ^ Runs after H finishes
Task L (Pri 1)   |====[LOCK]====[UNLOCK]======+-------------+-------------------
                 0    1         3             5             9                 10 (Ticks)
                      ^ Inherits Pri 3!
```

*Figure 3: Priority Inheritance Protocol Eliminating Inversion*

### Priority Ceiling Protocol (PCP) Summary
PCP assigns each mutex a priority ceiling equal to the highest priority of any task that may acquire it. A task can acquire a mutex only if its priority is strictly higher than the ceilings of all mutexes currently locked by other tasks. This completely prevents deadlocks and bounds blocking to a single critical section. PCP is documented here as an extension and is not implemented in the simulator.

---

## 5. System Design and Metrics

### Architectural Processing Flow

| Stage | Subsystem | Algorithmic Responsibilities |
| :--- | :--- | :--- |
| **1. Ingestion** | Parser & Validator | Validates $1 \le C \le D \le T$, non-empty unique names (not `IDLE`), non-negative phases. |
| **2. Analysis** | Static Analyzer | Computes total utilization ($U$), Liu & Layland bound, and exact RTA convergence iterations. |
| **3. Dispatch** | Real-Time Kernel | Advances simulation tick-by-tick, releases jobs, enforces preemptions, manages mutex queues. |
| **4. Metrics** | Instrumentation | Calculates WCRT, average response, lateness, misses, preemptions, handoffs, and inversion ticks. |
| **5. Rendering** | UI & Exporters | Renders responsive Gantt charts, updates DOM tables, generates verified JSON and CSV exports. |

### Metric Definitions
- **Response Time ($R$):** Elapsed ticks from job release to completion ($R = t_{\text{finish}} - t_{\text{release}}$). The maximum over all jobs of a task is its **Worst-Case Response Time (WCRT)**.
- **Lateness ($L$):** Difference between finish time and absolute deadline ($L = t_{\text{finish}} - d_i$). Negative values denote early completion; positive values signify deadline violation.
- **Deadline Miss:** Any job where $L > 0$.
- **CPU Utilization:** Percentage of observation window during which the CPU executes non-idle work ($\frac{\text{Busy Ticks}}{\text{Total Ticks}} \times 100\%$).
- **Preemption:** An event where a running job is interrupted and replaced by another non-idle job prior to its completion ($\text{remaining} > 0$).
- **Handoff:** A transition between different adjacent non-idle jobs (encompassing completions and preemptions).
- **Blocked Time:** Cumulative ticks a task spends waiting in a mutex wait queue.
- **Inversion Ticks:** Specific clock ticks during which the highest-priority arrived job is blocked on a mutex while an unrelated task that does not hold the mutex executes.

---

## 6. The Real-Time Application

### Temperature-Monitoring Node Architecture
The simulated application consists of three periodic tasks sharing an in-memory telemetry buffer:

| Task Name | Subsystem Role | Period ($T$) | WCET ($C$) | Deadline ($D$) | Utilization ($U$) | Real-Time Class | Critical Section |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Sensor** | Samples ambient temperature into buffer | 4 | 1 | 4 | 0.250 | **Hard** | 1 tick |
| **Control** | Reads buffer and computes heater command | 6 | 2 | 6 | 0.333 | **Firm** | 1 tick |
| **Logger** | Writes buffer & actuator history to log | 12 | 3 | 12 | 0.250 | **Soft** | 1 tick |
| **Total** | Cooperating Temperature Node System | — | **6** | — | **0.833** | — | **Hyperperiod: 12** |

### Thermal Control Logic
- **Target Temperature:** $21.0^\circ\text{C}$ with a $\pm 0.5^\circ\text{C}$ hysteresis band.
- **Control Law:** If $T_{\text{sample}} < 20.5^\circ\text{C} \implies \text{Heater ON}$; if $T_{\text{sample}} > 21.5^\circ\text{C} \implies \text{Heater OFF}$.
- **Fault Behavior:**
  - If Sensor misses a deadline $\implies$ System flags catastrophic `SYSTEM FAULT`.
  - If Control misses a deadline $\implies$ Stale heater update is discarded.
  - If Logger misses a deadline $\implies$ Log record is marked with `[LATE]` status flag.

---

## 7. Measured Results and Comparison

### Experiment 1: Main Task Set ($U = 0.833$, Hyperperiod = 12 ticks)

*Execution Timelines:*
- **RM Timeline:** `SCCLSLCCSL--` (Sensor 0–1, Control 1–3, Logger 3–4, Sensor 4–5, Logger 5–6, Control 6–8, Sensor 8–9, Logger 9–10, Idle 10–12)
- **EDF Timeline:** `SCCLSLLCCS--` (Sensor 0–1, Control 1–3, Logger 3–4, Sensor 4–5, Logger 5–7, Control 7–9, Sensor 9–10, Idle 10–12)

*Table 1: Per-Task Experimental Metrics (Times in Ticks)*

| Policy | Task | Jobs | Worst Response (WCRT) | Avg Response | Max Lateness | Misses | Busy / Total | Preemptions | Handoffs |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **RM** | Sensor | 3 | 1 | 1.00 | -3 | 0 | 10 / 12 (83.3%) | 2 | 7 |
| **RM** | Control | 2 | 3 | 2.50 | -3 | 0 | — | — | — |
| **RM** | Logger | 1 | 10 | 10.00 | -2 | 0 | — | — | — |
| **EDF** | Sensor | 3 | 2 | 1.33 | -2 | 0 | 10 / 12 (83.3%) | 1 | 6 |
| **EDF** | Control | 2 | 3 | 3.00 | -3 | 0 | — | — | — |
| **EDF** | Logger | 1 | 7 | 7.00 | -5 | 0 | — | — | — |

**Interpretation:** Both RM and EDF achieve 100% deadline conformance. RM prioritizes high-frequency tasks, providing Sensor its theoretical minimal response time (1 tick vs 2 ticks under EDF). Conversely, EDF balances queue urgency, dramatically lowering Logger's response time from 10 ticks down to 7 ticks, while cutting preemptions from 2 to 1 and handoffs from 7 to 6.

### Experiment 2: Heavily Loaded Set ($T_1$: 2/5, $T_2$: 4/7, $U = 0.971$, Hyperperiod = 35 ticks)

*Table 2: Heavy Load Schedulability Breakdown*

| Policy | Task | Jobs | Worst Response (WCRT) | Avg Response | Max Lateness | Misses | Schedulability |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **RM** | T1 | 7 | 2 | 2.00 | -3 | 0 | Guaranteed |
| **RM** | T2 | 5 | 8 | 6.80 | **+1** | **1** | **VIOLATED** |
| **EDF** | T1 | 7 | 4 | 2.86 | -1 | 0 | Guaranteed |
| **EDF** | T2 | 5 | 6 | 5.20 | -1 | 0 | Guaranteed |

**Interpretation:** At $U = 0.971$, RM exceeds its 2-task bound ($0.828$) and fails RTA for $T_2$ ($R = 8 > D = 7$). In simulation, the first job of $T_2$ finishes at tick 8 (deadline 7), producing a deadline miss of +1 tick, with 5 preemptions and 16 handoffs. EDF successfully completes all 12 jobs with zero misses, 1 preemption, and 12 handoffs.

### Experiment 3: Priority Inversion & Inheritance Laboratory

Jobs: Logger (Pri 1, Arr 0, `[lock 3, run 1]`), Sensor (Pri 3, Arr 1, `[lock 1, run 1]`), Control (Pri 2, Arr 2, `[run 4]`).

*Table 3: Resource Contention and Inheritance Outcome*

| Protocol Configuration | Sensor Finish | Sensor Response | Sensor Blocked | Control Finish | Control Response | Logger Finish | Inversion Ticks |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **No Inheritance** | 9 | 8 ticks | 6 ticks | 6 | 4 ticks | 10 | **4 ticks** |
| **Priority Inheritance** | 5 | **4 ticks** | **2 ticks** | 9 | 7 ticks | 10 | **0 ticks** |

**Interpretation:** Without inheritance, medium-priority Control preempts Logger from tick 2 to 6 while high-priority Sensor waits helplessly, resulting in 4 ticks of priority inversion and an 8-tick response time for Sensor. With inheritance, Logger inherits Sensor's priority at tick 1, blocking Control from running until tick 5. Sensor finishes at tick 5 (cutting response from 8 to 4). Control bears the delay, finishing at tick 9 instead of 6.

### Experiment 4: 2000 Seeded Random Workloads (Seed 2026, $U \in [0.60, 1.00]$)

*Table 4: Large-Scale Benchmark Schedulability Distribution*

| Utilization Bin ($U$) | Tested Task Sets | RM Meets All Deadlines | RM Schedulability % | EDF Meets All Deadlines | EDF Schedulability % |
| :---: | :---: | :---: | :---: | :---: | :---: |
| **0.60 – 0.70** | 333 | 333 | 100.0% | 333 | 100.0% |
| **0.70 – 0.80** | 528 | 528 | 100.0% | 528 | 100.0% |
| **0.80 – 0.90** | 536 | 527 | 98.3% | 536 | 100.0% |
| **0.90 – 1.00** | 603 | 452 | 75.0% | 603 | 100.0% |
| **Total Benchmark** | **2000** | **1840** | **92.0%** | **2000** | **100.0%** |

**Interpretation:** Below $U = 0.80$, RM is 100% schedulable, outperforming the conservative Liu & Layland bound ($0.780$). The divergence between static and dynamic scheduling manifests above $U = 0.80$: in the $0.90 - 1.00$ bin, RM schedulability drops to 75.0% due to fixed priority bottlenecks. EDF achieves a perfect 100.0% schedulability across all 2000 workloads, proving its theoretical optimality.

---

## 8. Practical Applications

### Commercial RTOS Deployments
- **FreeRTOS:** Deployed across billions of microcontrollers, utilizing fixed-priority preemptive scheduling with optional time-slicing and priority inheritance mutexes.
- **VxWorks:** Used extensively in mission-critical aerospace and industrial systems, featuring preemptive scheduling and priority inheritance.
- **Real-Time Linux (`PREEMPT_RT`):** Transforms standard Linux kernels into soft/firm real-time systems by converting spinlocks to sleepable priority-inheriting mutexes and supporting `SCHED_DEADLINE` (EDF).

### Historical Note on Priority Inversion: The Mars Pathfinder Mission (1997)
A famous real-world failure of priority inversion occurred during the 1997 NASA Mars Pathfinder mission. A high-priority information bus task was blocked by a low-priority meteorological task holding a shared mutex. An unrelated medium-priority communications task repeatedly preempted the meteorological task, starving the bus task. A watchdog timer triggered repeated system resets. NASA engineers diagnosed the anomaly remotely and resolved it by enabling priority inheritance in the VxWorks kernel.

### Industrial Domain Matrix

| Industrial Domain | Canonical Real-Time Task | RTOS Principle Demonstrated |
| :--- | :--- | :--- |
| **Automotive ECUs** | Engine fuel injection timing & anti-lock brake control | Rate Monotonic scheduling with strict Hard deadlines |
| **Medical Devices** | Cardiac pacemaker pulse regulation & blood pressure monitor | Exact RTA verification, short non-preemptible critical sections |
| **Industrial Robotics** | Multi-axis kinematic control loop with background logging | Priority Inheritance mutex protecting joint coordinate buffer |
| **Avionics & Space** | Flight guidance computing and telemetry packaging | Strict determinism, absence of unbounded priority inversion |

---

## 9. Implementation and Verification

### Project Architecture & Source Code

| File Name | Purpose |
| :--- | :--- |
| `rtos.js` | Core simulation engine, validation, RTA, RM/EDF dispatch, mutex simulation, UMD wrapper. |
| `app.js` | UI controller, step-through Gantt visualizer, and Temperature Node application. |
| `index.html` | Browser interface with tab navigation and responsive real-time control panels. |
| `styles.css` | Design stylesheet with glassmorphism, responsive grid, and real-time instrumentation styling. |
| `test_rtos.js` | 14 automated verification test groups covering all edge cases and mathematical models. |
| `run_experiments.js` | Script executing Experiments 1–4, generating verified data artifacts. |
| `results/verified_results.json` | Single source of truth containing all experimental results. |
| `results/comparison.csv` | Compact tabular export of all experimental results. |
| `README.md` | Comprehensive operational and architectural documentation. |

### Verification Record
On **5 November 2026**, the test suite `node test_rtos.js` executed with **14 out of 14 Test Groups passing (100%)**:
1. Case A Timelines & Metrics (RM & EDF exact tick match) — `PASS`
2. Case B Miss / No-Miss Heavy Load Verification — `PASS`
3. Utilization, rmBound, and Hyperperiod with Phases — `PASS`
4. Response-Time Analysis (RTA) Iteration Sequences — `PASS`
5. Deterministic Tie-Breaking Rules — `PASS`
6. Invalid Task Input Rejection (Every error path) — `PASS`
7. Conservation of Work on All Executions — `PASS`
8. Seeded Random Workloads (300 sets, RM simulation == RTA, EDF 100%) — `PASS`
9. Experiment 3 Mutex Lab (Exact Milestone 2 Reference) — `PASS`
10. Mutex No-Contention Case — `PASS`
11. Mutex Invalid Input Rejection — `PASS`
12. Mutex Invariants Over 200 Random Sets (Work conservation & single holder) — `PASS`
13. Priority Inheritance Response Time Bound (200 sets) — `PASS`
14. Temperature Node Trace, Hard FAULT, Firm Discard, and Soft LATE Logic — `PASS`

### Honest Limitations
- **Discrete Simulation:** All timings are in discrete abstract ticks; electrical jitter and physical clock drift are not simulated.
- **Zero Overhead:** Context switching, cache warm-up, and interrupt latencies are modeled with zero tick cost.
- **Static Execution Times:** Worst-case execution times are assumed to be fixed integer constants.
- **Single CPU Scope:** Multiprocessor scheduling (e.g., partitioned RM or global EDF) is outside project scope.

---

## 10. Conclusion

This project successfully implemented an offline, single-CPU preemptive real-time operating system kernel (`RTOS-Sim`) and validated its core principles through an embedded temperature-monitoring application. In the primary workload ($U = 0.833$), both RM and EDF met 100% of deadlines, with RM providing superior responsiveness for high-frequency tasks (1 tick) and EDF minimizing response time for low-frequency tasks (7 ticks vs 10). Under heavy load ($U = 0.971$), RM experienced a deadline violation while EDF maintained complete feasibility. In resource contention, Priority Inheritance eliminated 4 ticks of priority inversion and halved task response time from 8 to 4 ticks. Over 2000 seeded random workloads, EDF proved optimal with 100.0% schedulability compared to 92.0% under RM. These results confirm that real-time predictability is governed by the deliberate interaction of scheduling policy, resource locking protocols, and workload demand.

---

## 11. Viva-Voce Preparation Sheet (12 Critical Questions)

1. **Why is the Liu & Layland RM utilization bound sufficient but not necessary?**  
   It is derived for the worst-case task frequency alignment (pathological task sets). Real task sets with harmonious periods or specific phase relationships can be 100% schedulable up to $U = 1.0$.

2. **Why can EDF reach 100% utilization ($U = 1.0$) while RM cannot?**  
   EDF dynamically assigns priority based on urgency (absolute deadline), adapting CPU allocation to task needs, whereas RM's fixed priorities constrain dispatching order regardless of imminent deadlines.

3. **What does exact Response-Time Analysis (RTA) calculate?**  
   It computes the worst-case elapsed time from task release to completion by iteratively summing the task's WCET and the preemption interference from all higher-priority tasks.

4. **What is Priority Inversion and why does the medium-priority task cause it?**  
   A high-priority task waits for a lock held by a low-priority task. An unrelated medium task preempts the low-priority lock holder, indirectly delaying the high-priority task for an unbounded period.

5. **How does Priority Inheritance resolve priority inversion, and who pays the penalty?**  
   The lock holder temporarily inherits the high-priority task's priority, preventing medium tasks from preempting it. The medium-priority task pays the penalty by being delayed.

6. **What is the operational difference between Hard, Firm, and Soft deadlines?**  
   A missed Hard deadline causes total system failure; a missed Firm deadline renders the result useless (discarded); a missed Soft deadline retains degraded utility.

7. **Why is zero context-switch overhead an acknowledged limitation in this simulator?**  
   Physical CPUs spend CPU cycles saving registers, updating page tables, and experiencing cache misses during switches; ignoring this overestimates real-world schedulability.

8. **Why are deadlines assumed equal to periods ($D = T$) in this baseline study?**  
   It aligns with classic Liu & Layland (1973) periodic task theory, simplifying hyperperiod boundaries and allowing exact RTA convergence without pseudo-deadlines.

9. **Why are random workloads tested using a seeded PRNG (mulberry32, seed 2026)?**  
   It guarantees 100% scientific reproducibility; any evaluator running `node test_rtos.js` or `node run_experiments.js` reproduces the exact same task sets and numbers.

10. **How do preemptions differ from handoffs?**  
    A preemption occurs strictly when a running job is interrupted before finishing; a handoff encompasses all transitions between different non-idle jobs, including natural completions.

11. **What does the engine do when a job misses its deadline?**  
    The engine does not abort the job; it allows the job to run to completion so that exact lateness ($t_{\text{finish}} - d_i$) and worst-case delay can be measured.

12. **What would change if this software were ported to real embedded hardware (e.g., FreeRTOS)?**  
    Tasks would execute as FreeRTOS tasks with hardware timer ticks, mutexes would wrap FreeRTOS semaphores, and interrupt latency, memory layout, and context-switch overhead would become measurable.

---

## 12. Student Viva Responsibilities & File Breakdown

| Group Member | Primary File Focus | Viva Defense & Code Demonstration Focus |
| :--- | :--- | :--- |
| **MADHAV BHARDWAJ** | `rtos.js` | Algorithmic implementation of RM/EDF dispatchers, RTA iterative calculation, input validation rules, and priority inheritance logic. |
| **VASVI GUPTA** | `test_rtos.js` & `run_experiments.js` | Verification suite architecture (14 test groups), mathematical invariant checks, random set generator (mulberry32), and data artifact pipeline. |
| **ANUSHKA SAXENA** | `app.js`, `index.html`, `styles.css` | Temperature Node application layer, Hard/Firm/Soft fault behavior, interactive Gantt chart rendering, and step-through visualization. |

---

## 13. Project File Tree & Delivery Checklist

```text
RTOS-Scheduling-Simulator/
├── index.html                   # Offline browser user interface
├── styles.css                   # Responsive dark-theme design stylesheet
├── rtos.js                      # Core scheduling & mutex simulation engine (UMD)
├── app.js                       # UI controller & Temperature Node application
├── test_rtos.js                 # Verification test suite (14 test groups)
├── run_experiments.js           # Automated benchmark script (Exps 1–4)
├── results/
│   ├── verified_results.json    # Machine-readable verified benchmark outputs
│   └── comparison.csv           # Tabular comparison export
├── README.md                    # Engineering documentation & setup instructions
└── RTOS_PBL_Report.md           # Complete academic PBL report
```

### GitHub Repository
**GitHub Repository Link:** `[paste your repository link here]`
