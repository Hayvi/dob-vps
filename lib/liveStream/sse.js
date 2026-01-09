function safeWrite(res, eventName, payload) {
  try {
    if (!res || res.writableEnded || res.destroyed) return false;
    res.write(`event: ${eventName}\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  } catch {
    return false;
  }
  return true;
}

function safePing(res) {
  try {
    if (!res || res.writableEnded || res.destroyed) return false;
    res.write(`: ping ${Date.now()}\n\n`);
  } catch {
    return false;
  }
  return true;
}

module.exports = {
  safeWrite,
  safePing
};
