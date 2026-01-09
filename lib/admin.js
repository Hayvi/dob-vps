function requireAdmin(req, res, next) {
    if (process.env.NODE_ENV === 'production') {
        const adminKey = process.env.ADMIN_KEY;
        if (!adminKey || req.query.key !== adminKey) {
            return res.status(403).json({ error: 'Forbidden' });
        }
    }
    next();
}

function requireAdminIfConfigured(req, res, next) {
    const adminKey = process.env.ADMIN_KEY;
    if (adminKey && req.query.key !== adminKey) {
        return res.status(403).json({ error: 'Forbidden' });
    }
    next();
}

module.exports = { requireAdmin, requireAdminIfConfigured };
