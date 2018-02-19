## Worker framework

A simple, promise-based, worker framework.

### Install
```
$ yarn add @thinkmill/node-worker
```

### Constructor
`label`: A label that describes the worker (used it logs, errors, etc)  
`runFn`: A promise-returning function that is executed on schedule (received the run ordinal)  
options: {  
  `sleepMs`: How long do we pause between runs? (in milliseconds)  
  `timeoutMs`: How long do we wait for the run promise to resolve/reject? (in milliseconds)  
}

### Notes
**Timeouts**

Note that the `timeoutMs` provided forces the end of a cycle (and allows the next run to be scheduled) but does not (and cannot?) terminate the still-running promise. If the main promise has errored internally somehow, without resolving, then that's fine; the schedule timeout will prevent the worker from stalling forever. But if the main promise is still working, there's the possibility we'll end up with multiple instances of the main "run promise" executing in tandem.

The take away:
- Make sure your worker promises always resolve
- Probably set a fairly long `timeoutMs` value

### Usage
```js
const myWorker = new Worker(
  'test-worker',
  (ordinal) => {
    return new Promise((resolve, reject) => {
      const takeMs = 4000 + (Math.random() * 1500);
      console.log(`Run #${ordinal} .. will take ${takeMs} ms`);
      setTimeout(() => {
        console.log(`Run #${ordinal} .. resolving`);
        resolve('done');
      }, takeMs);
    });
  }, {
    sleepMs: 5000,
    timeoutMs: 5 * 1000,
  }
);

myWorker.start();
```

### License
BSD Licensed. Copyright (c) Thinkmill 2018.
