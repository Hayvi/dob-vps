function unwrapSwarmData(raw) {
  if (!raw) return raw;
  if (raw.data && raw.data.data) return raw.data.data;
  return raw.data || raw;
}

module.exports = {
  unwrapSwarmData
};
