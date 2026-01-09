const cluster = require('cluster');
const os = require('os');

const numCPUs = parseInt(process.env.WEB_CONCURRENCY) || os.cpus().length;

if (cluster.isPrimary) {
  console.log(`Primary ${process.pid} starting ${numCPUs} workers`);

  let scraperWorker = null;
  const httpWorkers = new Map(); // workerId -> worker

  // Start the shared scraper process
  scraperWorker = cluster.fork({ WORKER_TYPE: 'scraper' });
  
  scraperWorker.on('message', (msg) => {
    // Route response to specific worker if workerId present, else broadcast
    if (msg.workerId && httpWorkers.has(msg.workerId)) {
      httpWorkers.get(msg.workerId).send(msg);
    } else {
      // Broadcast to all HTTP workers
      for (const [, w] of httpWorkers) {
        w.send(msg);
      }
    }
  });

  // Start HTTP workers
  for (let i = 0; i < numCPUs; i++) {
    const httpWorker = cluster.fork({ WORKER_TYPE: 'http' });
    httpWorkers.set(httpWorker.id, httpWorker);
    
    httpWorker.on('message', (msg) => {
      // Add worker ID for routing responses back
      msg.workerId = httpWorker.id;
      if (scraperWorker && !scraperWorker.isDead()) {
        scraperWorker.send(msg);
      }
    });
  }

  cluster.on('exit', (worker) => {
    const type = worker.process.env?.WORKER_TYPE || 'http';
    console.log(`Worker ${worker.process.pid} (${type}) died. Restarting...`);
    
    if (type === 'scraper') {
      scraperWorker = cluster.fork({ WORKER_TYPE: 'scraper' });
      scraperWorker.on('message', (msg) => {
        if (msg.workerId && httpWorkers.has(msg.workerId)) {
          httpWorkers.get(msg.workerId).send(msg);
        } else {
          for (const [, w] of httpWorkers) w.send(msg);
        }
      });
    } else {
      httpWorkers.delete(worker.id);
      const httpWorker = cluster.fork({ WORKER_TYPE: 'http' });
      httpWorkers.set(httpWorker.id, httpWorker);
      httpWorker.on('message', (msg) => {
        msg.workerId = httpWorker.id;
        if (scraperWorker && !scraperWorker.isDead()) scraperWorker.send(msg);
      });
    }
  });
} else {
  if (process.env.WORKER_TYPE === 'scraper') {
    require('./scraperWorker.js');
  } else {
    require('./index.js');
  }
  console.log(`Worker ${process.pid} (${process.env.WORKER_TYPE}) started`);
}
