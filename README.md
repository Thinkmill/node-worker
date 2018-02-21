Worker Framework
================================================================================

A simple, promise-based, worker framework.


Install
--------------------------------------------------------------------------------

```sh
yarn add @thinkmill/node-worker
```

Constructor
--------------------------------------------------------------------------------

| Argument | Type | Description |
|----------|------|-------------|
| `label` | `String` | A label that describes the worker (used in logs, errors, etc) |
| `payload` | `Function` | A promise-returning function that is executed on schedule (received the run ordinal) |
| `options` | `Object` | Options controlling how the worker should behave |

### `payload`

The `payload` function represents the main body of the worker, where the real work is done.
It should return a promise that resolves or rejects withing the `timeoutMs` provided to it.

The `payload` is invoked according to the following schedule:

* 1000 ms after the `worker.start()` function is called
* If the promise **rejects** or returns a **truthy** value, the worker will sleep for it's configured `sleepMs` period before invoking the `payload`
* If the promise returns a **falsey** value the worker will sleep for 1000 ms before invoking the `payload`

When invoked, the `payload` will be provided with a single argument; an object containing the following:

| Property | Type | Description |
|----------|------|-------------|
| `label` | `String` | The worker label that was provided on construction |
| `ordinal` | `Number` | An integer indicating how many times the payload has been executed |
| `timeoutMs` | `Number` | The number of milliseconds the worker will wait for this invocation to return |

### `options`

The `options` can contain:

| Property | Type | Description |
|----------|------|-------------|
| `sleepMs` | `Number` | How long do we pause between runs? (in milliseconds) |
| `timeoutMs` | `Number` | How long do we wait (in milliseconds) for the run promise to resolve/reject? See important notes below! |

Note that the `timeoutMs` provided forces the end of a cycle (and allows the next run to be scheduled) but does not (and cannot?) terminate the still-running promise.
If the promise returned by the `payload` function has errored internally (without resolving or rejecting) then that's OK; the schedule timeout will prevent the worker from stalling forever.
_But_ if the promise returned is still doing work, there's the possibility we'll end up with **multiple instances** of the payload executing in tandem.
This is almost certainly a Bad Thing, but that's up to you.


The take away:

* Make sure your worker promises always resolve
* Probably set a fairly long `timeoutMs` value


Usage
--------------------------------------------------------------------------------

### Examples

A simple example:

```js
const Worker = require('@thinkmill/node-worker');

const myWorker = new Worker(
  'test-worker',
  ({ label, ordinal, timeoutMs }) => {
    return new Promise((resolve, reject) => {
      const takeMs = 4000 + (Math.random() * 1500);
      console.log(`Run #${ordinal} ..
        will take ${takeMs} ms`);
      setTimeout(() => {
        console.log(`Run #${ordinal} ..
          resolving`);
        resolve(true);
      }, takeMs);
    });
  }, {
    sleepMs: 5000,
    timeoutMs: 5 * 1000,
  }
);

myWorker.start();
```

A more realistic/interesting example, processing items in a queue:

```js
const Worker = require('@thinkmill/node-worker');
const debug = require('debug')('workers:dequeue-things');
const Model = require('../models/queuedThings');

// Manage the dequeuing of things
const payload = async ({ label, ordinal, timeoutMs }) => {
  const runForMs = timeoutMs - 1000;
  const runUntil = new Date(Date.now() + runForMs);

  debug(`Running for ${runForMs} ms (until ${runUntil.toISOString()})`);

  return new Promise(async (resolve, reject) => {
    let processedCount = 0;
    let queueEmptied = false;
    let nextThing;

    try {
      do {
        await knex.transaction(async (trx) => {

          // Get the next thing from the queue
          nextThing = await Model.query(trx).findOne('isReady', true).whereNull('processedAt').orderBy('queuedAt');

          // The queue is empty; exit early
          if (!nextThing) {
            queueEmptied = true;
            return;
          }

          // Do whatever it is that things do
          // ..

          // Record that we've processed this thing
          await Model.query(trx).update({ processedAt: new Date() }).where({ id: nextThing.id });

          // Inc. our count
          processedCount++;
        });
      }
      while (new Date() < runUntil);
    }
    catch (err) {
      return reject(err);
    }

    // Output some debug info
    const summaryMsg = `DONE: ${processedCount} things processed, leaving the queue ${queueEmptied ? 'EMPTY' : 'NOT EMPTY'}`;
    debug(summaryMsg);

    // Resolve with a boolean indicating whether the payload should be re-invoked soon or after the normal sleep
    return resolve(queueEmptied);
  });
};

// Create the worker instance and start it
const worker = new Worker('dequeue-things', payload, { sleepMs: 60 * 1000 });
worker.start();
```

### Debug

We use the [`debug`](https://www.npmjs.com/package/debug) package internally.
Entries scoped to `workers:${label}` (where `label` is that supplied on construction).
It's probably helpful to follow this pattern in your own `payload` functions.

Output can be enabled by supplying a scope (or list of scopes) to output in the `DEBUG` env var.
This can include wildcards. Eg

```sh
# All worker debug
DEBUG=workers:* yarn start

# Debug for a specific worker
DEBUG=workers:send-notifications yarn start

# Debug for several specific workers
DEBUG=workers:send-notifications,workers:send-emails yarn start
```


License
--------------------------------------------------------------------------------

BSD Licensed.
Copyright (c) Thinkmill 2018.
