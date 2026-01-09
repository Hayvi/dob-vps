const mongoose = require('mongoose');

const gameSchema = new mongoose.Schema({
    gameId: { type: Number, required: true, unique: true },
    sport: { type: String, required: true, index: true },
    type: { type: Number },
    region: { type: String },
    competition: { type: String },
    team1_name: { type: String },
    team2_name: { type: String },
    team1_id: { type: Number },
    team2_id: { type: Number },
    start_ts: { type: Number },
    market: { type: Object, default: {} }, // Flexible object for all markets
    info: { type: Object },
    last_updated: { type: Date, default: Date.now, index: true }
}, {
    minimize: false, // Ensure empty objects are saved
    timestamps: true
});

// Compound index for efficient sport-based queries
gameSchema.index({ sport: 1, last_updated: -1 });

module.exports = mongoose.model('Game', gameSchema);
