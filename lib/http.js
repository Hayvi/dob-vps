function noStore(res) {
    res.setHeader('Cache-Control', 'no-store');
}

module.exports = { noStore };
