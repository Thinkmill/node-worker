const debugLib = require('debug');

// If a new run is scheduled, but we're still waiting for the last run to finish, how often should we check it status?
const WAIT_FOR_FINISH_INTERVAL_MS = 5000;

const formatMsToTime = (tms = 0) => {
	const lpad = (num, digs = 2) => `0000${num}`.slice(-1 * digs);
	const ms = (tms % 1000);
	const secs = Math.floor((tms / 1000) % 60);
	const mins = Math.floor(((tms / 1000) / 60) % 60);
	const hrs = Math.floor(((tms / 1000) / 60) / 60);
	return `${lpad(hrs)}:${lpad(mins)}:${lpad(secs)}.${lpad(ms, 4)}`;
};

class Worker {
	constructor (label, runFn, { sleepMs, timeoutMs }) {
		this.debug = debugLib(`workers:${label}`);

		this.label = label;
		this.runFn = runFn;
		this.sleepMs = sleepMs || (60 * 1000);
		this.timeoutMs = timeoutMs || (this.sleepMs - 1000);
		this.debug(`Initialised with.. label: ${label}, sleepMs: ${sleepMs}, timeoutMs: ${timeoutMs}`);

		// Flow control
		this._runOrdinal = 0;
		this._isRunning = false;
		this._isStopped = true;
		this._runStartedAt = undefined;
		this._nextRunTimeout = undefined;
	}

	start () {
		this.debug(`Starting; scheduling first`);
		this._isStopped = false;
		this.scheduleRunInMs(1000); // Schedule first run soon (rather than in this.sleepMs)
	}

	stop () {
		this.debug(`Stopping; cancelling next run`);
		this._isStopped = true;
		if (this._nextRunTimeout) clearTimeout(this._nextRunTimeout);
		this._nextRunTimeout = undefined;
	}

	scheduleRunInMs (delayMs) {
		if (this._isStopped) {
			this.debug(`Not scheduling run; worker is stopped`);
			return;
		}
		this.debug(`Scheduling run in ${delayMs} ms`);
		this._nextRunTimeout = setTimeout(() => {
			this.performRun();
		}, delayMs);
	}

	async performRun () {
		while (this._isRunning) {
			const runningForMs = new Date() - this._runStartedAt;
			this.debug(`Trying to run but delayed by previous execution (has been running for ${formatMsToTime(runningForMs)})`);
			this.debug(`Checking again in ${WAIT_FOR_FINISH_INTERVAL_MS} ms..`);
			await new Promise(resolve => setTimeout(resolve, WAIT_FOR_FINISH_INTERVAL_MS));
		}

		this._isRunning = true;
		this._runStartedAt = new Date();
		this.debug(`Performing run now (${this._runStartedAt.toISOString()})`);

		const timeoutPromise = new Promise((resolve, reject) => setTimeout(() => {
			return reject(new Error(`Worker '${this.label}' exceeded configured timeout of ${this.timeoutMs} on run #${this._runOrdinal}`));
		}, this.timeoutMs));

		const runArgs = {
			label: this.label,
			sleepMs: this.sleepMs,
			timeoutMs: this.timeoutMs,
			ordinal: this._runOrdinal,
		};
		const runPromise = this.runFn(runArgs);
		this._runOrdinal++;

		return Promise.race([runPromise, timeoutPromise])
			.then(finished => {
				this.debug(`Run completed with finished value:`, finished);
				// If not finished, sleep only briefly
				this.scheduleRunInMs(finished ? this.sleepMs : 1000);
			})
			.catch(err => {
				this.debug(`Run failed with error:`, err);
				console.error(`Worker '${this.label}' failed with error on run #${this._runOrdinal}`, err);
				this.scheduleRunInMs(this.sleepMs);
			})
			// aka. `finally( .. )`
			.then(() => {
				this._isRunning = false;
				this._runStartedAt = undefined;
			});
	}
}

module.exports = Worker;
